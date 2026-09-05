"""
server/app.py
FastAPI backend for Sopro-v2-turbo TTS model running on CPU.
Supports zero-shot voice cloning, voice management, and speech synthesis.
"""

import os
import io
import json
import time
import uuid
import logging
from pathlib import Path
from typing import Optional, List, Dict

# Inject Windows root trust store for SSL certificates
try:
    import truststore
    truststore.inject_into_ssl()
except Exception as e:
    pass

os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import soundfile as sf
import numpy as np
import torch

from sopro import SoproTTS, Reference

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sopro_server")

# Base directories
BASE_DIR = Path(__file__).resolve().parent
VOICES_DIR = BASE_DIR / "voices"
VOICES_DIR.mkdir(parents=True, exist_ok=True)
VOICES_FILE = VOICES_DIR / "voices.json"

app = FastAPI(
    title="Sopro V2 Turbo CPU Server",
    description="Local zero-shot voice cloning TTS engine running on CPU",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model state
tts_model: Optional[SoproTTS] = None
# Cache extracted voice reference embeddings: { voice_id: Reference }
cached_references: Dict[str, Reference] = {}


def get_tts_model() -> SoproTTS:
    """Lazy/singleton loader for SoproTTS CPU model."""
    global tts_model
    if tts_model is None:
        logger.info("Initializing Sopro-v2-turbo on CPU...")
        tts_model = SoproTTS.from_pretrained("samuel-vitorino/sopro-v2-turbo", device="cpu")
        logger.info("Sopro-v2-turbo loaded successfully! Sample rate: %s", tts_model.sample_rate)
    return tts_model


def load_voices_metadata() -> List[Dict]:
    """Load voices list from json file or create default if not exists."""
    if not VOICES_FILE.exists():
        initial_voices = [
            {
                "id": "narrator",
                "name": "Default Narrator",
                "isDefault": True,
                "createdAt": "2026-09-05T00:00:00.000Z",
                "filename": "narrator.wav"
            }
        ]
        save_voices_metadata(initial_voices)
        return initial_voices

    try:
        with open(VOICES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_voices_metadata(voices: List[Dict]):
    """Save voices list to json file."""
    with open(VOICES_FILE, "w", encoding="utf-8") as f:
        json.dump(voices, f, indent=2, ensure_ascii=False)


def get_voice_reference(voice_id: str) -> Optional[Reference]:
    """Retrieve cached Reference embedding or compute and cache it."""
    if voice_id in cached_references:
        return cached_references[voice_id]

    voices = load_voices_metadata()
    voice = next((v for v in voices if v["id"] == voice_id), None)
    if not voice:
        # Fallback to default voice if requested ID not found
        voice = next((v for v in voices if v.get("isDefault")), None)
        if not voice and len(voices) > 0:
            voice = voices[0]

    if not voice:
        return None

    wav_path = VOICES_DIR / voice["filename"]
    if not wav_path.exists():
        logger.warning(f"Voice audio file not found at {wav_path}")
        return None

    try:
        tts = get_tts_model()
        logger.info(f"Computing speaker reference embedding for '{voice['name']}' ({wav_path.name})...")
        ref = tts.prepare_reference(ref_audio_path=str(wav_path))
        cached_references[voice["id"]] = ref
        return ref
    except Exception as e:
        logger.error(f"Failed to prepare reference for {voice_id}: {e}")
        return None


class SynthesizeRequest(BaseModel):
    text: str
    voice_id: Optional[str] = "narrator"
    speed: Optional[float] = 1.0


@app.on_event("startup")
async def startup_event():
    """Ensure starter voice sample exists and preload model."""
    voices = load_voices_metadata()
    default_wav = VOICES_DIR / "narrator.wav"

    # If narrator.wav does not exist yet, create a clean vocal reference
    if not default_wav.exists():
        logger.info("Generating starter reference audio...")
        # Create a clean reference tone / waveform if needed
        sr = 24000
        duration = 5.0
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)
        # Gentle harmonic vocal formant simulator for initial reference
        vocal = 0.3 * np.sin(2 * np.pi * 130 * t) + \
                0.2 * np.sin(2 * np.pi * 260 * t) + \
                0.1 * np.sin(2 * np.pi * 520 * t)
        envelope = np.ones_like(t)
        envelope[:1000] = np.linspace(0, 1, 1000)
        envelope[-1000:] = np.linspace(1, 0, 1000)
        vocal = (vocal * envelope).astype(np.float32)
        sf.write(str(default_wav), vocal, sr)

    try:
        # Preload model in background or on startup
        get_tts_model()
    except Exception as e:
        logger.error(f"Error during model initialization: {e}")


@app.get("/api/health")
def health():
    """System health check endpoint."""
    is_loaded = tts_model is not None
    voices = load_voices_metadata()
    return {
        "status": "online",
        "model": "samuel-vitorino/sopro-v2-turbo",
        "device": "cpu",
        "modelLoaded": is_loaded,
        "voicesCount": len(voices)
    }


@app.get("/api/voices")
def get_voices():
    """Get all available cloned voices."""
    voices = load_voices_metadata()
    return {"voices": voices}


@app.get("/api/voices/{voice_id}/sample")
def get_voice_sample(voice_id: str):
    """Serve sample audio file for a voice."""
    voices = load_voices_metadata()
    voice = next((v for v in voices if v["id"] == voice_id), None)
    if not voice:
        raise HTTPException(status_code=404, detail="Voice not found")

    wav_path = VOICES_DIR / voice["filename"]
    if not wav_path.exists():
        raise HTTPException(status_code=404, detail="Audio sample file not found")

    return FileResponse(path=str(wav_path), media_type="audio/wav")


@app.post("/api/clone")
async def clone_voice(
    name: str = Form(...),
    audio: UploadFile = File(...)
):
    """
    Upload reference audio clip and create a new cloned voice profile.
    Accepts 5-20s .wav/.mp3/.m4a/.ogg audio files.
    """
    clean_name = name.strip()
    if len(clean_name) < 2:
        raise HTTPException(status_code=400, detail="Voice name must be at least 2 characters")

    voice_id = f"voice_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    dest_filename = f"{voice_id}.wav"
    dest_path = VOICES_DIR / dest_filename

    # Read uploaded bytes and save as clean WAV
    try:
        audio_bytes = await audio.read()
        # Read with soundfile to normalize sample rate and format
        data, samplerate = sf.read(io.BytesIO(audio_bytes))

        # Check duration
        duration = len(data) / samplerate
        logger.info(f"Uploaded audio duration: {duration:.2f} seconds ({len(audio_bytes)} bytes)")

        # Save normalized WAV
        sf.write(str(dest_path), data, samplerate)

        # Pre-compute speaker embedding with Sopro
        tts = get_tts_model()
        ref = tts.prepare_reference(ref_audio_path=str(dest_path))
        cached_references[voice_id] = ref
        logger.info(f"Speaker embedding successfully extracted for '{clean_name}'")

    except Exception as e:
        if dest_path.exists():
            dest_path.unlink()
        logger.error(f"Error processing voice upload: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid audio format or processing error: {str(e)}")

    voices = load_voices_metadata()
    new_voice = {
        "id": voice_id,
        "name": clean_name,
        "isDefault": False,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "filename": dest_filename
    }
    voices.append(new_voice)
    save_voices_metadata(voices)

    return new_voice


@app.delete("/api/voices/{voice_id}")
def delete_voice(voice_id: str):
    """Delete a user-created cloned voice."""
    voices = load_voices_metadata()
    voice = next((v for v in voices if v["id"] == voice_id), None)
    if not voice:
        raise HTTPException(status_code=404, detail="Voice not found")

    if voice.get("isDefault"):
        raise HTTPException(status_code=400, detail="Cannot delete default built-in voice")

    # Remove audio file
    wav_path = VOICES_DIR / voice["filename"]
    if wav_path.exists():
        try:
            wav_path.unlink()
        except Exception:
            pass

    # Evict cached embedding
    if voice_id in cached_references:
        del cached_references[voice_id]

    voices = [v for v in voices if v["id"] != voice_id]
    save_voices_metadata(voices)
    return {"status": "deleted", "id": voice_id}


@app.post("/api/synthesize")
def synthesize(req: SynthesizeRequest):
    """
    Synthesize text using cloned voice reference on CPU.
    Returns 24kHz WAV audio stream.
    """
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    tts = get_tts_model()
    ref = get_voice_reference(req.voice_id)

    logger.info(f"Synthesizing text ({len(text)} chars) with voice_id '{req.voice_id}' on CPU...")
    start_time = time.time()

    try:
        # SoproTTS synthesize on CPU
        if ref is not None:
            wav_tensor = tts.synthesize(text=text, ref=ref)
        else:
            wav_tensor = tts.synthesize(text=text)

        elapsed = time.time() - start_time
        logger.info(f"Synthesized speech in {elapsed:.2f}s on CPU")

        # Convert torch tensor to WAV bytes
        if isinstance(wav_tensor, torch.Tensor):
            wav_data = wav_tensor.detach().cpu().numpy()
        else:
            wav_data = np.array(wav_tensor)

        # Handle 1D or 2D tensor
        if wav_data.ndim > 1:
            wav_data = wav_data.squeeze()

        # Normalize to float32 range [-1, 1]
        max_val = np.max(np.abs(wav_data))
        if max_val > 1.0:
            wav_data = wav_data / max_val

        out_buffer = io.BytesIO()
        sf.write(out_buffer, wav_data, tts.sample_rate, format='WAV')
        out_buffer.seek(0)

        wav_bytes = out_buffer.getvalue()
        duration = len(wav_data) / tts.sample_rate

        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "Content-Disposition": "inline; filename=speech.wav",
                "X-Audio-Duration": str(round(duration, 3)),
                "X-Audio-Sample-Rate": str(tts.sample_rate)
            }
        )

    except Exception as e:
        logger.error(f"Synthesis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server.app:app", host="127.0.0.1", port=8000, reload=True)
