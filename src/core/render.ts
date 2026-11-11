// ============================================================================
// Offscreen high-DPI rasteriser used for PNG export and print-ready PDF.
// Supports rotation, master page layer, linked text frames and print marks.
// ============================================================================
import type { CanvasElementData, PageData, PubDocument } from './model';
import { BLEED_MM, MARK_ZONE_MM, MM_TO_PX, getPageDims, masterElementsFor, pageOrientation } from './model';
import { getShape } from './shapes';
import { computeDocumentFlows, layoutText, type FrameFlow } from './textflow';

export const PRINT_DPI = 300;
export const PRINT_SCALE = PRINT_DPI / 96;

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(src: string) {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    imageCache.set(src, p);
  }
  return p;
}

export function pageNumberLabel(i: number, total: number, tpl = 'Page {n} / {t}') {
  return tpl.replace('{n}', String(i + 1)).replace('{t}', String(total));
}

export interface RenderOptions {
  scale?: number;
  /** Include bleed + crop marks (defaults to doc.printMarks). */
  printMarks?: boolean;
  pageLabel?: string;
  flows?: Map<string, FrameFlow>;
}

/** Size in mm of the exported sheet (page + bleed + mark zone when marks are on). */
export function sheetSizeMm(doc: PubDocument, marks: boolean, page?: PageData) {
  const { width, height } = getPageDims(doc, page);
  const extra = marks ? 2 * (BLEED_MM + MARK_ZONE_MM) : 0;
  return { w: width / MM_TO_PX + extra, h: height / MM_TO_PX + extra };
}

export async function renderPageToCanvas(
  doc: PubDocument,
  page: PageData,
  pageIndex: number,
  opts: RenderOptions = {}
): Promise<HTMLCanvasElement> {
  const scale = opts.scale ?? 2;
  const marks = opts.printMarks ?? !!doc.printMarks;
  const flows = opts.flows ?? computeDocumentFlows(doc);
  const { width, height } = getPageDims(doc, page);
  const off = marks ? (BLEED_MM + MARK_ZONE_MM) * MM_TO_PX : 0;
  const bleed = BLEED_MM * MM_TO_PX;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round((width + off * 2) * scale);
  canvas.height = Math.round((height + off * 2) * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width + off * 2, height + off * 2);
  ctx.translate(off, off);

  // Background extends into the bleed so trimming never leaves a white edge.
  ctx.fillStyle = page.background || '#ffffff';
  if (marks) ctx.fillRect(-bleed, -bleed, width + bleed * 2, height + bleed * 2);
  else ctx.fillRect(0, 0, width, height);

  const total = doc.pages.length;
  const layers: CanvasElementData[][] = [];
  const master = masterElementsFor(doc, page);
  if (master.length) layers.push(master);
  layers.push(page.elements);

  for (const layer of layers) {
    for (const el of [...layer].sort((a, b) => a.zIndex - b.zIndex)) {
      await drawElement(ctx, el, pageIndex, total, flows, opts.pageLabel);
    }
  }

  if (marks) drawPrintMarks(ctx, width, height, bleed);
  return canvas;
}

