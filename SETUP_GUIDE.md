# AudioPDF + Sopro-v2-turbo Complete Setup Guide (From Scratch)

This step-by-step guide will walk you through setting up **AudioPDF** with local zero-shot voice cloning powered by **Sopro-v2-turbo** running entirely on your **CPU**.

---

## Prerequisites

Make sure the following tools are installed on your machine:

1. **Node.js** (v18 or higher recommended)
   - Download: [nodejs.org](https://nodejs.org/)
   - Verify in terminal:
     ```bash
     node -v
     npm -v
     ```

2. **Python** (v3.10, 3.11, or 3.12 64-bit recommended)
   - Download: [python.org](https://www.python.org/downloads/)
   - ⚠️ **Important during Python installation on Windows**: Check the box **"Add Python to PATH"**.
   - Verify in terminal:
     ```bash
     python --version
     pip --version
     ```

3. **Git**
   - Download: [git-scm.com](https://git-scm.com/)

---

## Step 1: Clone the Repository & Checkout Branch

Open your terminal (PowerShell, Command Prompt, or Bash) and clone the repository:

```bash
git clone https://github.com/Sun345/AudioPDF.git
cd AudioPDF
```

Switch to the **`Sopro-V2-Voices`** branch:

```bash
git checkout Sopro-V2-Voices
```

---

## Step 2: Install Frontend Dependencies

Inside the project root directory, install all Node dependencies:

```bash
npm install
```

This installs Vite, PDF.js (`pdfjs-dist`), and required build tools.

---

## Step 3: Install Python Backend Dependencies

Install the required Python packages for the Sopro-v2-turbo CPU engine and FastAPI backend:

```bash
pip install -r server/requirements.txt truststore pip-system-certs
```

> **What gets installed:**
> - `sopro` (v2.2.0): SoproTTS model architecture and voice cloning engine.
> - `torch` & `torchaudio`: PyTorch runtime (CPU-optimized).
> - `fastapi` & `uvicorn`: Lightweight, asynchronous local REST server.
> - `python-multipart`: Audio file upload parsing.
> - `soundfile` & `scipy`: Audio normalization and 24kHz WAV streaming.
> - `truststore` & `pip-system-certs`: Uses the Windows system certificate store for secure and uninterrupted Hugging Face downloads without corporate SSL errors.

---

## Step 4: Download Sopro-v2-turbo Model Weights (One-Time)

Sopro-v2-turbo weights (~240 MB) download directly from Hugging Face (`samuel-vitorino/sopro-v2-turbo`) and are cached locally on your machine at `~/.cache/huggingface/hub/`.

To download and test the model weights on your CPU, run this one-line command:

```bash
python -c "import truststore; truststore.inject_into_ssl(); from sopro import SoproTTS; print('Downloading/Loading Sopro-v2-turbo on CPU...'); tts = SoproTTS.from_pretrained('samuel-vitorino/sopro-v2-turbo', device='cpu'); print('✓ Model ready! Sample rate:', tts.sample_rate)"
```

Expected output:
```text
Downloading/Loading Sopro-v2-turbo on CPU...
Fetching 6 files: 100%|██████████| 6/6
✓ Model ready! Sample rate: 24000
```

> **Note**: Subsequent loads will load directly from your local cache with 0 download wait time!

---

## Step 5: Start the Sopro Backend Server

The backend runs on `http://127.0.0.1:8000`. You can start it using any of these methods:

### Option A: Using npm script (Recommended)
```bash
npm run sopro
```

### Option B: Windows double-click batch file
Double-click [`start_sopro.bat`](file:///c:/Users/sabhishek/Desktop/PDFReader/start_sopro.bat) in the project folder.

### Option C: Direct Python command
```bash
python -m uvicorn server.app:app --host 127.0.0.1 --port 8000 --reload
```

When started, you will see:
```text
INFO:sopro_server:Sopro-v2-turbo loaded successfully! Sample rate: 24000
INFO: Application startup complete.
INFO: Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

To verify the backend health in another terminal:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health"
```
Output:
```json
{
  "status": "online",
  "model": "samuel-vitorino/sopro-v2-turbo",
  "device": "cpu",
  "modelLoaded": true,
  "voicesCount": 1
}
```

---

## Step 6: Start the Frontend Web App

In a second terminal window in the project folder, start the Vite development server:

```bash
npm run dev
```

Output:
```text
  VITE v6.x ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

Open your browser and navigate to:
👉 **`http://localhost:5173/`**

---

## Step 7: Using the App & Cloning Voices

### 1. Cloned Voice Selection
- In the bottom playback bar, click the voice dropdown.
- You will see voices categorized into two groups:
  - 🌟 **Sopro Local Cloned Voices (CPU)**: `Default Narrator`, and any custom cloned voices you create.
  - 🖥️ **System Voices (Web Speech API)**: Your operating system's built-in voices.

### 2. How to Clone Any Voice
1. Click the **"✨ Clone Voice"** button in the bottom control bar.
2. Enter a name for the voice (e.g., *"My Voice"*, *"Morgan Freeman"*, *"Professor"*).
3. Choose either cloning method:
   - **🎙️ Record Microphone**: Click **"Start Recording"**, speak naturally for 5–15 seconds, then click **"Stop Recording"**. Preview your recording before saving.
   - **📁 Upload Audio File**: Drag & drop or browse a 5–20 second `.wav`, `.mp3`, `.m4a`, or `.ogg` audio clip.
4. Click **"✨ Clone Voice"**. Sopro-v2-turbo will extract the speaker embeddings on CPU and automatically register your new voice in the dropdown!
5. Close the popup by clicking **✕**, **Cancel**, clicking outside the box, or pressing the **Escape** key.

### 3. Reading PDF Documents
- Tap **Play** (or spacebar) to listen to the entire page.
- **Click-to-Speak**: Click or tap **any word** on the PDF document or teleprompter view to jump playback to that exact word.
- Words will light up with a glowing animated highlight in real time as they are spoken.
- Toggle between **Document View**, **Focus Teleprompter View**, and **Split View**.
- Choose between **Dark Mode**, **Sepia Mode**, and **Light Mode**.

---

## Project Structure Overview

```text
AudioPDF/
├── package.json              # Frontend scripts (dev, build, preview, sopro)
├── vite.config.js            # Vite config with /api proxy to port 8000
├── index.html                # Main application UI
├── start_sopro.bat           # 1-click Windows backend launcher
├── SETUP_GUIDE.md            # This setup guide
│
├── server/                   # Sopro-v2-turbo CPU Backend
│   ├── app.py                # FastAPI endpoints (health, clone, synthesize, voices)
│   ├── requirements.txt      # Python dependencies
│   └── voices/               # Saved voice audio samples and embeddings
│       ├── voices.json       # Registry of cloned voices
│       └── narrator.wav      # Default narrator sample
│
└── src/                      # Frontend Source Code
    ├── main.js               # Application orchestrator
    ├── styles/main.css       # Obsidian glassmorphic design system
    ├── services/
    │   ├── pdfService.js     # Mozilla PDF.js rendering & word hitboxes
    │   ├── soproService.js   # Client service for Sopro CPU audio & highlight sync
    │   └── ttsService.js     # Web Speech API fallback engine
    └── components/
        ├── cloneVoiceModal.js# Interactive voice recording & upload modal
        ├── player.js         # Bottom playback bar with voice selector
        ├── toolbar.js        # Zoom, theme, and view mode controls
        └── sidebar.js        # Thumbnails and document outlines
```

---

## Troubleshooting

### Q1: "Failed to fetch" or "Sopro server offline"
- Ensure the backend server is running in a terminal:
  ```bash
  npm run sopro
  ```
- Verify `http://127.0.0.1:8000/api/health` returns status `online`.

### Q2: SSL Certificate Error while downloading model on Windows
- If downloading from Hugging Face fails with `[SSL: CERTIFICATE_VERIFY_FAILED]`, run:
  ```bash
  pip install truststore pip-system-certs
  ```
- This configures Python to trust your Windows Root Certificate Authority.

### Q3: Microphone access blocked
- Ensure your browser has permission to access the microphone for `localhost`. Look for the microphone icon in your browser's address bar and select **"Always Allow"**.

### Q4: Port 8000 or 5173 is already in use
- If port 8000 is occupied, you can specify a different port in `server/app.py` and update the proxy port in `vite.config.js`.

---

Enjoy listening to your PDFs with real-time cloned voices! 🎧📖
