export class Toolbar {
  constructor({ onFileSelect, onLoadSample, onPageChange, onZoomChange, onThemeChange, onViewModeChange, onToggleSidebar, onTogglePdfInvert }) {
    this.onFileSelect = onFileSelect;
    this.onLoadSample = onLoadSample;
    this.onPageChange = onPageChange;
    this.onZoomChange = onZoomChange;
    this.onThemeChange = onThemeChange;
    this.onViewModeChange = onViewModeChange;
    this.onToggleSidebar = onToggleSidebar;
    this.onTogglePdfInvert = onTogglePdfInvert;

    this.currentPage = 1;
    this.totalPages = 1;
    this.currentZoom = 1.25;
    this.currentTheme = localStorage.getItem('pdf-theme') || 'dark';
    this.currentView = 'doc'; // 'doc' | 'focus' | 'split'
    this.pdfInvert = true;

    this.initElements();
    this.bindEvents();
    this.setTheme(this.currentTheme);
  }

  initElements() {
    this.container = document.getElementById('toolbar');
    this.container.innerHTML = `
      <div class="toolbar-section">
        <button class="btn btn-icon" id="btn-sidebar" title="Toggle Sidebar (Thumbnails)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>
        </button>
        <div class="toolbar-brand">
          <div class="brand-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <span>AudioPDF</span>
        </div>
      </div>

      <div class="toolbar-section">
        <label class="btn btn-primary" title="Upload local PDF" style="cursor: pointer;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span>Open PDF</span>
          <input type="file" id="file-input" accept="application/pdf" style="display: none;" />
        </label>
        <button class="btn" id="btn-sample-pdf" title="Load bundled sample PDF">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <span>Sample PDF</span>
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <!-- Page Nav -->
      <div class="toolbar-section">
        <button class="btn btn-icon" id="btn-prev-page" title="Previous Page">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="page-nav-group">
          <input type="number" id="page-num-input" class="page-input" value="1" min="1" max="1" />
          <span class="page-total" id="page-total-label">/ 1</span>
        </div>
        <button class="btn btn-icon" id="btn-next-page" title="Next Page">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <!-- Zoom Controls -->
      <div class="toolbar-section">
        <button class="btn btn-icon" id="btn-zoom-out" title="Zoom Out">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>
        <button class="btn" id="btn-zoom-reset" title="Reset Zoom">
          <span id="zoom-label">125%</span>
        </button>
        <button class="btn btn-icon" id="btn-zoom-in" title="Zoom In">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>
        <button class="btn btn-icon" id="btn-fit-width" title="Fit to Width">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 9 9 4 14 9"/><polyline points="20 15 15 20 10 15"/></svg>
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <!-- View Switcher -->
      <div class="toolbar-section">
        <div class="view-selector">
          <button class="view-opt active" data-view="doc" title="Authentic PDF Document View">Doc</button>
          <button class="view-opt" data-view="focus" title="Distraction-Free Focus Reader">Focus</button>
          <button class="view-opt" data-view="split" title="Side-by-Side Split View">Split</button>
        </div>
      </div>

      <!-- Theme Switcher -->
      <div class="toolbar-section">
        <div class="theme-selector">
          <button class="theme-opt" data-theme="dark" title="Dark Mode (Obsidian)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            <span>Dark</span>
          </button>
          <button class="theme-opt" data-theme="sepia" title="Sepia Warm Paper Mode">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            <span>Sepia</span>
          </button>
          <button class="theme-opt" data-theme="light" title="Light Mode">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            <span>Light</span>
          </button>
        </div>
      </div>
    `;

    // References
    this.fileInput = document.getElementById('file-input');
    this.btnSample = document.getElementById('btn-sample-pdf');
    this.btnPrev = document.getElementById('btn-prev-page');
    this.btnNext = document.getElementById('btn-next-page');
    this.pageInput = document.getElementById('page-num-input');
    this.pageTotalLabel = document.getElementById('page-total-label');
    this.btnZoomIn = document.getElementById('btn-zoom-in');
    this.btnZoomOut = document.getElementById('btn-zoom-out');
    this.btnZoomReset = document.getElementById('btn-zoom-reset');
    this.zoomLabel = document.getElementById('zoom-label');
    this.btnFitWidth = document.getElementById('btn-fit-width');
    this.btnSidebar = document.getElementById('btn-sidebar');
  }

  bindEvents() {
    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.onFileSelect(e.target.files[0]);
      }
    });

    this.btnSample.addEventListener('click', () => {
      this.onLoadSample();
    });

    this.btnPrev.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.onPageChange(this.currentPage - 1);
      }
    });

    this.btnNext.addEventListener('click', () => {
      if (this.currentPage < this.totalPages) {
        this.onPageChange(this.currentPage + 1);
      }
    });

    this.pageInput.addEventListener('change', (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val)) val = 1;
      val = Math.max(1, Math.min(val, this.totalPages));
      this.onPageChange(val);
    });

    this.btnZoomIn.addEventListener('click', () => {
      this.currentZoom = Math.min(2.5, +(this.currentZoom + 0.15).toFixed(2));
      this.updateZoomDisplay();
      this.onZoomChange(this.currentZoom);
    });

    this.btnZoomOut.addEventListener('click', () => {
      this.currentZoom = Math.max(0.6, +(this.currentZoom - 0.15).toFixed(2));
      this.updateZoomDisplay();
      this.onZoomChange(this.currentZoom);
    });

    this.btnZoomReset.addEventListener('click', () => {
      this.currentZoom = 1.25;
      this.updateZoomDisplay();
      this.onZoomChange(this.currentZoom);
    });

    this.btnFitWidth.addEventListener('click', () => {
      this.onZoomChange('fit-width');
    });

    this.btnSidebar.addEventListener('click', () => {
      this.onToggleSidebar();
    });

    // Theme buttons
    const themeOpts = this.container.querySelectorAll('.theme-opt');
    themeOpts.forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        this.setTheme(theme);
        this.onThemeChange(theme);
      });
    });

    // View buttons
    const viewOpts = this.container.querySelectorAll('.view-opt');
    viewOpts.forEach(btn => {
      btn.addEventListener('click', () => {
        viewOpts.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const view = btn.dataset.view;
        this.currentView = view;
        this.onViewModeChange(view);
      });
    });
  }

  setTheme(theme) {
    this.currentTheme = theme;
    localStorage.setItem('pdf-theme', theme);
    document.documentElement.dataset.theme = theme;

    const themeOpts = this.container.querySelectorAll('.theme-opt');
    themeOpts.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  }

  setPageInfo(currentPage, totalPages) {
    this.currentPage = currentPage;
    this.totalPages = totalPages;
    this.pageInput.value = currentPage;
    this.pageInput.max = totalPages;
    this.pageTotalLabel.textContent = `/ ${totalPages}`;
    this.btnPrev.disabled = currentPage <= 1;
    this.btnNext.disabled = currentPage >= totalPages;
  }

  setZoom(zoom) {
    this.currentZoom = zoom;
    this.updateZoomDisplay();
  }

  updateZoomDisplay() {
    this.zoomLabel.textContent = `${Math.round(this.currentZoom * 100)}%`;
  }
}
