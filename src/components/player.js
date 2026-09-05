export class Player {
  constructor({ onPlayPause, onStop, onSkipSentence, onVoiceChange, onSpeedChange, onAutoScrollChange, onCloneVoiceClick }) {
    this.onPlayPause = onPlayPause;
    this.onStop = onStop;
    this.onSkipSentence = onSkipSentence;
    this.onVoiceChange = onVoiceChange;
    this.onSpeedChange = onSpeedChange;
    this.onAutoScrollChange = onAutoScrollChange;
    this.onCloneVoiceClick = onCloneVoiceClick;

    this.isPlaying = false;
    this.isPaused = false;
    this.autoScroll = true;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.container = document.getElementById('player-bar');
    this.container.innerHTML = `
      <div class="player-left">
        <button class="btn btn-icon" id="btn-skip-prev" title="Previous Sentence">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
        </button>

        <button class="play-pause-btn" id="btn-play-pause" title="Play / Pause TTS">
          <svg id="icon-play" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <svg id="icon-pause" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style="display: none;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        </button>

        <button class="btn btn-icon" id="btn-skip-next" title="Next Sentence">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
        </button>

        <button class="btn btn-icon" id="btn-stop" title="Stop Playback">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
        </button>

        <!-- Dynamic Audio Visualizer -->
        <div class="visualizer" id="audio-visualizer">
          <div class="viz-bar"></div>
          <div class="viz-bar"></div>
          <div class="viz-bar"></div>
          <div class="viz-bar"></div>
          <div class="viz-bar"></div>
        </div>
      </div>

      <div class="player-center">
        <div class="current-speech-preview" id="current-speech-preview">
          <span>Ready to read. Click Play or click any word on the document.</span>
        </div>
        <div class="playback-subtext" id="playback-stats">
          <span>Web Speech Synthesis Active</span>
        </div>
      </div>

      <div class="player-right">
        <!-- Clone Voice Trigger Button -->
        <button class="btn-clone-voice" id="btn-open-clone-modal" title="Clone a new voice or record your own voice with Sopro V2 Turbo">
          <span>✨</span> Clone Voice
        </button>

        <!-- Voice Select -->
        <div class="control-pill" title="Choose Reading Voice (Sopro AI Cloned or System)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          <select id="voice-select" class="voice-select">
            <option value="">Default Voice</option>
          </select>
        </div>

        <!-- Speed Select -->
        <div class="control-pill" title="Reading Speed (WPM multiplier)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
          <select id="speed-select" class="speed-select">
            <option value="0.75">0.75x</option>
            <option value="1.0" selected>1.0x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="1.75">1.75x</option>
            <option value="2.0">2.0x</option>
          </select>
        </div>

        <!-- Auto-scroll Checkbox -->
        <label class="toggle-label" title="Automatically keep the current reading word centered in viewport">
          <input type="checkbox" id="auto-scroll-toggle" checked />
          <span>Auto-Scroll</span>
        </label>
      </div>
    `;

    this.btnPlayPause = document.getElementById('btn-play-pause');
    this.iconPlay = document.getElementById('icon-play');
    this.iconPause = document.getElementById('icon-pause');
    this.btnStop = document.getElementById('btn-stop');
    this.btnSkipPrev = document.getElementById('btn-skip-prev');
    this.btnSkipNext = document.getElementById('btn-skip-next');
    this.visualizer = document.getElementById('audio-visualizer');
    this.speechPreview = document.getElementById('current-speech-preview');
    this.playbackStats = document.getElementById('playback-stats');
    this.voiceSelect = document.getElementById('voice-select');
    this.speedSelect = document.getElementById('speed-select');
    this.btnOpenCloneModal = document.getElementById('btn-open-clone-modal');
  }

  bindEvents() {
    this.btnPlayPause.addEventListener('click', () => {
      this.onPlayPause();
    });

    this.btnStop.addEventListener('click', () => {
      this.onStop();
    });

    this.btnSkipPrev.addEventListener('click', () => {
      this.onSkipSentence(-1);
    });

    this.btnSkipNext.addEventListener('click', () => {
      this.onSkipSentence(1);
    });

    if (this.btnOpenCloneModal) {
      this.btnOpenCloneModal.addEventListener('click', () => {
        if (this.onCloneVoiceClick) this.onCloneVoiceClick();
      });
    }

    this.voiceSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val.startsWith('sopro:')) {
        this.playbackStats.textContent = '🌟 Sopro-v2-turbo (Local CPU) Active';
      } else {
        this.playbackStats.textContent = '🖥️ Web Speech Synthesis Active';
      }
      this.onVoiceChange(val);
    });

    this.speedSelect.addEventListener('change', (e) => {
      this.onSpeedChange(e.target.value);
    });

    this.autoScrollToggle.addEventListener('change', (e) => {
      this.autoScroll = e.target.checked;
      this.onAutoScrollChange(this.autoScroll);
    });
  }

  setVoices({ soproVoices = [], systemVoices = [], selectedVoiceUri = null }) {
    this.voiceSelect.innerHTML = '';

    // Group 1: Sopro Local Cloned Voices (CPU)
    if (soproVoices && soproVoices.length > 0) {
      const soproGroup = document.createElement('optgroup');
      soproGroup.label = '🌟 Sopro Local Cloned Voices (CPU)';

      soproVoices.forEach((v) => {
        const opt = document.createElement('option');
        opt.value = `sopro:${v.id}`;
        opt.textContent = `${v.name} ${v.isDefault ? '• Default AI' : '• Cloned'}`;
        if (selectedVoiceUri === opt.value) {
          opt.selected = true;
        }
        soproGroup.appendChild(opt);
      });
      this.voiceSelect.appendChild(soproGroup);
    }

    // Group 2: System Voices (Web Speech API)
    if (systemVoices && systemVoices.length > 0) {
      const sysGroup = document.createElement('optgroup');
      sysGroup.label = '🖥️ System Voices (Web Speech API)';

      systemVoices.forEach((v) => {
        const opt = document.createElement('option');
        opt.value = v.voiceURI;
        opt.textContent = `${v.name} (${v.lang})`;
        if (selectedVoiceUri === v.voiceURI) {
          opt.selected = true;
        }
        sysGroup.appendChild(opt);
      });
      this.voiceSelect.appendChild(sysGroup);
    }

    // Update stats label
    const curVal = this.voiceSelect.value;
    if (curVal.startsWith('sopro:')) {
      this.playbackStats.textContent = '🌟 Sopro-v2-turbo (Local CPU) Active';
    } else {
      this.playbackStats.textContent = '🖥️ Web Speech Synthesis Active';
    }
  }

  updatePlaybackState({ isPlaying, isPaused, activeWordIndex }) {
    this.isPlaying = isPlaying;
    this.isPaused = isPaused;

    if (isPlaying && !isPaused) {
      this.iconPlay.style.display = 'none';
      this.iconPause.style.display = 'block';
      this.visualizer.classList.add('speaking');
    } else {
      this.iconPlay.style.display = 'block';
      this.iconPause.style.display = 'none';
      this.visualizer.classList.remove('speaking');
    }
  }

  setPreviewWord(wordObj, wordsList, pageNum) {
    if (!wordObj) return;

    // Show a surrounding window of words
    const idx = wordObj.wordIdx;
    const start = Math.max(0, idx - 4);
    const end = Math.min(wordsList.length, idx + 6);
    
    let previewHtml = '';
    if (start > 0) previewHtml += '... ';
    for (let i = start; i < end; i++) {
      const w = wordsList[i];
      if (i === idx) {
        previewHtml += `<span class="active-word-highlight">${w.text}</span> `;
      } else {
        previewHtml += `${w.text} `;
      }
    }
    if (end < wordsList.length) previewHtml += '...';

    this.speechPreview.innerHTML = previewHtml;
    this.playbackStats.textContent = `Page ${pageNum} • Word ${idx + 1} of ${wordsList.length}`;
  }

  resetPreview() {
    this.speechPreview.innerHTML = `<span>Playback stopped. Ready to read.</span>`;
    this.visualizer.classList.remove('speaking');
    this.iconPlay.style.display = 'block';
    this.iconPause.style.display = 'none';
  }
}
