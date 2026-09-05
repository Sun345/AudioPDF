# AudioPDF — Real-Time TTS & Word Highlighting PDF Reader

An intelligent, web-based PDF reader that reads documents aloud using the Web Speech API (Text-to-Speech) and dynamically highlights words in real-time as they are spoken. Designed with a sleek obsidian glassmorphism aesthetic, full Dark Mode support, and interactive click-to-speak navigation.

![AudioPDF Preview](https://img.shields.io/badge/PDF.js-v4.10-blue?style=for-the-badge&logo=adobe)
![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?style=for-the-badge&logo=vite)
![Web Speech API](https://img.shields.io/badge/Web_Speech_API-TTS-green?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-purple?style=for-the-badge)

---

## Features

- 🎙️ **Real-Time Word Highlighting**: Active words light up with an animated glowing pill both on the PDF canvas and in the Focus Teleprompter view.
- 🎯 **Interactive Click-to-Speak**: Tap or click any word on the PDF page or teleprompter to start listening from that exact position.
- 🌙 **First-Class Dark Mode**: Intelligent PDF Canvas Dark Filter that transforms stark white pages into sleek dark sheets with crisp, high-contrast typography (plus Sepia and Light modes).
- 📖 **Multi-View Modes**:
  - **Document View**: Authentic PDF layout with zoom and thumbnail sidebar.
  - **Focus Teleprompter View**: Distraction-free typography with centered word highlighting.
  - **Split View**: Side-by-side synchronized view with both PDF canvas and teleprompter transcript.
- ⚡ **Seamless Rate & Voice Control**: Change speeds (0.75x, 1.0x, 1.25x, 1.5x, 2.0x) on the fly with calibrated non-linear rate synchronization. Supports all installed OS and natural voices.
- 📚 **Full Support for Real PDF Books**: Bundled Mozilla PDF.js CMaps and standard fonts, rotation support, and lazy on-demand thumbnail generation via `IntersectionObserver` to handle multi-hundred-page books lag-free.
- 📄 **Drag-and-Drop & Bundled Sample**: Drag and drop any PDF file to read instantly, or click "Sample PDF" for 1-click testing.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18+ recommended)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/SAbhishek_ndtv/PDFReader.git
   cd PDFReader
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the local development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:5173/
   ```

---

## Production Build

To create an optimized production build:
```bash
npm run build
```

To preview the production build locally:
```bash
npm run preview
```

---

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES modules) & Vanilla CSS
- **PDF Engine**: Mozilla's [`pdfjs-dist`](https://github.com/mozilla/pdf.js) v4
- **Speech Synthesis**: Web Speech API (`speechSynthesis` and `SpeechSynthesisUtterance`)
- **Build Tool**: [Vite](https://vitejs.dev/)

---

## License

This project is licensed under the MIT License.
