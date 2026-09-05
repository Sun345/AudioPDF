/**
 * cloneVoiceModal.js
 * Modal dialog for cloning voices with Sopro V2 Turbo.
 * Supports live microphone recording (with waveform visualizer) and file upload.
 */

import { soproService } from '../services/soproService.js';

export class CloneVoiceModal {
  constructor(onVoiceCreated) {
    this.onVoiceCreated = onVoiceCreated;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.recordedBlob = null;
    this.uploadedFile = null;
    this.recordingInterval = null;
    this.recordingSeconds = 0;
    this.audioContext = null;
    this.analyser = null;
    this.animFrame = null;

    this._createDOM();
  }

  _createDOM() {
    // Backdrop
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'clone-voice-modal';
    this.modalEl.className = 'modal-backdrop hidden';
    this.modalEl.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <div class="modal-title-wrap">
            <span class="modal-icon">🎙️</span>
            <div>
              <h2 class="modal-title">Clone Voice</h2>
              <p class="modal-subtitle">Powered by Sopro-v2-turbo (Local CPU Zero-Shot TTS)</p>
            </div>
          </div>
          <button class="modal-close-btn" id="close-clone-modal" title="Close modal">✕</button>
        </div>

        <div class="modal-tabs">
          <button class="modal-tab-btn active" data-tab="record">
            <span class="tab-icon">⏺️</span> Record Microphone
          </button>
          <button class="modal-tab-btn" data-tab="upload">
            <span class="tab-icon">📁</span> Upload Audio File
          </button>
        </div>

        <div class="modal-body">
          <!-- Voice Name Field -->
          <div class="form-group">
            <label for="voice-name-input">Voice Name</label>
            <input type="text" id="voice-name-input" class="form-input" placeholder="e.g. My Voice, Professor, Storyteller" maxlength="32" />
          </div>

          <!-- Tab 1: Record Voice -->
          <div class="tab-pane active" id="pane-record">
            <div class="record-container">
              <div class="mic-visualizer-wrap">
                <canvas id="mic-canvas" width="360" height="70"></canvas>
                <div class="rec-timer" id="rec-timer">00:00</div>
              </div>
              <p class="record-hint">
                Speak clearly for <strong>5 to 15 seconds</strong> in a quiet environment. Read a sentence or two naturally.
              </p>
              <div class="record-actions">
                <button class="btn btn-record" id="btn-start-record">
                  <span class="rec-dot"></span> Start Recording
                </button>
                <button class="btn btn-stop-record hidden" id="btn-stop-record">
                  ■ Stop Recording
                </button>
              </div>
              <div class="preview-wrap hidden" id="record-preview-wrap">
                <label>Playback Preview:</label>
                <audio id="record-audio-preview" controls></audio>
              </div>
            </div>
          </div>

          <!-- Tab 2: Upload File -->
          <div class="tab-pane hidden" id="pane-upload">
            <div class="upload-dropzone" id="upload-dropzone">
              <span class="dropzone-icon">☁️</span>
              <p class="dropzone-title">Drag & drop your voice sample audio here</p>
              <p class="dropzone-desc">WAV, MP3, M4A, or OGG (5–20 seconds recommended)</p>
              <label class="btn btn-secondary upload-file-btn">
                Browse Audio File
                <input type="file" id="voice-file-input" accept="audio/*" class="hidden-input" />
              </label>
            </div>
            <div class="preview-wrap hidden" id="upload-preview-wrap">
              <div class="file-info-badge" id="upload-file-name"></div>
              <audio id="upload-audio-preview" controls></audio>
            </div>
          </div>

          <!-- Existing Cloned Voices list -->
          <div class="existing-voices-section">
            <h3 class="section-subtitle">Your Cloned Voices</h3>
            <div class="voice-cards-grid" id="modal-voice-list">
              <div class="empty-state">Loading cloned voices...</div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <div class="modal-status" id="modal-status-msg"></div>
          <button class="btn btn-secondary" id="cancel-clone-btn">Cancel</button>
          <button class="btn btn-primary" id="submit-clone-btn" disabled>
            ✨ Clone Voice
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalEl);
    this._bindEvents();
  }

  _bindEvents() {
    const modal = this.modalEl;
    const closeBtn = modal.querySelector('#close-clone-modal');
    const cancelBtn = modal.querySelector('#cancel-clone-btn');
    const submitBtn = modal.querySelector('#submit-clone-btn');
    const tabBtns = modal.querySelectorAll('.modal-tab-btn');
    const nameInput = modal.querySelector('#voice-name-input');
    const fileInput = modal.querySelector('#voice-file-input');
    const dropzone = modal.querySelector('#upload-dropzone');
    const startRecBtn = modal.querySelector('#btn-start-record');
    const stopRecBtn = modal.querySelector('#btn-stop-record');

    closeBtn.addEventListener('click', () => this.close());
    cancelBtn.addEventListener('click', () => this.close());

    // Backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.close();
    });

    // Tab switching
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        tabBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.getAttribute('data-tab');

        modal.querySelectorAll('.tab-pane').forEach((p) => p.classList.add('hidden'));
        modal.querySelector(`#pane-${tab}`).classList.remove('hidden');
        this._updateSubmitState();
      });
    });

    // Name input validation
    nameInput.addEventListener('input', () => this._updateSubmitState());

    // Microphone Recording
    startRecBtn.addEventListener('click', () => this._startRecording());
    stopRecBtn.addEventListener('click', () => this._stopRecording());

    // File Upload Input
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this._handleFileSelected(e.target.files[0]);
      }
    });

    // Drag and drop
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this._handleFileSelected(e.dataTransfer.files[0]);
      }
    });

    // Submit Voice Clone
    submitBtn.addEventListener('click', () => this._submitClone());
  }

  _updateSubmitState() {
    const name = this.modalEl.querySelector('#voice-name-input').value.trim();
    const activeTab = this.modalEl.querySelector('.modal-tab-btn.active').getAttribute('data-tab');
    const hasAudio = activeTab === 'record' ? !!this.recordedBlob : !!this.uploadedFile;
    const submitBtn = this.modalEl.querySelector('#submit-clone-btn');
    submitBtn.disabled = !(name.length >= 2 && hasAudio);
  }

  _handleFileSelected(file) {
    this.uploadedFile = file;
    const previewWrap = this.modalEl.querySelector('#upload-preview-wrap');
    const audioPreview = this.modalEl.querySelector('#upload-audio-preview');
    const fileNameBadge = this.modalEl.querySelector('#upload-file-name');

    fileNameBadge.textContent = `📄 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    audioPreview.src = URL.createObjectURL(file);
    previewWrap.classList.remove('hidden');

    // Auto-fill voice name if empty
    const nameInput = this.modalEl.querySelector('#voice-name-input');
    if (!nameInput.value) {
      nameInput.value = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    }
    this._updateSubmitState();
  }

  async _startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        this.recordedBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
        const previewWrap = this.modalEl.querySelector('#record-preview-wrap');
        const audioPreview = this.modalEl.querySelector('#record-audio-preview');
        audioPreview.src = URL.createObjectURL(this.recordedBlob);
        previewWrap.classList.remove('hidden');

        stream.getTracks().forEach((track) => track.stop());
        this._stopVisualizer();
        this._updateSubmitState();
      };

      this.mediaRecorder.start();
      this.recordingSeconds = 0;
      this._updateTimerDisplay();

      this.modalEl.querySelector('#btn-start-record').classList.add('hidden');
      this.modalEl.querySelector('#btn-stop-record').classList.remove('hidden');

      this.recordingInterval = setInterval(() => {
        this.recordingSeconds++;
        this._updateTimerDisplay();
        if (this.recordingSeconds >= 20) {
          this._stopRecording();
        }
      }, 1000);

      this._startVisualizer(stream);
    } catch (err) {
      alert('Microphone access denied or unavailable: ' + err.message);
    }
  }

  _stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }
    this.modalEl.querySelector('#btn-start-record').classList.remove('hidden');
    this.modalEl.querySelector('#btn-stop-record').classList.add('hidden');
  }

  _updateTimerDisplay() {
    const mins = Math.floor(this.recordingSeconds / 60).toString().padStart(2, '0');
    const secs = (this.recordingSeconds % 60).toString().padStart(2, '0');
    this.modalEl.querySelector('#rec-timer').textContent = `${mins}:${secs}`;
  }

  _startVisualizer(stream) {
    const canvas = this.modalEl.querySelector('#mic-canvas');
    const ctx = canvas.getContext('2d');
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 64;
    source.connect(this.analyser);

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      this.animFrame = requestAnimationFrame(draw);
      this.analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 1.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        ctx.fillStyle = '#6366f1';
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
        x += barWidth;
      }
    };
    draw();
  }

  _stopVisualizer() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }

  async _submitClone() {
    const name = this.modalEl.querySelector('#voice-name-input').value.trim();
    const activeTab = this.modalEl.querySelector('.modal-tab-btn.active').getAttribute('data-tab');
    const audioData = activeTab === 'record' ? this.recordedBlob : this.uploadedFile;
    const filename = activeTab === 'record' ? `${name.toLowerCase().replace(/\s+/g, '_')}.wav` : (this.uploadedFile ? this.uploadedFile.name : 'voice.wav');

    const submitBtn = this.modalEl.querySelector('#submit-clone-btn');
    const statusMsg = this.modalEl.querySelector('#modal-status-msg');

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-inline"></span> Cloning Voice on CPU...';
      statusMsg.className = 'modal-status info';
      statusMsg.textContent = 'Extracting speaker embeddings with Sopro-v2-turbo...';

      const voice = await soproService.cloneVoice(name, audioData, filename);

      statusMsg.className = 'modal-status success';
      statusMsg.textContent = `✓ Voice "${voice.name}" successfully cloned!`;

      await this.refreshVoiceList();

      if (this.onVoiceCreated) {
        this.onVoiceCreated(voice);
      }

      setTimeout(() => {
        this.close();
      }, 1200);
    } catch (err) {
      statusMsg.className = 'modal-status error';
      statusMsg.textContent = `Clone failed: ${err.message}`;
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '✨ Clone Voice';
    }
  }

  async refreshVoiceList() {
    const listEl = this.modalEl.querySelector('#modal-voice-list');
    const voices = await soproService.getVoices();

    if (voices.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No cloned voices yet. Record or upload your first voice above!</div>';
      return;
    }

    listEl.innerHTML = voices.map((v) => `
      <div class="cloned-voice-card ${v.isDefault ? 'default-voice' : ''}" data-voice-id="${v.id}">
        <div class="cv-info">
          <span class="cv-badge">${v.isDefault ? '🌟 Built-in' : '🎙️ Cloned'}</span>
          <strong class="cv-name">${v.name}</strong>
          <span class="cv-date">${v.createdAt ? new Date(v.createdAt).toLocaleDateString() : 'Ready'}</span>
        </div>
        ${!v.isDefault ? `<button class="cv-delete-btn" data-delete-id="${v.id}" title="Delete voice">🗑️</button>` : ''}
      </div>
    `).join('');

    // Bind delete buttons
    listEl.querySelectorAll('.cv-delete-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-delete-id');
        if (confirm('Are you sure you want to delete this cloned voice?')) {
          try {
            await fetch(`/api/voices/${id}`, { method: 'DELETE' });
            await this.refreshVoiceList();
            if (this.onVoiceCreated) this.onVoiceCreated(null);
          } catch (err) {
            alert('Failed to delete voice: ' + err.message);
          }
        }
      });
    });
  }

  open() {
    this.modalEl.classList.remove('hidden');
    this.refreshVoiceList();
    this.modalEl.querySelector('#voice-name-input').focus();
  }

  close() {
    this._stopRecording();
    this.modalEl.classList.add('hidden');
    const statusMsg = this.modalEl.querySelector('#modal-status-msg');
    if (statusMsg) statusMsg.textContent = '';
  }
}
