import type { CanvasElementData } from '../core/model';
import { elementBounds } from '../core/model';

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
export const HANDLE_CURSOR: Record<Handle, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize'
};

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function unionBounds(els: CanvasElementData[]): Box | null {
  if (!els.length) return null;
  let x1 = Infinity,
    y1 = Infinity,
    x2 = -Infinity,
    y2 = -Infinity;
  for (const e of els) {
    const b = elementBounds(e);
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Resize an element from a handle, working in the element's rotated frame. */
export function resizeElement(
  o: CanvasElementData,
  handle: Handle,
  dx: number,
  dy: number,
  keepRatio: boolean,
  grid: number
): Pick<CanvasElementData, 'x' | 'y' | 'width' | 'height'> {
  const min = 12;
  const rad = ((o.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ldx = dx * cos + dy * sin;
  const ldy = -dx * sin + dy * cos;
  const sx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
  const sy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
  let w = sx ? Math.max(min, o.width + sx * ldx) : o.width;
  let h = sy ? Math.max(min, o.height + sy * ldy) : o.height;
  if (!o.rotation && grid > 1) {
    if (sx) w = Math.max(min, Math.round(w / grid) * grid);
    if (sy) h = Math.max(min, Math.round(h / grid) * grid);
  }
  if (keepRatio && sx && sy) {
    const s = Math.max(w / o.width, h / o.height);
    w = Math.max(min, o.width * s);
    h = Math.max(min, o.height * s);
  }
  const cxl = (sx * (w - o.width)) / 2;
  const cyl = (sy * (h - o.height)) / 2;
  const cx = o.x + o.width / 2 + cxl * cos - cyl * sin;
  const cy = o.y + o.height / 2 + cxl * sin + cyl * cos;
  return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), width: Math.round(w), height: Math.round(h) };
}

export interface SnapResult {
  dx: number;
  dy: number;
  guidesX: number[];
  guidesY: number[];
}

/**
 * Smart alignment guides: snaps the moving box's edges / centre to page
 * edges, page centre, margins and other objects.
 */
export function smartSnap(
  box: Box,
  dx: number,
  dy: number,
  others: CanvasElementData[],
  page: { w: number; h: number; margin: number },
  threshold: number
): SnapResult {
  const xs = [0, page.w / 2, page.w, page.margin, page.w - page.margin];
  const ys = [0, page.h / 2, page.h, page.margin, page.h - page.margin];
  for (const o of others) {
    const b = elementBounds(o);
    xs.push(b.x, b.x + b.w / 2, b.x + b.w);
    ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  const mx = [box.x + dx, box.x + dx + box.w / 2, box.x + dx + box.w];
  const my = [box.y + dy, box.y + dy + box.h / 2, box.y + dy + box.h];

  let bestX = { d: threshold + 1, adj: 0 };
  for (const m of mx)
    for (const t of xs) {
      const d = Math.abs(t - m);
      if (d < bestX.d) bestX = { d, adj: t - m };
    }
  let bestY = { d: threshold + 1, adj: 0 };
  for (const m of my)
    for (const t of ys) {
      const d = Math.abs(t - m);
      if (d < bestY.d) bestY = { d, adj: t - m };
    }
  const outDx = bestX.d <= threshold ? dx + bestX.adj : dx;
  const outDy = bestY.d <= threshold ? dy + bestY.adj : dy;

  // Collect every guide line that now matches exactly.
  const guidesX: number[] = [];
  const guidesY: number[] = [];
  if (bestX.d <= threshold) {
    const fx = [box.x + outDx, box.x + outDx + box.w / 2, box.x + outDx + box.w];
    for (const t of xs) if (fx.some((m) => Math.abs(m - t) < 0.5) && !guidesX.includes(t)) guidesX.push(t);
  }
  if (bestY.d <= threshold) {
    const fy = [box.y + outDy, box.y + outDy + box.h / 2, box.y + outDy + box.h];
    for (const t of ys) if (fy.some((m) => Math.abs(m - t) < 0.5) && !guidesY.includes(t)) guidesY.push(t);
  }
  return { dx: outDx, dy: outDy, guidesX, guidesY };
}

export type AlignOp = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'distH' | 'distV';

/** Align / distribute. With one element, aligns relative to the page. */
export function alignElements(
  els: CanvasElementData[],
  op: AlignOp,
  page: { w: number; h: number }
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (!els.length) return out;
  const ref: Box = els.length === 1 ? { x: 0, y: 0, w: page.w, h: page.h } : unionBounds(els)!;
  const withB = els.map((e) => ({ e, b: elementBounds(e) }));
  if (op === 'distH' || op === 'distV') {
    if (els.length < 3) return out;
    const horiz = op === 'distH';
    const sorted = [...withB].sort((a, b) => (horiz ? a.b.x - b.b.x : a.b.y - b.b.y));
    const total = sorted.reduce((s, x) => s + (horiz ? x.b.w : x.b.h), 0);
    const span = horiz ? ref.w : ref.h;
    const gap = (span - total) / (sorted.length - 1);
    let cur = horiz ? ref.x : ref.y;
    for (const { e, b } of sorted) {
      if (horiz) out.set(e.id, { x: Math.round(e.x + (cur - b.x)), y: e.y });
      else out.set(e.id, { x: e.x, y: Math.round(e.y + (cur - b.y)) });
      cur += (horiz ? b.w : b.h) + gap;
    }
    return out;
  }
  for (const { e, b } of withB) {
    let nx = b.x;
    let ny = b.y;
    if (op === 'left') nx = ref.x;
    if (op === 'hcenter') nx = ref.x + ref.w / 2 - b.w / 2;
    if (op === 'right') nx = ref.x + ref.w - b.w;
    if (op === 'top') ny = ref.y;
    if (op === 'vcenter') ny = ref.y + ref.h / 2 - b.h / 2;
    if (op === 'bottom') ny = ref.y + ref.h - b.h;
    out.set(e.id, { x: Math.round(e.x + (nx - b.x)), y: Math.round(e.y + (ny - b.y)) });
  }
  return out;
}

export function rectsIntersect(a: Box, b: Box) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Reads an image file, downscaling very large pictures to keep storage small. */
export function readImageFile(file: File): Promise<{ url: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const src = String(reader.result);
      const img = new Image();
      img.onerror = () => reject(new Error('image'));
      img.onload = () => {
        const max = 2000;
        const long = Math.max(img.width, img.height);
        if (long <= max) return resolve({ url: src, w: img.width, h: img.height });
        const s = max / long;
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve({ url: c.toDataURL(type, 0.9), w: c.width, h: c.height });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
