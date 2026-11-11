import type { CanvasElementData, PubDocument, PubImportReport } from './model';
import { isCfb } from './cfb';
import { readPublisher, readPublisherTexts, type PubPicture } from './pubformat';
import { convertPublisher, type PictureRequest } from './pubimport';

// ============================================================================
// Microsoft Publisher (.pub) import
// ============================================================================

/** Longest side of imported pictures (≈ 200 dpi on an A4 page). */
const MAX_PICTURE_SIDE = 2200;
/** Pictures smaller than this are kept byte-for-byte when not cropped. */
const KEEP_ORIGINAL_BYTES = 900_000;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}

/** Grey box shown for pictures browsers cannot display (EMF, WMF, TIFF…). */
function placeholderPicture(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="4"/><path d="M150 190l40-50 30 36 20-24 40 38z" fill="#94a3b8"/><circle cx="245" cy="115" r="14" fill="#94a3b8"/><text x="200" y="245" font-family="Arial" font-size="18" fill="#64748b" text-anchor="middle">${escapeXml(label.slice(0, 40))}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const probe = document.createElement('canvas');
  probe.width = 48;
  probe.height = 48;
  const c = probe.getContext('2d', { willReadFrequently: true })!;
  c.drawImage(canvas, 0, 0, 48, 48);
  const d = c.getImageData(0, 0, 48, 48).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}

