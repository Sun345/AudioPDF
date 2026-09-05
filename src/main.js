import { PDFService } from './services/pdfService.js';
import { TTSService } from './services/ttsService.js';
import { soproService } from './services/soproService.js';
import { Toolbar } from './components/toolbar.js';
import { Player } from './components/player.js';
import { Sidebar } from './components/sidebar.js';
import { CloneVoiceModal } from './components/cloneVoiceModal.js';

class PDFReaderApp {
  constructor() {
    this.pdfService = new PDFService();
    this.ttsService = new TTSService();

    this.currentPage = 1;
    this.totalPages = 1;
    this.currentZoom = 1.25;
    this.viewMode = 'doc'; // 'doc' | 'focus' | 'split'
    this.autoScroll = true;
    this.currentSpeed = 1.0;

    this.currentPageData = null;
    this.soproVoices = [];
    this.selectedVoiceUri = null;

    // Viewport elements
    this.viewport = document.getElementById('viewport');
    this.docContainer = document.getElementById('doc-container');
    this.focusContainer = document.getElementById('focus-container');
    this.workspace = document.getElementById('workspace');

    this.init();
  }

  async init() {
    this.initComponents();
    this.bindGlobalEvents();

    // Check Sopro server health & load cloned voices
    await this.refreshVoices();

    // Automatically load sample document so user can test immediately
    await this.loadDocumentUrl('/sample.pdf');
  }

  initComponents() {
    // 1. Toolbar
    this.toolbar = new Toolbar({
      onFileSelect: (file) => this.loadDocumentFile(file),
      onLoadSample: () => this.loadDocumentUrl('/sample.pdf'),
      onPageChange: (pageNum) => this.goToPage(pageNum),
      onZoomChange: (zoom) => this.changeZoom(zoom),
      onThemeChange: (theme) => this.handleThemeChange(theme),
      onViewModeChange: (view) => this.changeViewMode(view),
      onToggleSidebar: () => this.sidebar.toggle()
    });

    // 2. Clone Voice Modal
    this.cloneVoiceModal = new CloneVoiceModal(async (newVoice) => {
      await this.refreshVoices();
      if (newVoice) {
        this.selectedVoiceUri = `sopro:${newVoice.id}`;
        this.player.setVoices({
          soproVoices: this.soproVoices,
          systemVoices: this.ttsService.voices,
          selectedVoiceUri: this.selectedVoiceUri
        });
      }
    });

    // 3. Player
    this.player = new Player({
      onPlayPause: () => this.handlePlayPause(),
      onStop: () => this.handleStop(),
      onSkipSentence: (direction) => this.handleSkipSentence(direction),
      onVoiceChange: (voiceURI) => this.handleVoiceChange(voiceURI),
      onSpeedChange: (speed) => this.handleSpeedChange(speed),
      onAutoScrollChange: (enabled) => { this.autoScroll = enabled; },
      onCloneVoiceClick: () => this.cloneVoiceModal.open()
    });

    // Populate voices when Web Speech voices loaded
    this.ttsService.onVoicesLoaded = () => {
      this.refreshVoices();
    };

    // 4. Sidebar
    this.sidebar = new Sidebar({
      onSelectPage: (pageNum) => this.goToPage(pageNum)
    });

    // 5. TTS Event Handlers (Web Speech)
    this.ttsService.onWordCallback = (wordObj, wordIdx) => {
      this.handleWordSpoken(wordObj, wordIdx);
    };

    this.ttsService.onStateChangeCallback = (state) => {
      if (!this.selectedVoiceUri || !this.selectedVoiceUri.startsWith('sopro:')) {
        this.player.updatePlaybackState(state);
      }
    };

    this.ttsService.onEndCallback = () => {
      this.handleSpeechEnd();
    };

    // 6. Sopro Event Handlers (Local CPU AI Voice)
    soproService.onWord = (wordIdx, text, charStart) => {
      if (this.currentPageData && this.currentPageData.words) {
        const wordObj = this.currentPageData.words.find(w => w.wordIdx === wordIdx);
        if (wordObj) {
          this.handleWordSpoken(wordObj, wordIdx);
        }
      }
    };

    soproService.onStateChange = (state) => {
      if (this.selectedVoiceUri && this.selectedVoiceUri.startsWith('sopro:')) {
        this.player.updatePlaybackState({
          isPlaying: state === 'speaking' || state === 'loading',
          isPaused: state === 'paused'
        });
      }
    };

    soproService.onEnd = () => {
      this.handleSpeechEnd();
    };

    // 7. PDF Word Click Handler (Doc Mode Click-to-Speak)
    this.pdfService.onWordClick = (wordIdx, pageNum) => {
      if (pageNum && pageNum !== this.currentPage) {
        this.goToPage(pageNum).then(() => {
          this.speakFromWord(wordIdx);
        });
      } else {
        this.speakFromWord(wordIdx);
      }
    };
  }