async function drawElement(
  ctx: CanvasRenderingContext2D,
  el: CanvasElementData,
  pageIndex: number,
  total: number,
  flows: Map<string, FrameFlow>,
  pageLabel?: string
) {
  ctx.save();
  if (el.opacity !== undefined) ctx.globalAlpha = el.opacity;
  if (el.rotation) {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  const hasStroke = (el.strokeWidth ?? 0) > 0 && el.strokeColor && el.strokeColor !== 'transparent';
  const hasFill = el.fillColor && el.fillColor !== 'transparent';

  if (el.type === 'shape') {
    ctx.fillStyle = el.fillColor || '#e2e8f0';
    ctx.strokeStyle = el.strokeColor || '#64748b';
    ctx.lineWidth = el.strokeWidth ?? 1;
    if (el.shapeVariant === 'circle') {
      ctx.beginPath();
      ctx.ellipse(el.x + el.width / 2, el.y + el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
      if (hasFill) ctx.fill();
      if (hasStroke) ctx.stroke();
    } else if (el.shapeVariant === 'line') {
      ctx.fillStyle = el.strokeColor || '#4f46e5';
      const t = Math.max(2, el.strokeWidth || 3);
      ctx.fillRect(el.x, el.y + el.height / 2 - t / 2, el.width, t);
    } else if (getShape(el.shapeVariant)?.path) {
      const def = getShape(el.shapeVariant)!;
      // Scale the 100×100 path to the element box; the stroke keeps its real width.
      const p = new Path2D();
      p.addPath(new Path2D(def.path!), new DOMMatrix().translate(el.x, el.y).scale(el.width / 100, el.height / 100));
      ctx.lineJoin = 'round';
      if (hasFill) ctx.fill(p, def.evenodd ? 'evenodd' : 'nonzero');
      if (hasStroke) ctx.stroke(p);
    } else {
      ctx.beginPath();
      roundRect(ctx, el.x, el.y, el.width, el.height, el.borderRadius || 0);
      if (hasFill) ctx.fill();
      if (hasStroke) ctx.stroke();
    }
  } else if (el.type === 'border') {
    ctx.strokeStyle = el.strokeColor || '#4f46e5';
    ctx.lineWidth = el.strokeWidth || 3;
    ctx.strokeRect(el.x, el.y, el.width, el.height);
    if (el.borderPreset === 'double' || el.borderPreset === 'ornate') {
      ctx.lineWidth = 1;
      ctx.strokeRect(el.x + 6, el.y + 6, el.width - 12, el.height - 12);
    }
  } else if (el.type === 'image' && el.imageUrl) {
    const img = await loadImage(el.imageUrl);
    if (img) {
      const fit = el.imageFit ?? 'cover';
      if (fit === 'fill') ctx.drawImage(img, el.x, el.y, el.width, el.height);
      else if (fit === 'contain') {
        const r = Math.min(el.width / img.width, el.height / img.height);
        const w = img.width * r;
        const h = img.height * r;
        ctx.drawImage(img, el.x + (el.width - w) / 2, el.y + (el.height - h) / 2, w, h);
      } else {
        const r = Math.max(el.width / img.width, el.height / img.height);
        const sw = el.width / r;
        const sh = el.height / r;
        ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, el.x, el.y, el.width, el.height);
      }
    } else {
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(el.x, el.y, el.width, el.height);
    }
    if (hasStroke) {
      ctx.strokeStyle = el.strokeColor!;
      ctx.lineWidth = el.strokeWidth || 1;
      ctx.strokeRect(el.x, el.y, el.width, el.height);
    }
  } else if (el.type === 'table' && el.tableData) {
    const rows = el.tableData.length;
    const cols = el.tableData[0]?.length || 1;
    const cw = el.width / cols;
    const ch = el.height / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = el.x + c * cw;
        const cy = el.y + r * ch;
        ctx.fillStyle = r === 0 ? headerTint(el.strokeColor) : el.fillColor || '#ffffff';
        ctx.fillRect(cx, cy, cw, ch);
        ctx.strokeStyle = el.strokeColor || '#94a3b8';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy, cw, ch);
        ctx.fillStyle = el.fontColor || '#0f172a';
        ctx.font = `${r === 0 ? 'bold ' : ''}${el.fontSize || 13}px ${el.fontFamily || 'Inter, sans-serif'}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(el.tableData[r][c] || '', cx + 8, cy + ch / 2, cw - 14);
      }
    }
  } else if (el.type === 'text' || el.type === 'pagenum') {
    if (hasFill) {
      ctx.fillStyle = el.fillColor!;
      ctx.fillRect(el.x, el.y, el.width, el.height);
    }
    if (hasStroke) {
      // Inside stroke, like the on-screen border
      const sw = el.strokeWidth || 1;
      ctx.strokeStyle = el.strokeColor!;
      ctx.lineWidth = sw;
      ctx.strokeRect(el.x + sw / 2, el.y + sw / 2, el.width - sw, el.height - sw);
    }
    const flow = el.type === 'pagenum' ? layoutText(el, pageNumberLabel(pageIndex, total, pageLabel)) : flows.get(el.id);
    ctx.save();
    ctx.beginPath();
    ctx.rect(el.x, el.y, el.width, el.height);
    ctx.clip();
    if (flow) drawFlow(ctx, flow, el.x, el.y);
    ctx.restore();
  }
  ctx.restore();
}

function headerTint(stroke?: string) {
  if (!stroke || stroke === 'transparent') return '#e6f4f5';
  return stroke + '33'; // stroke colour at 20 % alpha
}

/** Draws laid-out text segments (same positions as on screen). */
export function drawFlow(ctx: CanvasRenderingContext2D, flow: FrameFlow, x0: number, y0: number) {
  const [pl, pt] = flow.pad;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  for (const line of flow.lines) {
    const by = y0 + pt + flow.offsetY + line.y + line.baseline;
    for (const s of line.segs) {
      const text = s.text.replace(/	/g, '    ');
      if (!text.trim()) continue;
      ctx.font = s.style.font;
      ctx.fillStyle = s.style.color;
      ctx.direction = line.rtl ? 'rtl' : 'ltr';
      const x = x0 + pl + s.x;
      const y = by + s.style.shift;
      ctx.fillText(text, x, y);
      if (s.style.underline) ctx.fillRect(x, y + s.style.size * 0.12, s.w, Math.max(0.75, s.style.size / 15));
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Crop marks at the four trim corners + registration targets at mid-edges. */
export function drawPrintMarks(ctx: CanvasRenderingContext2D, w: number, h: number, bleed: number) {
  const len = 7 * MM_TO_PX;
  const gap = bleed + 1;
  ctx.save();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 0.6;
  const corners: [number, number, number, number][] = [
    [0, 0, -1, -1],
    [w, 0, 1, -1],
    [0, h, -1, 1],
    [w, h, 1, 1]
  ];
  ctx.beginPath();
  for (const [cx, cy, sx, sy] of corners) {
    ctx.moveTo(cx + sx * gap, cy);
    ctx.lineTo(cx + sx * (gap + len), cy);
    ctx.moveTo(cx, cy + sy * gap);
    ctx.lineTo(cx, cy + sy * (gap + len));
  }
  ctx.stroke();
  const reg = (x: number, y: number) => {
    const r = 2.2 * MM_TO_PX;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.moveTo(x - r * 1.6, y);
    ctx.lineTo(x + r * 1.6, y);
    ctx.moveTo(x, y - r * 1.6);
    ctx.lineTo(x, y + r * 1.6);
    ctx.stroke();
  };
  const d = gap + len / 2 + 2;
  reg(w / 2, -d);
  reg(w / 2, h + d);
  reg(-d, h / 2);
  reg(w + d, h / 2);
  ctx.restore();
}

/** Opens a print window containing every page (save as PDF from there). */
export async function exportPrintPdf(
  doc: PubDocument,
  labels: { title: string; printBtn: string; pageLabel: string; popupBlocked: string },
  pageIndices?: number[]
): Promise<boolean> {
  const marks = !!doc.printMarks;
  const flows = computeDocumentFlows(doc);
  const win = window.open('', '_blank', 'width=1000,height=820');
  if (!win) {
    alert(labels.popupBlocked);
    return false;
  }
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title></head>
<body style="font-family:system-ui;padding:40px;color:#0b4f5c">${escapeHtml(labels.title)}…</body></html>`);
  const indices = pageIndices?.length ? pageIndices : doc.pages.map((_, i) => i);
  const sheets: { url: string; o: string }[] = [];
  for (const i of indices) {
    const c = await renderPageToCanvas(doc, doc.pages[i], i, {
      scale: PRINT_SCALE,
      printMarks: marks,
      flows,
      pageLabel: labels.pageLabel
    });
    sheets.push({ url: await canvasToObjectUrl(c), o: pageOrientation(doc, doc.pages[i]) });
  }
  // Named @page rules let portrait and landscape sheets coexist in one PDF.
  const sizeOf = (o: string) => {
    const { w, h } = sheetSizeMm(doc, marks, { orientation: o as PageData['orientation'] } as PageData);
    return { w: w.toFixed(2), h: h.toFixed(2) };
  };
  const P = sizeOf('portrait');
  const L = sizeOf('landscape');
  const first = sheets[0]?.o === 'landscape' ? L : P;
  win.document.open();
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title>
<style>
@page { size: ${first.w}mm ${first.h}mm; margin: 0; }
@page portrait { size: ${P.w}mm ${P.h}mm; margin: 0; }
@page landscape { size: ${L.w}mm ${L.h}mm; margin: 0; }
html,body{margin:0;padding:0;background:#e2e8f0;font-family:system-ui,sans-serif}
.bar{position:sticky;top:0;background:#0b4f5c;color:#fff;padding:12px 24px;display:flex;justify-content:space-between;align-items:center}
.btn{background:#14b8a6;color:#fff;border:0;padding:9px 18px;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px}
.sheet{margin:20px auto;background:#fff;box-shadow:0 8px 24px rgba(0,0,0,.25);break-after:page}
.sheet img{width:100%;height:100%;display:block}
.portrait{page:portrait;width:${P.w}mm;height:${P.h}mm}
.landscape{page:landscape;width:${L.w}mm;height:${L.h}mm}
@media print{body{background:#fff}.bar{display:none}.sheet{margin:0;box-shadow:none}}
</style></head><body>
<div class="bar"><div><b>${escapeHtml(doc.title)}</b> · ${sheets.length} p · ${PRINT_DPI} dpi</div>
<button class="btn" onclick="window.print()">${escapeHtml(labels.printBtn)}</button></div>
${sheets.map((s) => `<div class="sheet ${s.o}"><img src="${s.url}"></div>`).join('')}
<script>window.onload=function(){setTimeout(function(){window.print()},500)}</script>
</body></html>`);
  win.document.close();
  return true;
}

export async function exportPagePng(doc: PubDocument, pageIndex: number, pageLabel: string): Promise<Blob> {
  const c = await renderPageToCanvas(doc, doc.pages[pageIndex], pageIndex, {
    scale: PRINT_SCALE,
    pageLabel
  });
  return new Promise((resolve) => c.toBlob((b) => resolve(b!), 'image/png'));
}

function canvasToObjectUrl(c: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve) =>
    c.toBlob((b) => resolve(b ? URL.createObjectURL(b) : c.toDataURL('image/png')), 'image/png')
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
