/**
 * soproService.js
 * Client service to interface with the local Sopro-v2-turbo TTS server.
 * Features high-precision 60 FPS requestAnimationFrame synchronization,
 * sentence-by-sentence queueing with zero cumulative drift,
 * and calibrated acoustic latency lead compensation.
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
    this.playbackRate = 1.0;

    // Page and recording management
    this.currentPageNum = 1;
    this.currentDocName = 'Document';
    this.currentWords = [];
    this.wordTimings = [];
    this.currentWordIndex = -1;
    this.lastPageRecording = null;
    this.lastCompletedRecording = null;

    // 60 FPS Animation loop for real-time word highlighting
    this.animFrameId = null;

    // Latency lead compensation in seconds
    this.leadOffset = 0.14;

    // Callbacks
    this.onWord = null;
    this.onSentence = null;
    this.onEnd = null;
    this.onPageComplete = null;
    this.onStateChange = null;

    this._setupAudioListeners();
  }

  _setupAudioListeners() {
    this.audioElement.addEventListener('ended', () => {
      this._stopHighlightLoop();
      this.isPlaying = false;
      this.isPaused = false;

      // When whole page reading completes, emit page recording for immediate download
      if (this.lastPageRecording) {
        this.lastCompletedRecording = { ...this.lastPageRecording };
        if (this.onPageComplete) {
          this.onPageComplete(this.lastCompletedRecording);
        }
      }

      if (this.onStateChange) this.onStateChange('idle');
      if (this.onEnd) this.onEnd();
    });

    this.audioElement.addEventListener('pause', () => {
      if (this.audioElement.currentTime < this.audioElement.duration && this.isPlaying) {
        this.isPaused = true;
        this._stopHighlightLoop();
        if (this.onStateChange) this.onStateChange('paused');
      }
    });

    this.audioElement.addEventListener('play', () => {
      this.isPlaying = true;
      this.isPaused = false;
      this._startHighlightLoop();
      if (this.onStateChange) this.onStateChange('speaking');
    });

    this.audioElement.addEventListener('error', (e) => {
      console.error('Sopro audio playback error:', e);
      this._stopHighlightLoop();
      this.isPlaying = false;
      this.isPaused = false;
      if (this.onStateChange) this.onStateChange('idle');
    });
  }

  /**
   * 60 FPS high-frequency tracking loop using requestAnimationFrame.
   * Eliminates the native HTML5 audio 250ms timeupdate lag completely.
   */
  _startHighlightLoop() {
    this._stopHighlightLoop();

    const loop = () => {
      if (!this.isPlaying || this.isPaused) return;

      if (this.wordTimings.length > 0) {
        // Compensate with lead offset so highlight changes at acoustic onset
        const currentTime = (this.audioElement.currentTime * this.playbackRate) + this.leadOffset;

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
          const w = this.currentWords[activeIdx];
          if (w && this.onWord) {
            this.onWord(w.wordIdx, w.text, w.charStart);
          }
        }
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  _stopHighlightLoop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
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
   * Start reading whole page in one go using Sopro cloned voice (no sentence splitting).
   * Synthesizes page text in a single pass as MP3 and persists page recording.
   * @param {string} text Full text to read
   * @param {Array} words Array of word objects for the page
   * @param {string} voiceId Voice profile ID
   * @param {number} rate Speed multiplier (0.75 - 2.0)
   * @param {number} pageNum Page number
   * @param {string} docName Document name
   */
  async speak(text, words = [], voiceId = null, rate = 1.0, pageNum = 1, docName = 'Document') {
    this.stop();
    this.currentVoiceId = voiceId || (this.voices[0] ? this.voices[0].id : 'narrator');
    this.playbackRate = rate;
    this.currentPageNum = pageNum || 1;
    this.currentDocName = docName || 'Document';
    this.currentWords = words;
    this.wordTimings = [];
    this.currentWordIndex = -1;

    if (!words || words.length === 0 || !text || !text.trim()) return;

    this.isPlaying = true;
    this.isPaused = false;
    if (this.onStateChange) this.onStateChange('loading');

    try {
      // Synthesize whole page in one single go as MP3
      const res = await fetch(`${this.baseUrl}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          voice_id: this.currentVoiceId,
          speed: this.playbackRate,
          page_num: this.currentPageNum,
          doc_name: this.currentDocName,
          format: 'mp3'
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Synthesis failed' }));
        throw new Error(err.detail || 'Speech synthesis failed');
      }

      if (!this.isPlaying) return;

      const durationHeader = parseFloat(res.headers.get('X-Audio-Duration')) || 0;
      const recId = res.headers.get('X-Recording-Id');
      const recFilename = res.headers.get('X-Recording-Filename');
      const voiceName = res.headers.get('X-Recording-Voice') || 'Voice';

      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);

      this.lastPageRecording = {
        id: recId,
        pageNum: this.currentPageNum,
        docName: this.currentDocName,
        voiceName: voiceName,
        voiceId: this.currentVoiceId,
        duration: durationHeader,
        filename: recFilename,
        blob: blob,
        audioUrl: audioUrl,
        createdAt: new Date().toISOString()
      };

      if (!this.isPlaying) {
        URL.revokeObjectURL(audioUrl);
        return;
      }

      if (this.audioElement.src && !this.audioElement.src.startsWith('data:')) {
        URL.revokeObjectURL(this.audioElement.src);
      }

      this.audioElement.src = audioUrl;
      this.audioElement.playbackRate = 1.0;

      await new Promise((resolve) => {
        this.audioElement.onloadedmetadata = () => resolve();
        setTimeout(resolve, 600);
      });

      const totalDuration = this.audioElement.duration || durationHeader || 2.0;
      this.lastPageRecording.duration = totalDuration;

      // Calibrate word-level timings across the whole page's duration
      this._computeWordTimings(words, totalDuration);

      if (!this.isPlaying) return;

      await this.audioElement.play();
      this._startHighlightLoop();
      if (this.onStateChange) this.onStateChange('speaking');

    } catch (err) {
      console.error('Sopro page synthesis error:', err);
      this.stop();
      throw err;
    }
  }

  /**
   * Proportionally compute word timings using syllable clustering,
   * consonant weights, and acoustic lead-in / trailing silence calibration.
   */
  _computeWordTimings(words, totalDuration) {
    if (!words || words.length === 0) {
      this.wordTimings = [];
      return;
    }

    // Measure syllable weight per word
    const weights = words.map((w) => {
      const clean = (w.text || '').replace(/[^a-zA-Z0-9]/g, '');
      const len = Math.max(1, clean.length);
      // Estimate syllables by vowel groups
      const vowelMatches = clean.match(/[aeiouy]+/gi);
      const syllables = vowelMatches ? vowelMatches.length : Math.max(1, Math.round(len / 3));

      // Base weight: syllable count heavily drives spoken time
      let weight = syllables * 1.6 + len * 0.25;

      // Add small pauses for punctuation
      const text = (w.text || '').trim();
      if (/[.!?]$/.test(text)) {
        weight += 1.2; // Sentence pause
      } else if (/[,;:]$/.test(text)) {
        weight += 0.6; // Comma pause
      }

      return Math.max(0.8, weight);
    });

    const totalWeight = weights.reduce((acc, w) => acc + w, 0);

    // Sopro audio typically starts with ~0.04s lead-in and ~0.08s trailing decay
    const leadIn = 0.04;
    const trailingDecay = 0.08;
    const speechSpan = Math.max(0.2, totalDuration - leadIn - trailingDecay);

    let currentTime = leadIn;
    this.wordTimings = words.map((w, idx) => {
      const duration = (weights[idx] / totalWeight) * speechSpan;
      const start = currentTime;
      const end = start + duration;
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
      this._stopHighlightLoop();
    }
  }

  resume() {
    if (this.isPlaying && this.isPaused) {
      this.audioElement.play();
      this._startHighlightLoop();
    }
  }

  stop() {
    this._stopHighlightLoop();
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
    this.currentWords = [];
    this.wordTimings = [];
    this.currentWordIndex = -1;
    if (this.onStateChange) this.onStateChange('idle');
  }

  setSpeed(rate) {
    this.playbackRate = rate;
  }

  /**
   * Jump relative sentence forward or backward by seeking in the page audio stream.
   */
  skipSentence(direction) {
    if (!this.isPlaying || !this.wordTimings || this.wordTimings.length === 0) return;
    const curIdx = this.currentWordIndex >= 0 ? this.currentWordIndex : 0;
    let targetWordIdx = -1;

    if (direction > 0) {
      for (let i = curIdx; i < this.currentWords.length - 1; i++) {
        if (/[.?!]$/.test((this.currentWords[i].text || '').trim())) {
          targetWordIdx = i + 1;
          break;
        }
      }
      if (targetWordIdx === -1) targetWordIdx = this.currentWords.length - 1;
    } else {
      for (let i = curIdx - 1; i >= 0; i--) {
        if (/[.?!]$/.test((this.currentWords[i].text || '').trim())) {
          targetWordIdx = i + 1;
          break;
        }
      }
      if (targetWordIdx === -1) targetWordIdx = 0;
    }

    if (targetWordIdx >= 0 && targetWordIdx < this.wordTimings.length) {
      const targetTiming = this.wordTimings[targetWordIdx];
      if (targetTiming && typeof targetTiming.start === 'number') {
        this.audioElement.currentTime = targetTiming.start;
        this.currentWordIndex = targetWordIdx;
        const w = this.currentWords[targetWordIdx];
        if (w && this.onWord) {
          this.onWord(w.wordIdx, w.text, w.charStart);
        }
      }
    }
  }

  /**
   * Fetch all saved page recordings from the backend.
   */
  async getRecordings() {
    try {
      const res = await fetch(`${this.baseUrl}/recordings`);
      if (res.ok) {
        const data = await res.json();
        return data.recordings || [];
      }
    } catch (err) {
      console.warn('Failed to fetch recordings:', err);
    }
    return [];
  }

  /**
   * Trigger immediate browser download of an audio Blob as MP3.
   */
  downloadBlob(blob, filename = 'page_recording.mp3') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /**
   * Download a saved recording by ID from the server.
   */
  downloadRecording(recordingId) {
    const a = document.createElement('a');
    a.href = `${this.baseUrl}/recordings/${recordingId}/download`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /**
   * Download all saved recordings as a single ZIP archive.
   */
  downloadAllRecordings() {
    const a = document.createElement('a');
    a.href = `${this.baseUrl}/recordings/download-all`;
    a.download = 'all_page_recordings.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /**
   * Delete an individual recording.
   */
  async deleteRecording(recordingId) {
    try {
      const res = await fetch(`${this.baseUrl}/recordings/${recordingId}`, { method: 'DELETE' });
      return res.ok;
    } catch (err) {
      console.error('Failed to delete recording:', err);
      return false;
    }
  }

  /**
   * Clear all saved recordings.
   */
  async clearAllRecordings() {
    try {
      const res = await fetch(`${this.baseUrl}/recordings`, { method: 'DELETE' });
      return res.ok;
    } catch (err) {
      console.error('Failed to clear recordings:', err);
      return false;
    }
  }
}

export const soproService = new SoproService();
