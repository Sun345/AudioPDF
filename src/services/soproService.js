/**
 * soproService.js
 * Client service to interface with the local Sopro-v2-turbo TTS server.
 * Handles model health checks, voice profiles, voice cloning, and audio playback synchronization.
 */

class SoproService {
  constructor() {
    this.baseUrl = '/api';
    this.isServerAvailable = false;
    this.voices = [];
    this.audioElement = new Audio();
    this.currentVoiceId = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.currentText = '';
    this.currentWords = [];
    this.wordTimings = [];
    this.currentWordIndex = -1;
    this.playbackRate = 1.0;

    // Callbacks
    this.onWord = null;
    this.onSentence = null;
    this.onEnd = null;
    this.onStateChange = null;

    this._setupAudioListeners();
  }

  _setupAudioListeners() {
    this.audioElement.addEventListener('timeupdate', () => {
      if (!this.isPlaying || this.wordTimings.length === 0) return;
      const currentTime = this.audioElement.currentTime;

      // Find the word that corresponds to currentTime
      let activeIdx = -1;
      for (let i = 0; i < this.wordTimings.length; i++) {
        const wt = this.wordTimings[i];
        if (currentTime >= wt.start && currentTime <= wt.end) {
          activeIdx = i;
          break;
        } else if (currentTime > wt.end && (i === this.wordTimings.length - 1 || currentTime < this.wordTimings[i + 1].start)) {
          activeIdx = i;
        }
      }

      if (activeIdx !== -1 && activeIdx !== this.currentWordIndex) {
        this.currentWordIndex = activeIdx;
        if (this.onWord && this.currentWords[activeIdx]) {
          const w = this.currentWords[activeIdx];
          this.onWord(w.wordIdx, w.text, w.charStart);
        }
      }
    });

    this.audioElement.addEventListener('ended', () => {
      this.isPlaying = false;
      this.isPaused = false;
      if (this.onStateChange) this.onStateChange('idle');
      if (this.onEnd) this.onEnd();
    });

    this.audioElement.addEventListener('pause', () => {
      if (this.audioElement.currentTime < this.audioElement.duration && this.isPlaying) {
        this.isPaused = true;
        if (this.onStateChange) this.onStateChange('paused');
      }
    });

    this.audioElement.addEventListener('play', () => {
      this.isPlaying = true;
      this.isPaused = false;
      if (this.onStateChange) this.onStateChange('speaking');
    });

    this.audioElement.addEventListener('error', (e) => {
      console.error('Audio playback error:', e);
      this.isPlaying = false;
      this.isPaused = false;
      if (this.onStateChange) this.onStateChange('idle');
    });
  }