  async refreshVoices() {
    const health = await soproService.checkHealth();
    if (health.available) {
      this.soproVoices = await soproService.getVoices();
    } else {
      this.soproVoices = [];
    }

    // Retrieve system voices from ttsService or direct speechSynthesis fallback
    const sysVoices = (this.ttsService.voices && this.ttsService.voices.length > 0)
      ? this.ttsService.voices
      : (window.speechSynthesis ? window.speechSynthesis.getVoices() : []);

    // Default to first Sopro voice if available, otherwise system voice
    if (!this.selectedVoiceUri) {
      if (this.soproVoices.length > 0) {
        this.selectedVoiceUri = `sopro:${this.soproVoices[0].id}`;
      } else if (sysVoices.length > 0) {
        this.selectedVoiceUri = sysVoices[0].voiceURI;
      }
    }

    this.player.setVoices({
      soproVoices: this.soproVoices,
      systemVoices: sysVoices,
      selectedVoiceUri: this.selectedVoiceUri
    });
  }

  handleVoiceChange(voiceURI) {
    this.selectedVoiceUri = voiceURI;
    if (voiceURI && !voiceURI.startsWith('sopro:')) {
      this.ttsService.setVoice(voiceURI);
    }
  }

  handleSpeedChange(speed) {
    this.currentSpeed = parseFloat(speed) || 1.0;
    this.ttsService.setRate(this.currentSpeed);
    soproService.setSpeed(this.currentSpeed);
  }

