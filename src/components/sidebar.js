export class Sidebar {
  constructor({ onSelectPage }) {
    this.onSelectPage = onSelectPage;
    this.container = document.getElementById('sidebar');
    this.isCollapsed = false;
    this.currentPage = 1;
    this.totalPages = 1;
    this.thumbObserver = null;

    this.initElements();
  }

  initElements() {
    this.container.innerHTML = `
      <div class="sidebar-header">
        <span>Pages & Outline</span>
        <span id="sidebar-doc-stats" style="font-size: 0.72rem; color: var(--accent-cyan); text-transform: none;"></span>
      </div>
      <div class="sidebar-content" id="sidebar-thumbnails">
        <!-- Thumbnails rendered dynamically -->
      </div>
    `;

    this.thumbnailsContainer = document.getElementById('sidebar-thumbnails');
    this.statsLabel = document.getElementById('sidebar-doc-stats');
  }

  toggle() {
    this.isCollapsed = !this.isCollapsed;
    this.container.classList.toggle('collapsed', this.isCollapsed);
  }

  async buildThumbnails(pdfService, totalPages) {
    this.totalPages = totalPages;
    this.thumbnailsContainer.innerHTML = '';

    if (this.thumbObserver) {
      this.thumbObserver.disconnect();
    }

    // Lazy load thumbnails on demand as they scroll into view
    this.thumbObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const item = entry.target;
          const page = parseInt(item.dataset.page, 10);
          const canvas = item.querySelector('canvas');
          if (canvas && !canvas.dataset.rendered) {
            canvas.dataset.rendered = 'true';
            pdfService.renderThumbnail(page, canvas, 130).catch(err => {
              console.warn(`Thumbnail notice on page ${page}:`, err);
            });
          }
        }
      });
    }, {
      root: this.thumbnailsContainer,
      rootMargin: '120px'
    });

    for (let p = 1; p <= totalPages; p++) {
      const item = document.createElement('div');
      item.className = `thumbnail-item ${p === this.currentPage ? 'active' : ''}`;
      item.id = `thumb-page-${p}`;
      item.dataset.page = p;

      const previewBox = document.createElement('div');
      previewBox.className = 'thumbnail-preview';

      const canvas = document.createElement('canvas');
      previewBox.appendChild(canvas);

      const label = document.createElement('div');
      label.className = 'thumbnail-label';
      label.textContent = `Page ${p}`;

      item.appendChild(previewBox);
      item.appendChild(label);

      item.addEventListener('click', () => {
        this.onSelectPage(p);
      });

      this.thumbnailsContainer.appendChild(item);
      this.thumbObserver.observe(item);
    }
  }

  setActivePage(pageNum) {
    this.currentPage = pageNum;
    const items = this.thumbnailsContainer.querySelectorAll('.thumbnail-item');
    items.forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.page, 10) === pageNum);
    });

    const activeEl = document.getElementById(`thumb-page-${pageNum}`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  setStats(totalWords) {
    if (!totalWords) return;
    const estMinutes = Math.max(1, Math.ceil(totalWords / 140)); // ~140 wpm speaking rate
    this.statsLabel.textContent = `${totalWords} words (~${estMinutes} min)`;
  }
}