  /**
   * Check if local Sopro backend is running.
   */
  async checkHealth() {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { method: 'GET', signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        const data = await res.json();
        this.isServerAvailable = true;
        return { available: true, data };
      }
    } catch (err) {
      // Backend not running or unreachable
      this.isServerAvailable = false;
    }
    return { available: false, error: 'Sopro server offline' };
  }

  /**
   * Fetch all cloned voices from local server.
   */
  async getVoices() {
    try {
      const res = await fetch(`${this.baseUrl}/voices`);
      if (res.ok) {
        const data = await res.json();
        this.voices = data.voices || [];
        return this.voices;
      }
    } catch (err) {
      console.warn('Failed to fetch Sopro voices:', err);
    }
    return [];
  }

  /**
   * Clone a new voice by uploading a 5-20s audio clip or recording blob.
   */
  async cloneVoice(name, audioBlob, filename = 'voice_sample.wav') {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('audio', audioBlob, filename);

    const res = await fetch(`${this.baseUrl}/clone`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to clone voice' }));
      throw new Error(err.detail || 'Voice cloning failed');
    }

    const voice = await res.json();
    await this.getVoices();
    return voice;
  }

  /**
   * Synthesize text using selected Sopro voice and start synchronized playback.
   * @param {string} text The text to speak
   * @param {Array} words Array of word tokens from current page/sentence
   * @param {string} voiceId ID of cloned voice
   * @param {number} rate Playback speed (0.5 - 2.0)
   */
  async speak(text, words = [], voiceId = null, rate = 1.0) {
    this.stop();
    this.currentText = text;
    this.currentWords = words;
    this.currentVoiceId = voiceId || (this.voices[0] ? this.voices[0].id : 'narrator');
    this.playbackRate = rate;

    if (this.onStateChange) this.onStateChange('loading');

    try {
      const res = await fetch(`${this.baseUrl}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          voice_id: this.currentVoiceId,
          speed: this.playbackRate
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Synthesis failed' }));
        throw new Error(err.detail || 'Speech synthesis failed');
      }

      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);

      // Extract server timing header if available
      const timingHeader = res.headers.get('X-Word-Timings');
      if (timingHeader) {
        try {
          this.wordTimings = JSON.parse(timingHeader);
        } catch (e) {
          this.wordTimings = [];
        }
      }

      this.audioElement.src = audioUrl;
      this.audioElement.playbackRate = 1.0; // Rate is already synthesized or handled

      // Wait for audio metadata to get exact duration
      await new Promise((resolve) => {
        this.audioElement.onloadedmetadata = () => resolve();
        setTimeout(resolve, 800); // Fallback timeout
      });

      // If no explicit word timings from backend, compute weighted proportional timings based on word characters
      if (!this.wordTimings || this.wordTimings.length !== words.length) {
        this._computeWordTimings(words, this.audioElement.duration || 2.0);
      }

      this.currentWordIndex = -1;
      this.isPlaying = true;
      this.isPaused = false;
      await this.audioElement.play();
      if (this.onStateChange) this.onStateChange('speaking');
    } catch (err) {
      console.error('Sopro speech error:', err);
      this.isPlaying = false;
      this.isPaused = false;
      if (this.onStateChange) this.onStateChange('idle');
      throw err;
    }
  }

  /**
   * Proportionally map word timings across the total audio duration
   * using character length weighting for accurate highlighting synchronization.
   */
  _computeWordTimings(words, totalDuration) {
    if (!words || words.length === 0) {
      this.wordTimings = [];
      return;
    }

    const totalWeight = words.reduce((acc, w) => {
      const len = (w.text || '').trim().length;
      // Add extra weight for punctuation pauses
      const hasPunctuation = /[.,!?;:]$/.test(w.text || '');
      return acc + Math.max(1, len) + (hasPunctuation ? 2 : 0);
    }, 0);

    let currentTime = 0.05; // Short lead-in
    const usableDuration = Math.max(0.2, totalDuration - 0.1);

    this.wordTimings = words.map((w) => {
      const len = (w.text || '').trim().length;
      const hasPunctuation = /[.,!?;:]$/.test(w.text || '');
      const weight = Math.max(1, len) + (hasPunctuation ? 2 : 0);
      const wordDuration = (weight / totalWeight) * usableDuration;
      const start = currentTime;
      const end = start + wordDuration;
      currentTime = end;
      return {
        wordIdx: w.wordIdx,
        text: w.text,
        start: start,
        end: end
      };
    });
  }

  pause() {
    if (this.isPlaying && !this.isPaused) {
      this.audioElement.pause();
    }
  }

  resume() {
    if (this.isPlaying && this.isPaused) {
      this.audioElement.play();
    }
  }

  stop() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      if (this.audioElement.src) {
        URL.revokeObjectURL(this.audioElement.src);
        this.audioElement.removeAttribute('src');
      }
    }
    this.isPlaying = false;
    this.isPaused = false;
    this.currentWordIndex = -1;
    if (this.onStateChange) this.onStateChange('idle');
  }

  setSpeed(rate) {
    this.playbackRate = rate;
    if (this.audioElement && this.isPlaying) {
      this.audioElement.playbackRate = rate;
    }
  }
}

export const soproService = new SoproService();
