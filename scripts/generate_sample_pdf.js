// Simple script to generate a valid multi-page PDF with readable text for testing
import fs from 'fs';
import path from 'path';

function createSamplePdf() {
  const publicDir = path.resolve('public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Raw PDF 1.4 specification objects
  const page1Text = [
    "BT",
    "/F1 24 Tf",
    "50 720 Td",
    "(Welcome to PDF Voice Reader) Tj",
    "/F2 14 Tf",
    "0 -40 Td",
    "(Experience intelligent real-time text to speech with word highlighting.) Tj",
    "0 -30 Td",
    "(This reader allows you to listen to documents effortlessly while following) Tj",
    "0 -20 Td",
    "(each word as it lights up dynamically on the page.) Tj",
    "0 -35 Td",
    "/F1 16 Tf",
    "(Key Features & Controls) Tj",
    "/F2 12 Tf",
    "0 -25 Td",
    "(1. Real-time word-level synchronization using Web Speech API.) Tj",
    "0 -20 Td",
    "(2. Interactive click-to-speak: Click any word to start listening from there.) Tj",
    "0 -20 Td",
    "(3. Multiple viewing modes: Authentic Document View and Focus Reader.) Tj",
    "0 -20 Td",
    "(4. First-class Dark Mode and Sepia warm reading tones.) Tj",
    "0 -20 Td",
    "(5. Adjustable speed, pitch, and natural system voice selection.) Tj",
    "0 -35 Td",
    "/F2 12 Tf",
    "(Click the Play button below or tap any sentence to begin reading!) Tj",
    "ET"
  ].join("\n");

  const page2Text = [
    "BT",
    "/F1 22 Tf",
    "50 720 Td",
    "(Chapter 2: The Future of Accessible Reading) Tj",
    "/F2 13 Tf",
    "0 -40 Td",
    "(Assistive technologies empower learners, researchers, and professionals) Tj",
    "0 -22 Td",
    "(to absorb complex information faster and with greater comprehension.) Tj",
    "0 -30 Td",
    "(Bimodal presentation combining synchronized auditory speech and visual) Tj",
    "0 -22 Td",
    "(text tracking dramatically enhances retention and reduces cognitive load.) Tj",
    "0 -35 Td",
    "/F1 16 Tf",
    "(Customization & Personalization) Tj",
    "/F2 12 Tf",
    "0 -25 Td",
    "(You can toggle between Dark, Light, and Sepia modes to match your) Tj",
    "0 -20 Td",
    "(ambient environment. You can also drag and drop any local PDF file) Tj",
    "0 -20 Td",
    "(into this window at any time to read research papers, books, or notes.) Tj",
    "0 -35 Td",
    "(Enjoy your listening experience!) Tj",
    "ET"
  ].join("\n");

  const stream1 = Buffer.from(page1Text, 'ascii');
  const stream2 = Buffer.from(page2Text, 'ascii');

  const objects = [];
  function addObject(content) {
    objects.push(content);
    return objects.length; // 1-indexed object ID
  }

  // 1: Catalog
  addObject(`<< /Type /Catalog /Pages 2 0 R >>`);
  // 2: Pages
  addObject(`<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>`);
  // 3: Page 1
  addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 8 0 R /F2 9 0 R >> >> >>`);
  // 4: Stream 1
  addObject(`<< /Length ${stream1.length} >>\nstream\n${page1Text}\nendstream`);
  // 5: Page 2
  // 6: Page 2 obj
  addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 7 0 R /Resources << /Font << /F1 8 0 R /F2 9 0 R >> >> >>`);
  // 7: Stream 2
  addObject(`<< /Length ${stream2.length} >>\nstream\n${page2Text}\nendstream`);
  // 8: Font F1 (Helvetica-Bold)
  addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`);
  // 9: Font F2 (Helvetica)
  addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);

  let out = `%PDF-1.4\n`;
  const offsets = [];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(out, 'ascii'));
    out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(out, 'ascii');
  out += `xref\n0 ${objects.length + 1}\n`;
  out += `0000000000 65535 f \n`;
  for (let i = 0; i < objects.length; i++) {
    const offStr = String(offsets[i]).padStart(10, '0');
    out += `${offStr} 00000 n \n`;
  }

  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const destPath = path.join(publicDir, 'sample.pdf');
  fs.writeFileSync(destPath, out, 'ascii');
  console.log(`Successfully generated sample PDF at: ${destPath}`);
}

createSamplePdf();
