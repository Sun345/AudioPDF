import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export class PDFService {
  constructor() {
    this.pdfDoc = null;
    this.numPages = 0;
    this.pageWordMaps = new Map();
    this.onWordClick = null;
  }

  /**
   * Loads a PDF from URL, TypedArray, or File with local CMaps and standard font support
   */
  async loadDocument(source) {
    const options = {
      cMapUrl: '/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/standard_fonts/'
    };

    if (typeof source === 'string') {
      options.url = source;
    } else if (source instanceof ArrayBuffer || source instanceof Uint8Array) {
      options.data = source;
    } else if (source instanceof File) {
      const buffer = await source.arrayBuffer();
      options.data = buffer;
    } else {
      throw new Error('Unsupported PDF source type');
    }

    const loadingTask = pdfjsLib.getDocument(options);
    this.pdfDoc = await loadingTask.promise;
    this.numPages = this.pdfDoc.numPages;
    this.pageWordMaps.clear();
    return this.pdfDoc;
  }

  /**
   * Renders a specific page onto a wrapper with canvas, exact word hitboxes, and active highlight box
   */
  async renderPage(pageNum, containerEl, scale = 1.25) {
    if (!this.pdfDoc) return null;
    const page = await this.pdfDoc.getPage(pageNum);
    const rotation = page.rotate || 0;
    const viewport = page.getViewport({ scale, rotation });

    // Clear previous page elements
    containerEl.innerHTML = '';

    // Page wrapper
    const pageWrapper = document.createElement('div');
    pageWrapper.className = 'pdf-page-wrapper';
    pageWrapper.id = `pdf-page-wrapper-${pageNum}`;
    pageWrapper.dataset.pageNum = pageNum;
    pageWrapper.style.width = `${viewport.width}px`;
    pageWrapper.style.height = `${viewport.height}px`;

    // HiDPI Canvas
    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-canvas';
    const outputScale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(outputScale, outputScale);

    // Interactive word hitbox overlay layer (positioned directly over canvas)
    const overlayDiv = document.createElement('div');
    overlayDiv.className = 'pdf-word-overlay';
    overlayDiv.style.width = `${viewport.width}px`;
    overlayDiv.style.height = `${viewport.height}px`;

    // Active word highlight bounding box
    const activeBox = document.createElement('div');
    activeBox.className = 'word-active-box';
    activeBox.id = `word-active-box-${pageNum}`;

    pageWrapper.appendChild(canvas);
    pageWrapper.appendChild(overlayDiv);
    pageWrapper.appendChild(activeBox);
    containerEl.appendChild(pageWrapper);

    // 1. Render Canvas
    await page.render({
      canvasContext: ctx,
      viewport: viewport
    }).promise;

    // 2. Extract Text Content & build spatial word maps
    const textContent = await page.getTextContent();
    const pageData = this.buildPixelPerfectWordMap(textContent, viewport, pageNum, overlayDiv);
    this.pageWordMaps.set(pageNum, pageData);

    return { pageWrapper, pageData, viewport, activeBox };
  }

  /**
   * Computes exact canvas pixel coordinates for every word, handling complex real PDF book fonts & layouts
   */
  buildPixelPerfectWordMap(textContent, viewport, pageNum, overlayDiv) {
    const words = [];
    let fullSpokenText = "";
    let globalWordIdx = 0;

    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');

    // Gracefully handle scanned or empty pages
    if (!textContent || !textContent.items || textContent.items.length === 0) {
      return {
        pageNum,
        words: [],
        fullText: "This page contains no readable text.",
        totalWords: 0
      };
    }

    for (let i = 0; i < textContent.items.length; i++) {
      const item = textContent.items[i];
      if (!item.str || !item.str.trim()) {
        if (!fullSpokenText.endsWith(' ')) fullSpokenText += ' ';
        continue;
      }

      // Normalize Unicode ligatures (fi, fl, smart quotes) and unprintable chars in real PDF books
      const str = item.str.normalize('NFKD').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
      if (!str.trim()) continue;

      // Convert PDF affine transform to canvas viewport pixels
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontHeight = Math.hypot(tx[2], tx[3]) || 14;
      const lineLeft = tx[4];
      const lineTop = tx[5] - (fontHeight * 0.84);
      const lineWidth = Math.max(10, (item.width || str.length * 8) * viewport.scale);
      const lineHeight = Math.max(14, fontHeight * 1.08);

      measureCtx.font = `${fontHeight}px sans-serif`;
      const measuredTotal = measureCtx.measureText(str).width || 1;
      const scaleRatio = lineWidth / measuredTotal;

      let charOffset = 0;
      const tokens = str.split(/(\s+)/);

      for (let t = 0; t < tokens.length; t++) {
        const token = tokens[t];
        if (/^\s+$/.test(token)) {
          fullSpokenText += token;
          charOffset += token.length;
        } else if (token.length > 0) {
          const prefix = str.substring(0, charOffset);
          const prefixWidth = measureCtx.measureText(prefix).width * scaleRatio;
          const wordWidth = measureCtx.measureText(token).width * scaleRatio;

          const wordRect = {
            left: Math.round(lineLeft + prefixWidth),
            top: Math.round(lineTop),
            width: Math.max(12, Math.round(wordWidth)),
            height: Math.round(lineHeight)
          };

          const wordId = `word-p${pageNum}-w${globalWordIdx}`;
          const charStart = fullSpokenText.length;
          fullSpokenText += token;
          const charEnd = fullSpokenText.length;

          const wordObj = {
            id: wordId,
            text: token,
            page: pageNum,
            wordIdx: globalWordIdx,
            charStart,
            charEnd,
            rect: wordRect
          };
          words.push(wordObj);

          // Clickable hitbox overlay element directly on the canvas text
          const hitBox = document.createElement('div');
          hitBox.className = 'tts-word-hitbox tts-word';
          hitBox.id = wordId;
          hitBox.dataset.page = pageNum;
          hitBox.dataset.wordIdx = globalWordIdx;
          hitBox.style.left = `${wordRect.left}px`;
          hitBox.style.top = `${wordRect.top}px`;
          hitBox.style.width = `${wordRect.width}px`;
          hitBox.style.height = `${wordRect.height}px`;
          hitBox.title = `Click to read: "${token}"`;

          overlayDiv.appendChild(hitBox);

          globalWordIdx++;
          charOffset += token.length;
        }
      }

      if (!fullSpokenText.endsWith(' ')) {
        fullSpokenText += ' ';
      }
    }

    return {
      pageNum,
      words,
      fullText: fullSpokenText.trim(),
      totalWords: words.length
    };
  }

  /**
   * Helper to render page thumbnail to a canvas
   */
  async renderThumbnail(pageNum, canvasEl, targetWidth = 140) {
    if (!this.pdfDoc) return;
    const page = await this.pdfDoc.getPage(pageNum);
    const rotation = page.rotate || 0;
    const unscaledViewport = page.getViewport({ scale: 1.0, rotation });
    const scale = targetWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale, rotation });

    canvasEl.width = viewport.width;
    canvasEl.height = viewport.height;
    const ctx = canvasEl.getContext('2d');

    await page.render({
      canvasContext: ctx,
      viewport: viewport
    }).promise;
  }

  getPageData(pageNum) {
    return this.pageWordMaps.get(pageNum);
  }
}
