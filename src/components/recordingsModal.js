/**
 * recordingsModal.js
 * Modal dialog for managing and downloading saved page MP3 audio recordings.
 * Supports listening to previews, downloading individual page MP3s,
 * and downloading all page recordings packaged in a ZIP file.
 */

import { soproService } from '../services/soproService.js';

export class RecordingsModal {
  constructor(onCountChange) {
    this.onCountChange = onCountChange;
    this.recordings = [];
    this.isOpen = false;

    this._createDOM();
    this._bindEvents();
    this.loadRecordings();
  }

  _createDOM() {
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'recordings-modal';
    this.modalEl.className = 'modal-backdrop hidden';
    this.modalEl.style.display = 'none';
    this.modalEl.innerHTML = `
      <div class="modal-dialog recordings-dialog">
        <div class="modal-header">
          <div class="modal-title-wrap">
            <span class="modal-icon">🎧</span>
            <div>
              <h2 class="modal-title">Page Audio Recordings</h2>
              <p class="modal-subtitle">Saved MP3 recordings of each page read in Clone Mode</p>
            </div>
          </div>
          <button class="modal-close-btn" id="close-recordings-modal" title="Close modal">✕</button>
        </div>

        <div class="recordings-toolbar">
          <div class="recordings-stats" id="recordings-stats">
            <span class="badge badge-primary" id="rec-count-badge">0 Pages</span>
            <span class="badge badge-muted" id="rec-duration-badge">0:00 Total</span>
          </div>
          <div class="recordings-actions">
            <button class="btn btn-secondary btn-sm" id="btn-clear-recordings" title="Delete all recordings">
              🗑️ Clear All
            </button>
            <button class="btn btn-primary btn-sm" id="btn-download-all-zip" title="Download all page recordings as a ZIP file">
              📦 Download All (.ZIP)
            </button>
          </div>
        </div>

        <div class="modal-body recordings-body">
          <div class="recordings-list" id="recordings-list">
            <div class="empty-state">Loading recordings...</div>
          </div>
        </div>

        <div class="modal-footer">
          <div class="recordings-footer-hint">
            💡 Recordings are automatically generated and saved every time a page is read in Clone Mode.
          </div>
          <button class="btn btn-secondary" id="btn-close-recordings-footer">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalEl);
  }

  _bindEvents() {
    const modal = this.modalEl;
    const closeBtn = modal.querySelector('#close-recordings-modal');
    const closeFooterBtn = modal.querySelector('#btn-close-recordings-footer');
    const downloadAllBtn = modal.querySelector('#btn-download-all-zip');
    const clearAllBtn = modal.querySelector('#btn-clear-recordings');

    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.close();
    });

    closeFooterBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.close();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.close();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    downloadAllBtn.addEventListener('click', () => {
      if (this.recordings.length === 0) {
        alert('No recordings available to download.');
        return;
      }
      soproService.downloadAllRecordings();
    });

    clearAllBtn.addEventListener('click', async () => {
      if (this.recordings.length === 0) return;
      if (confirm(`Are you sure you want to delete all ${this.recordings.length} saved page recordings?`)) {
        await soproService.clearAllRecordings();
        await this.loadRecordings();
      }
    });
  }

  async loadRecordings() {
    this.recordings = await soproService.getRecordings();
    this.renderList();
    if (this.onCountChange) {
      this.onCountChange(this.recordings.length);
    }
  }

  renderList() {
    const listEl = this.modalEl.querySelector('#recordings-list');
    const countBadge = this.modalEl.querySelector('#rec-count-badge');
    const durationBadge = this.modalEl.querySelector('#rec-duration-badge');
    const downloadAllBtn = this.modalEl.querySelector('#btn-download-all-zip');
    const clearAllBtn = this.modalEl.querySelector('#btn-clear-recordings');

    const totalSeconds = this.recordings.reduce((acc, r) => acc + (parseFloat(r.duration) || 0), 0);
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60).toString().padStart(2, '0');

    countBadge.textContent = `${this.recordings.length} ${this.recordings.length === 1 ? 'Page' : 'Pages'}`;
    durationBadge.textContent = `${mins}:${secs} Total`;

    downloadAllBtn.disabled = this.recordings.length === 0;
    clearAllBtn.disabled = this.recordings.length === 0;

    if (this.recordings.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🎙️</div>
          <h3>No Page Recordings Yet</h3>
          <p>Read any page with Clone Mode enabled. Each page's audio will be automatically saved here for download anytime.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = this.recordings.map((rec) => {
      const durMins = Math.floor((rec.duration || 0) / 60);
      const durSecs = Math.floor((rec.duration || 0) % 60).toString().padStart(2, '0');
      const sizeKb = rec.fileSize ? `${(rec.fileSize / 1024).toFixed(0)} KB` : '';
      const dateStr = rec.createdAt ? new Date(rec.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

      return `
        <div class="recording-card" data-rec-id="${rec.id}">
          <div class="rec-card-header">
            <div class="rec-card-badge">
              <span class="page-pill">Page ${rec.pageNum || 1}</span>
              <span class="voice-name-pill" title="Voice profile used">🎙️ ${this._escapeHtml(rec.voiceName || 'Voice')}</span>
            </div>
            <div class="rec-card-meta">
              <span class="rec-duration">⏱️ ${durMins}:${durSecs}</span>
              ${sizeKb ? `<span class="rec-size">• ${sizeKb}</span>` : ''}
              ${dateStr ? `<span class="rec-date">• ${dateStr}</span>` : ''}
            </div>
          </div>

          <div class="rec-card-player">
            <audio controls preload="none" src="/api/recordings/${rec.id}/download" class="rec-audio"></audio>
          </div>

          <div class="rec-card-actions">
            <button class="btn btn-sm btn-download-rec" data-rec-id="${rec.id}" title="Download MP3 file for Page ${rec.pageNum || 1}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>Download MP3</span>
            </button>
            <button class="btn btn-sm btn-icon btn-delete-rec" data-rec-id="${rec.id}" title="Delete this recording">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Bind individual download buttons
    listEl.querySelectorAll('.btn-download-rec').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-rec-id');
        soproService.downloadRecording(id);
      });
    });

    // Bind individual delete buttons
    listEl.querySelectorAll('.btn-delete-rec').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-rec-id');
        if (confirm('Delete this page recording?')) {
          await soproService.deleteRecording(id);
          await this.loadRecordings();
        }
      });
    });
  }

  _escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  open() {
    this.isOpen = true;
    this.modalEl.classList.remove('hidden');
    this.modalEl.style.display = 'flex';
    this.loadRecordings();
  }

  close() {
    this.isOpen = false;
    // Pause any playing audio in cards
    const audios = this.modalEl.querySelectorAll('audio');
    audios.forEach((a) => a.pause());
    this.modalEl.classList.add('hidden');
    this.modalEl.style.display = 'none';
  }
}
