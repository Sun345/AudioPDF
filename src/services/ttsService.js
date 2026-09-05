/**
 * High-Precision Text-to-Speech Service with Dual-Engine Word Synchronization
 * and Non-Linear Rate Scaling
 */
export class TTSService {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voices = [];
    this.selectedVoice = null;
    this.rate = 1.0;
    this.pitch = 1.0;
    this.volume = 1.0;

    this.isPlaying = false;
    this.isPaused = false;
    this.currentWords = [];
    this.currentText = "";
    this.startWordOffset = 0;
    this.activeWordIndex = -1;

    this.onWordCallback = null;
    this.onEndCallback = null;
    this.onStateChangeCallback = null;
    this.onVoicesLoaded = null;

    this.keepAliveTimer = null;
    this.trackingTimer = null;
    this.lastBoundaryTime = 0;
    this.nativeBoundaryActive = false;

    this.initVoices();
  }

  initVoices() {
    const updateVoices = () => {
      this.voices = this.synth.getVoices();
      if (this.voices.length > 0) {
        if (!this.selectedVoice) {
          this.pickBestVoice();
        }
        if (this.onVoicesLoaded) {
          this.onVoicesLoaded(this.voices, this.selectedVoice);
        }
      }
    };

    updateVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = updateVoices;
    }
  }

  pickBestVoice() {
    if (!this.voices || this.voices.length === 0) return;
    
    // Priority: Local English voice (e.g. Microsoft David/Zira/Mark) -> any English -> first available
    const localEnglish = this.voices.find(v => v.lang.startsWith('en') && (v.localService || v.name.includes('Microsoft') || v.name.includes('David') || v.name.includes('Zira')));
    const naturalEnglish = this.voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Online')));
    const anyEnglish = this.voices.find(v => v.lang.startsWith('en'));

    this.selectedVoice = localEnglish || naturalEnglish || anyEnglish || this.voices[0];
  }

  getVoices() {
    return this.voices;
  }

  setVoice(voiceURI) {
    const voice = this.voices.find(v => v.voiceURI === voiceURI);
    if (voice) {
      this.selectedVoice = voice;
      if (this.isPlaying && !this.isPaused) {
        const resumeIdx = this.activeWordIndex >= 0 ? this.activeWordIndex : this.startWordOffset;
        this.speakFromWordIndex(resumeIdx);
      }
    }
  }

  setRate(rate) {
    this.rate = parseFloat(rate);
    if (this.isPlaying && !this.isPaused) {
      const resumeIdx = this.activeWordIndex >= 0 ? this.activeWordIndex : this.startWordOffset;
      this.speakFromWordIndex(resumeIdx);
    }
  }

  setPitch(pitch) {
    this.pitch = parseFloat(pitch);
    if (this.isPlaying && !this.isPaused) {
      const resumeIdx = this.activeWordIndex >= 0 ? this.activeWordIndex : this.startWordOffset;
      this.speakFromWordIndex(resumeIdx);
    }
  }

  setPageContent(pageData) {
    this.currentWords = pageData.words;
    this.currentText = pageData.fullText;
    this.startWordOffset = 0;
    this.activeWordIndex = -1;
  }

  /**
   * Speaks from a specific word index with exact character-boundary synchronization
   */
  speakFromWordIndex(wordIndex = 0) {
    if (!this.currentWords || this.currentWords.length === 0) return;

    this.stopTrackingTimer();

    // Synchronous cancel to preserve user gesture
    try {
      this.synth.cancel();
      if (this.synth.paused) {
        this.synth.resume();
      }
    } catch (e) {
      console.warn("Cancel warning:", e);
    }

    const targetIndex = Math.max(0, Math.min(wordIndex, this.currentWords.length - 1));
    this.startWordOffset = targetIndex;
    const targetWord = this.currentWords[targetIndex];

    // Do not trim: exact character offset must be preserved for boundary calculations!
    const textToSpeak = this.currentText.substring(targetWord.charStart);
    if (!textToSpeak.trim()) {
      if (this.onEndCallback) this.onEndCallback();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    window.__activeUtterance = utterance; // Prevent garbage collection mid-speech

    if (!this.selectedVoice) {
      this.pickBestVoice();
    }
    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }
    utterance.rate = this.rate;
    utterance.pitch = this.pitch;
    utterance.volume = this.volume;

    this.nativeBoundaryActive = false;
    this.lastBoundaryTime = 0;
    let currentTrackIdx = targetIndex;

    // Immediately highlight starting word
    this.setActiveWord(targetIndex);

    // 1. Native boundary event handler (exact ground truth from TTS engine at any speed)
    utterance.onboundary = (event) => {
      this.nativeBoundaryActive = true;
      this.lastBoundaryTime = Date.now();

      const spokenCharIndex = event.charIndex;
      const globalCharIndex = targetWord.charStart + spokenCharIndex;
      const matchedWordIdx = this.findWordAtChar(globalCharIndex);

      if (matchedWordIdx !== -1) {
        currentTrackIdx = matchedWordIdx; // Keep tracker in sync!
        this.setActiveWord(matchedWordIdx);
      }
    };

    // 2. Fallback cadence scheduler (active ONLY when native boundary is unavailable)
    const startCadenceScheduler = () => {
      this.stopTrackingTimer();

      // Calibrated non-linear WPM curve matching browser speech synthesis rates:
      // rate 0.75x -> ~135 WPM, 1.0x -> ~190 WPM, 1.25x -> ~250 WPM, 1.5x -> ~315 WPM, 2.0x -> ~460 WPM
      const effectiveWpm = 190 * Math.pow(this.rate, 1.32);
      const msPerChar = 60000 / (effectiveWpm * 4.9);

      const tick = () => {
        if (!this.isPlaying || this.isPaused) return;

        // If native boundary is active, DO NOT let fallback timer advance or fight native events!
        if (this.nativeBoundaryActive) {
          const timeSinceBoundary = Date.now() - this.lastBoundaryTime;
          // Stalled or reached end safety
          if (timeSinceBoundary > 2500 && currentTrackIdx >= this.currentWords.length - 1) {
            this.stop();
            if (this.onEndCallback) this.onEndCallback();
            return;
          }
          this.trackingTimer = setTimeout(tick, 100);
          return;
        }

        // Fallback: advance to next word based on natural speech pauses
        if (currentIdx < this.currentWords.length - 1) {
          const currentWord = this.currentWords[currentIdx];
          const wordLen = Math.max(2, currentWord.text.length);

          let duration = wordLen * msPerChar;
          // Punctuation pauses scaled with speed
          if (/[.,;:]$/.test(currentWord.text)) duration += (75 / Math.pow(this.rate, 1.2));
          if (/[.?!]$/.test(currentWord.text)) duration += (160 / Math.pow(this.rate, 1.2));
          if (/\n$/.test(currentWord.text)) duration += (100 / Math.pow(this.rate, 1.2));
          duration = Math.max(50 / this.rate, duration);

          this.trackingTimer = setTimeout(() => {
            if (!this.isPlaying || this.isPaused) return;
            currentIdx++;
            this.setActiveWord(currentIdx);
            tick();
          }, duration);
        } else {
          // Reached end of page words: if utterance doesn't fire onend within 1.5s, clean up
          this.trackingTimer = setTimeout(() => {
            if (this.isPlaying && !this.isPaused) {
              this.stop();
              if (this.onEndCallback) this.onEndCallback();
            }
          }, 1500);
        }
      };

      this.trackingTimer = setTimeout(tick, 100);
    };

    utterance.onstart = () => {
      this.isPlaying = true;
      this.isPaused = false;
      this.startKeepAlive();
      this.emitStateChange();
      startCadenceScheduler();
    };

    utterance.onend = () => {
      this.stopTrackingTimer();
      this.stopKeepAlive();
      this.isPlaying = false;
      this.isPaused = false;
      window.__activeUtterance = null;
      this.emitStateChange();
      if (this.onEndCallback) {
        this.onEndCallback();
      }
    };

    utterance.onerror = (err) => {
      if (err.error === 'interrupted' || err.error === 'canceled') {
        return;
      }
      console.warn("TTS Notice:", err);
      this.stopTrackingTimer();
      this.stopKeepAlive();
      this.isPlaying = false;
      this.isPaused = false;
      window.__activeUtterance = null;
      this.emitStateChange();
    };

    this.currentUtterance = utterance;
    // Speak synchronously within the user activation event!
    this.synth.speak(utterance);
    this.isPlaying = true;
    this.emitStateChange();
  }

  setActiveWord(index) {
    this.activeWordIndex = index;
    if (this.currentWords[index] && this.onWordCallback) {
      this.onWordCallback(this.currentWords[index], index);
    }
  }

  findWordAtChar(charIndex) {
    for (let i = 0; i < this.currentWords.length; i++) {
      const w = this.currentWords[i];
      const nextWord = this.currentWords[i + 1];
      const nextStart = nextWord ? nextWord.charStart : Infinity;

      if (charIndex >= w.charStart && charIndex < nextStart) {
        return i;
      }
    }
    return Math.max(0, this.currentWords.length - 1);
  }

  play() {
    if (this.isPaused) {
      this.synth.resume();
      this.isPaused = false;
      this.isPlaying = true;
      this.startKeepAlive();
      this.emitStateChange();
    } else {
      const resumeIndex = this.activeWordIndex >= 0 ? this.activeWordIndex : 0;
      this.speakFromWordIndex(resumeIndex);
    }
  }

  pause() {
    if (this.isPlaying && !this.isPaused) {
      this.synth.pause();
      this.isPaused = true;
      this.stopTrackingTimer();
      this.stopKeepAlive();
      this.emitStateChange();
    }
  }

  stop() {
    this.stopTrackingTimer();
    this.stopKeepAlive();
    try {
      if (this.synth.speaking || this.synth.pending) {
        this.synth.cancel();
      }
    } catch (e) {
      console.warn("Stop error:", e);
    }
    this.isPlaying = false;
    this.isPaused = false;
    window.__activeUtterance = null;
    this.emitStateChange();
  }

  skipSentence(direction = 1) {
    if (!this.currentWords || this.currentWords.length === 0) return;
    const currentIdx = this.activeWordIndex >= 0 ? this.activeWordIndex : 0;

    if (direction > 0) {
      for (let i = currentIdx; i < this.currentWords.length - 1; i++) {
        if (/[.?!]$/.test(this.currentWords[i].text)) {
          this.speakFromWordIndex(i + 1);
          return;
        }
      }
      this.speakFromWordIndex(this.currentWords.length - 1);
    } else {
      let found = 0;
      for (let i = currentIdx - 1; i >= 0; i--) {
        if (/[.?!]$/.test(this.currentWords[i].text)) {
          found = i + 1;
          break;
        }
      }
      this.speakFromWordIndex(found);
    }
  }

  startKeepAlive() {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (this.synth.speaking && !this.isPaused) {
        this.synth.pause();
        this.synth.resume();
      }
    }, 10000);
  }

  stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  stopTrackingTimer() {
    if (this.trackingTimer) {
      clearTimeout(this.trackingTimer);
      this.trackingTimer = null;
    }
  }

  emitStateChange() {
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback({
        isPlaying: this.isPlaying,
        isPaused: this.isPaused,
        activeWordIndex: this.activeWordIndex
      });
    }
  }
}