async function pictureToDataUrl(pic: PubPicture | null, req: PictureRequest): Promise<{ url: string; ok: boolean }> {
  if (!pic || pic.metafile || pic.mime === 'image/tiff') {
    return { url: placeholderPicture(req.name || (pic ? pic.mime.replace('image/', '').toUpperCase() : 'Image')), ok: false };
  }
  const blob = new Blob([pic.bytes as BlobPart], { type: pic.mime });
  const crop = req.crop.map((c) => Math.max(0, Math.min(0.95, c))) as [number, number, number, number];
  const cropped = crop.some((c) => c > 0.0005);
  if (!cropped && pic.bytes.length <= KEEP_ORIGINAL_BYTES && pic.mime !== 'image/bmp') return { url: await blobToDataUrl(blob), ok: true };
  try {
    const bmp = await createImageBitmap(blob);
    const sx = bmp.width * crop[0];
    const sy = bmp.height * crop[1];
    const sw = Math.max(1, bmp.width * (1 - crop[0] - crop[2]));
    const sh = Math.max(1, bmp.height * (1 - crop[1] - crop[3]));
    const scale = Math.min(1, MAX_PICTURE_SIDE / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const c = canvas.getContext('2d')!;
    c.imageSmoothingQuality = 'high';
    c.drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const keepPng = pic.mime !== 'image/jpeg' && hasTransparency(canvas);
    return { url: canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', 0.9), ok: true };
  } catch {
    return { url: await blobToDataUrl(blob), ok: true };
  }
}

/** True when the browser can render this font (system font detection). */
export function isFontAvailable(name: string): boolean {
  try {
    const c = document.createElement('canvas').getContext('2d')!;
    const sample = 'mmmmmmmmmmlli WW@#0123 éàç';
    for (const generic of ['monospace', 'serif', 'sans-serif']) {
      c.font = `64px ${generic}`;
      const w0 = c.measureText(sample).width;
      c.font = `64px "${name}", ${generic}`;
      if (Math.abs(c.measureText(sample).width - w0) > 0.5) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function eachElement(doc: PubDocument, fn: (e: CanvasElementData) => void) {
  for (const p of doc.pages) p.elements.forEach(fn);
  doc.master?.elements.forEach(fn);
}

/**
 * Converts a Publisher 2002–2021 file: page size and orientation, every page,
 * the master page, text frames with their formatting, tables, pictures and
 * shapes.
 */
export async function parsePublisherBinaryBuffer(fileName: string, buffer: ArrayBuffer): Promise<PubImportReport> {
  const bytes = new Uint8Array(buffer);
  const title = fileName.replace(/\.[^.]+$/, '');
  if (!isCfb(bytes)) throw new Error('not-ole2');
  let pf: ReturnType<typeof readPublisher>;
  let conv: ReturnType<typeof convertPublisher>;
  try {
    pf = readPublisher(bytes);
    conv = convertPublisher(pf, title);
    if (!conv.doc.pages.some((p) => p.elements.length)) throw new Error('empty');
  } catch (err) {
    console.warn('[OpenPublisher] layout not readable, importing texts only', err);
    return textOnlyImport(fileName, bytes);
  }

  // Pictures → data URLs (cropped and resized once, at import time)
  let unsupported = 0;
  const urls = new Map<string, string>();
  for (const req of conv.pictures) {
    const res = await pictureToDataUrl(pf.pictures[req.index] ?? null, req);
    if (!res.ok) unsupported++;
    urls.set(req.key, res.url);
  }
  eachElement(conv.doc, (e) => {
    if (e.imageUrl && urls.has(e.imageUrl)) e.imageUrl = urls.get(e.imageUrl);
  });

  const usedFonts = conv.fonts.filter((f) => !/^(symbol|wingdings|webdings)/i.test(f));
  const missingFonts = usedFonts.filter((f) => !isFontAvailable(f));

  const blocks: string[] = [];
  eachElement(conv.doc, (e) => {
    if (e.type === 'text' && e.text?.trim() && blocks.length < 12) blocks.push(e.text.trim().slice(0, 120));
  });

  const w = conv.doc.widthMm;
  const h = conv.doc.heightMm;
  return {
    fileName,
    fileSize: buffer.byteLength,
    formatDetected: 'OLE2-PUB',
    ole2MagicValid: true,
    extractedTextBlocks: blocks,
    extractedImagesCount: conv.stats.pictures,
    detectedPageSize: { preset: conv.doc.pageSize, widthMm: w, heightMm: h, orientation: conv.doc.orientation },
    warnings: [],
    stats: { ...conv.stats, unsupportedPictures: unsupported },
    missingFonts,
    generatedDoc: conv.doc
  };
}

/** Older or damaged .pub files: every recovered text in its own frame, on A4 pages. */
function textOnlyImport(fileName: string, bytes: Uint8Array): PubImportReport {
  const texts = readPublisherTexts(bytes);
  if (!texts.length) throw new Error('no-text');
  const pages: PubDocument['pages'] = [];
  let els: CanvasElementData[] = [];
  let y = 45;
  const flush = () => {
    pages.push({ id: `page-${Date.now()}-${pages.length}`, name: `Page ${pages.length + 1}`, background: '#ffffff', elements: els });
    els = [];
    y = 45;
  };
  texts.forEach((t, i) => {
    const lines = t.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 80)), 0);
    const h = Math.min(980, lines * 21 + 16);
    if (y + h > 1080 && els.length) flush();
    els.push({
      id: `txt-${Date.now()}-${i}`,
      type: 'text',
      x: 45,
      y,
      width: 704,
      height: h,
      zIndex: els.length + 1,
      text: t,
      fontFamily: 'Arial, sans-serif',
      fontSize: 15,
      fontColor: '#0f172a',
      textAlign: 'left'
    });
    y += h + 12;
  });
  if (els.length) flush();
  const doc: PubDocument = {
    id: `imported-${Date.now()}`,
    title: fileName.replace(/\.[^.]+$/, ''),
    category: 'Publisher',
    updatedAt: new Date().toISOString(),
    pageSize: 'A4',
    widthMm: 210,
    heightMm: 297,
    orientation: 'portrait',
    marginMm: 12,
    pages
  };
  return {
    fileName,
    fileSize: bytes.byteLength,
    formatDetected: 'RAW-BINARY-PUB',
    ole2MagicValid: true,
    extractedTextBlocks: texts.slice(0, 12),
    extractedImagesCount: 0,
    detectedPageSize: { preset: 'A4', widthMm: 210, heightMm: 297, orientation: 'portrait' },
    warnings: ['layout-not-readable'],
    generatedDoc: doc
  };
}

/**
 * Fallback importer for .html, .htm, .docx, and plain text files
 */
export async function parseFallbackDocumentFile(file: File): Promise<PubImportReport> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const textContent = await file.text();
  const blocks: string[] = [];

  if (ext === 'html' || ext === 'htm') {
    const parser = new DOMParser();
    const dom = parser.parseFromString(textContent, 'text/html');
    const nodes = dom.querySelectorAll('h1, h2, h3, p, li, td');
    nodes.forEach((n) => {
      const t = n.textContent?.trim();
      if (t && t.length > 2) blocks.push(t);
    });
  } else {
    // Extract readable XML/text runs from .docx or plain text
    const cleaned = textContent
      .replace(/<[^>]+>/g, '\n')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3 && /[a-zA-Z]{2,}/.test(s));
    blocks.push(...cleaned.slice(0, 15));
  }

  if (blocks.length === 0) {
    blocks.push(`Imported Fallback Document (${file.name})`, 'Edit this frame on the canvas.');
  }

  const elements: CanvasElementData[] = blocks.slice(0, 10).map((b, i) => ({
    id: `fb-el-${Date.now()}-${i}`,
    type: 'text',
    x: 50,
    y: 60 + i * 92,
    width: 690,
    height: 76,
    zIndex: i + 1,
    text: b,
    fontFamily: i === 0 ? 'Georgia, serif' : 'Inter, sans-serif',
    fontSize: i === 0 ? 26 : 14,
    fontColor: '#0f172a',
    bold: i === 0,
    textAlign: 'left',
    fillColor: i === 0 ? 'transparent' : '#f8fafc',
    strokeColor: i === 0 ? 'transparent' : '#e2e8f0',
    strokeWidth: i === 0 ? 0 : 1
  }));

  const generatedDoc: PubDocument = {
    id: `imported-fb-${Date.now()}`,
    title: file.name.replace(/\.[^.]+$/, ''),
    category: `Imported ${ext.toUpperCase()} Fallback`,
    updatedAt: new Date().toISOString(),
    pageSize: 'A4',
    widthMm: 210,
    heightMm: 297,
    orientation: 'portrait',
    marginMm: 15,
    pages: [
      {
        id: 'page-fb-1',
        name: 'Imported Page 1',
        background: '#ffffff',
        backgroundPattern: 'none',
        elements
      }
    ]
  };

  return {
    fileName: file.name,
    fileSize: file.size,
    formatDetected: ext === 'docx' ? 'DOCX-FALLBACK' : 'HTML-FALLBACK',
    ole2MagicValid: true,
    extractedTextBlocks: blocks.slice(0, 10),
    extractedImagesCount: 0,
    detectedPageSize: { preset: 'A4', widthMm: 210, heightMm: 297, orientation: 'portrait' },
    warnings: [
      'Imported via HTML/.DOCX fallback pipeline. Paragraph blocks were mapped to individual Publisher text frames.'
    ],
    generatedDoc
  };
}