  bindGlobalEvents() {
    // Click-to-speak on document and focus view words
    const handleWordTap = (e) => {
      const wordEl = e.target.closest('.tts-word-hitbox, .tts-word, .focus-word');
      if (wordEl) {
        const wordIdx = parseInt(wordEl.dataset.wordIdx, 10);
        const pageNum = parseInt(wordEl.dataset.page, 10);
        if (!isNaN(wordIdx)) {
          if (pageNum && pageNum !== this.currentPage) {
            this.goToPage(pageNum).then(() => {
              this.ttsService.speakFromWordIndex(wordIdx);
            });
          } else {
            this.ttsService.speakFromWordIndex(wordIdx);
          }
        }
      }
    };

    this.viewport.addEventListener('click', handleWordTap);
    this.viewport.addEventListener('touchend', handleWordTap, { passive: true });

    // Drag and drop PDF onto viewport
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          this.loadDocumentFile(file);
        }
      }
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.handlePlayPause();
      } else if (e.code === 'ArrowRight' && e.altKey) {
        e.preventDefault();
        this.ttsService.skipSentence(1);
      } else if (e.code === 'ArrowLeft' && e.altKey) {
        e.preventDefault();
        this.ttsService.skipSentence(-1);
      } else if (e.code === 'PageDown' || (e.code === 'ArrowRight' && !e.altKey)) {
        if (this.currentPage < this.totalPages) {
          this.goToPage(this.currentPage + 1);
        }
      } else if (e.code === 'PageUp' || (e.code === 'ArrowLeft' && !e.altKey)) {
        if (this.currentPage > 1) {
          this.goToPage(this.currentPage - 1);
        }
      }
    });

    // Window resize handler for fit-width
    window.addEventListener('resize', () => {
      if (this.currentZoom === 'fit-width') {
        this.renderCurrentPage();
      }
    });
  }

  async loadDocumentUrl(url) {
    try {
      this.showLoading(true);
      await this.pdfService.loadDocument(url);
      await this.onDocumentLoaded();
    } catch (err) {
      console.error("Error loading PDF from URL:", err);
      alert("Could not load PDF document. Please try another file.");
    } finally {
      this.showLoading(false);
    }
  }

  async loadDocumentFile(file) {
    try {
      this.showLoading(true);
      await this.pdfService.loadDocument(file);
      await this.onDocumentLoaded();
    } catch (err) {
      console.error("Error loading uploaded PDF file:", err);
      alert("Error loading PDF: " + err.message);
    } finally {
      this.showLoading(false);
    }
  }

  async onDocumentLoaded() {
    this.currentPage = 1;
    this.totalPages = this.pdfService.numPages;

    this.toolbar.setPageInfo(this.currentPage, this.totalPages);
    this.sidebar.buildThumbnails(this.pdfService, this.totalPages);
    this.sidebar.setActivePage(this.currentPage);

    await this.renderCurrentPage();
  }

  async renderCurrentPage() {
    this.handleStop();

    // Determine zoom scale
    let scale = typeof this.currentZoom === 'number' ? this.currentZoom : 1.25;
    if (this.currentZoom === 'fit-width') {
      const containerWidth = this.viewport.clientWidth - 80;
      const page = await this.pdfService.pdfDoc.getPage(this.currentPage);
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      scale = Math.max(0.6, containerWidth / unscaledViewport.width);
      this.toolbar.setZoom(scale);
    }

    // 1. Render Document View Page
    const renderRes = await this.pdfService.renderPage(this.currentPage, this.docContainer, scale);
    const pageData = renderRes.pageData;
    this.currentPageData = pageData;

    // 2. Render Focus View Content
    this.renderFocusPage(pageData);

    // 3. Connect to TTS
    this.ttsService.setPageContent(pageData);

    // 4. Update stats
    this.sidebar.setStats(pageData.totalWords);
    this.sidebar.setActivePage(this.currentPage);
    this.toolbar.setPageInfo(this.currentPage, this.totalPages);
  }

  renderFocusPage(pageData) {
    this.focusContainer.innerHTML = '';

    const pageCard = document.createElement('div');
    pageCard.className = 'focus-view-page';

    const pageTitle = document.createElement('div');
    pageTitle.className = 'focus-view-page-title';
    pageTitle.textContent = `Page ${pageData.pageNum} • Focus Teleprompter`;
    pageCard.appendChild(pageTitle);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'focus-content';

    if (!pageData.words || pageData.words.length === 0) {
      contentDiv.innerHTML = `<p style="color: var(--text-muted); font-style: italic;">This page contains no readable text (it may be an illustration, cover, or scanned image).</p>`;
    } else {
      let html = '';
      pageData.words.forEach((w) => {
        html += `<span class="focus-word" id="focus-${w.id}" data-page="${w.page}" data-word-idx="${w.wordIdx}">${this.escapeHtml(w.text)}</span> `;
      });
      contentDiv.innerHTML = html;
    }

    pageCard.appendChild(contentDiv);
    this.focusContainer.appendChild(pageCard);
  }

  handleWordSpoken(wordObj, wordIdx) {
    if (!wordObj) return;

    // 1. Remove previous active highlights in focus view and document view
    const prevActive = document.querySelectorAll('.focus-word.tts-active-word, .tts-word-hitbox.tts-active-word');
    prevActive.forEach(el => el.classList.remove('tts-active-word'));

    // 2. Highlight on Focus View
    const focusWordEl = document.getElementById(`focus-${wordObj.id}`);
    if (focusWordEl) {
      focusWordEl.classList.add('tts-active-word');
    }

    // 3. Highlight on Document View Canvas with Pixel-Exact Rect
    const docWordEl = document.getElementById(wordObj.id);
    if (docWordEl) {
      docWordEl.classList.add('tts-active-word');
    }

    const activeBox = document.getElementById(`word-active-box-${this.currentPage}`);
    if (activeBox && wordObj.rect) {
      activeBox.style.left = `${wordObj.rect.left - 3}px`;
      activeBox.style.top = `${wordObj.rect.top - 1}px`;
      activeBox.style.width = `${wordObj.rect.width + 6}px`;
      activeBox.style.height = `${wordObj.rect.height + 2}px`;
      activeBox.style.display = 'block';
    }

    // 4. Update preview in player bar
    const currentWords = (this.currentPageData && this.currentPageData.words) || this.ttsService.currentWords;
    this.player.setPreviewWord(wordObj, currentWords, this.currentPage);

    // 5. Auto-scroll to keep active word visible
    if (this.autoScroll) {
      if (this.viewMode === 'focus' && focusWordEl) {
        this.scrollIntoViewIfNeeded(focusWordEl);
      } else if (activeBox) {
        this.scrollIntoViewIfNeeded(activeBox);
      }
    }
  }

  scrollIntoViewIfNeeded(element) {
    const rect = element.getBoundingClientRect();
    const viewportRect = this.viewport.getBoundingClientRect();

    // Check if element is out of comfortable viewing range (middle 60% of viewport)
    const upperLimit = viewportRect.top + (viewportRect.height * 0.2);
    const lowerLimit = viewportRect.bottom - (viewportRect.height * 0.2);

    if (rect.top < upperLimit || rect.bottom > lowerLimit) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  }

  async handleSpeechEnd() {
    if (this.currentPage < this.totalPages) {
      await this.goToPage(this.currentPage + 1);
      // Continuous reading seamlessly on next page once rendered
      this.speakFromWord(0);
    } else {
      this.handleStop();
    }
  }

  async goToPage(pageNum) {
    if (pageNum < 1 || pageNum > this.totalPages || pageNum === this.currentPage) return;
    this.currentPage = pageNum;
    await this.renderCurrentPage();
  }

  changeZoom(zoom) {
    this.currentZoom = zoom;
    this.renderCurrentPage();
  }

  async speakFromWord(wordIdx) {
    if (!this.currentPageData || !this.currentPageData.words || this.currentPageData.words.length === 0) return;

    if (this.selectedVoiceUri && this.selectedVoiceUri.startsWith('sopro:')) {
      // Use local Sopro TTS on CPU
      this.ttsService.stop();
      const voiceId = this.selectedVoiceUri.replace('sopro:', '');
      const remainingWords = this.currentPageData.words.slice(wordIdx);
      const textToSpeak = remainingWords.map(w => w.text).join(' ');

      try {
        await soproService.speak(textToSpeak, remainingWords, voiceId, this.currentSpeed);
      } catch (err) {
        alert('Sopro speech synthesis error: ' + err.message + '\nMake sure the local Sopro server is running on port 8000.');
      }
    } else {
      // Use browser Web Speech API
      soproService.stop();
      this.ttsService.speakFromWordIndex(wordIdx);
    }
  }

  handlePlayPause() {
    if (this.selectedVoiceUri && this.selectedVoiceUri.startsWith('sopro:')) {
      if (soproService.isPlaying && !soproService.isPaused) {
        soproService.pause();
      } else if (soproService.isPlaying && soproService.isPaused) {
        soproService.resume();
      } else {
        this.speakFromWord(0);
      }
    } else {
      if (this.ttsService.isPlaying && !this.ttsService.isPaused) {
        this.ttsService.pause();
      } else {
        this.ttsService.play();
      }
    }
  }

  handleStop() {
    this.ttsService.stop();
    soproService.stop();
    this.player.resetPreview();
    const prevActive = document.querySelectorAll('.focus-word.tts-active-word, .tts-word-hitbox.tts-active-word, .tts-word.tts-active-word');
    prevActive.forEach(el => el.classList.remove('tts-active-word'));
    const activeBoxes = document.querySelectorAll('.word-active-box');
    activeBoxes.forEach(box => { box.style.display = 'none'; });
  }

  handleSkipSentence(direction) {
    if (this.selectedVoiceUri && this.selectedVoiceUri.startsWith('sopro:')) {
      if (!this.currentPageData || !this.currentPageData.sentences) return;
      const curWordIdx = soproService.currentWordIndex >= 0 ? soproService.currentWordIndex : 0;
      const curSentence = this.currentPageData.sentences.findIndex(s => curWordIdx >= s.startWordIdx && curWordIdx <= s.endWordIdx);
      const targetSentenceIdx = Math.max(0, Math.min(this.currentPageData.sentences.length - 1, (curSentence >= 0 ? curSentence : 0) + direction));
      const targetSentence = this.currentPageData.sentences[targetSentenceIdx];
      if (targetSentence) {
        this.speakFromWord(targetSentence.startWordIdx);
      }
    } else {
      this.ttsService.skipSentence(direction);
    }
  }

  changeViewMode(mode) {
    this.viewMode = mode;
    this.workspace.classList.toggle('split-view', mode === 'split');

    if (mode === 'doc') {
      this.docContainer.style.display = 'flex';
      this.focusContainer.style.display = 'none';
    } else if (mode === 'focus') {
      this.docContainer.style.display = 'none';
      this.focusContainer.style.display = 'block';
    } else if (mode === 'split') {
      this.docContainer.style.display = 'flex';
      this.focusContainer.style.display = 'block';
    }
  }

  handleThemeChange(theme) {
    // Redraw if needed or let CSS variables adapt seamlessly
  }

  showLoading(isLoading) {
    const spinner = document.getElementById('loading-overlay');
    if (spinner) {
      spinner.style.display = isLoading ? 'flex' : 'none';
    }
  }

  escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

// Launch application on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  new PDFReaderApp();
});
