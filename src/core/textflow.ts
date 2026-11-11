// ============================================================================
// Text layout & linked text frames ("story autoflow")
// One measuring engine is shared by the on-screen canvas and the PDF/PNG
// exporter: it computes the position of every styled text segment, so line
// breaks and positions are identical everywhere.
// ============================================================================
import type { CanvasElementData, ParaFormat, PubDocument, TextAlign, TextRun } from './model';
import { lineFactor } from './fontmetrics';
import { normalizeParas, validRuns } from './richtext';

export const TEXT_PAD = 6;
/** Line height (× font size) of plain, non-imported text frames. */
export const LINE_HEIGHT = 1.32;

export interface SegStyle {
  /** CSS / canvas font shorthand. */
  font: string;
  family: string;
  /** Rendered size in px (after superscript scaling). */
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  /** Baseline shift in px (negative = up). */
  shift: number;
}

export interface Seg {
  text: string;
  /** Left position relative to the content box. */
  x: number;
  w: number;
  style: SegStyle;
  /** Font ascent / descent in px. */
  asc: number;
  desc: number;
}

export interface LaidLine {
  text: string;
  /** Last line of a paragraph (never stretched when justified). */
  endsPara: boolean;
  segs: Seg[];
  /** Top of the line box relative to the content box (before vertical alignment). */
  y: number;
  height: number;
  /** Baseline offset from the top of the line box. */
  baseline: number;
  /** Paragraph direction (bidi base direction of every segment). */
  rtl?: boolean;
}

export interface FrameFlow {
  lines: LaidLine[];
  /** Text did not fit and has nowhere to go (last frame of the chain). */
  overflow: boolean;
  /** Id of the first frame of the story this frame belongs to. */
  storyHeadId: string;
  /** Position of this frame in its chain (0 = head). */
  chainIndex: number;
  /** Height used by the laid lines. */
  contentHeight: number;
  /** Vertical alignment offset added to every line. */
  offsetY: number;
  /** Inner margins: left, top, right, bottom. */
  pad: [number, number, number, number];
}

// ---------------------------------------------------------------- measuring
let measureCtx: CanvasRenderingContext2D | null = null;
function ctx(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}
const widthCache = new Map<string, number>();
const metricCache = new Map<string, { asc: number; desc: number }>();
const flowCache = new WeakMap<CanvasElementData, FrameFlow>();
let cacheEpoch = 0;

function measure(font: string, text: string): number {
  const key = font + '\u0001' + text;
  let w = widthCache.get(key);
  if (w === undefined) {
    const c = ctx();
    c.font = font;
    w = c.measureText(text.replace(/\t/g, '    ')).width;
    if (widthCache.size > 200000) widthCache.clear();
    widthCache.set(key, w);
  }
  return w;
}

function metrics(style: SegStyle): { asc: number; desc: number } {
  let m = metricCache.get(style.font);
  if (!m) {
    const c = ctx();
    c.font = style.font;
    const tm = c.measureText('Hgé');
    const asc = tm.fontBoundingBoxAscent ?? style.size * 0.9;
    const desc = tm.fontBoundingBoxDescent ?? style.size * 0.25;
    m = { asc: Number.isFinite(asc) ? asc : style.size * 0.9, desc: Number.isFinite(desc) ? desc : style.size * 0.25 };
    metricCache.set(style.font, m);
  }
  return m;
}

/** Forget measurements (call when fonts finish loading). */
export function resetTextMeasurements() {
  widthCache.clear();
  metricCache.clear();
  cacheEpoch++;
}
export const textMeasureEpoch = () => cacheEpoch;

if (typeof document !== 'undefined' && document.fonts?.addEventListener) {
  document.fonts.addEventListener('loadingdone', () => resetTextMeasurements());
}

// ---------------------------------------------------------------- styles
export function fontString(el: Pick<CanvasElementData, 'italic' | 'bold' | 'fontSize' | 'fontFamily'>): string {
  return `${el.italic ? 'italic ' : ''}${el.bold ? 'bold ' : ''}${el.fontSize || 16}px ${el.fontFamily || 'Inter, sans-serif'}`;
}

function resolveStyle(el: CanvasElementData, run?: TextRun): SegStyle {
  const bold = run?.bold ?? !!el.bold;
  const italic = run?.italic ?? !!el.italic;
  const family = run?.fontFamily ?? el.fontFamily ?? 'Inter, sans-serif';
  const base = run?.fontSize ?? el.fontSize ?? 16;
  const script = run?.script ?? 0;
  const size = script ? base * 0.62 : base;
  return {
    font: `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${Math.round(size * 100) / 100}px ${family}`,
    family,
    size,
    bold,
    italic,
    underline: run?.underline ?? !!el.underline,
    color: run?.fontColor ?? el.fontColor ?? '#0f172a',
    shift: script === 1 ? -base * 0.36 : script === -1 ? base * 0.14 : 0
  };
}

// ---------------------------------------------------------------- story model
interface Piece {
  text: string;
  style: SegStyle;
  /** Unscaled font size, used for line height. */
  size: number;
}
interface Token {
  pieces: Piece[];
  w: number;
  space: boolean;
}
interface Para {
  tokens: Token[];
  fmt: ParaFormat;
  /** Style of the paragraph mark (height of empty lines). */
  mark: SegStyle;
  markSize: number;
  /** Right-to-left paragraph (first strong character is Arabic / Hebrew). */
  rtl: boolean;
}

const RTL_CHAR = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;
const LTR_CHAR = /[A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff]/;
const STRONG = /[A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;

/** Direction of a paragraph from its first strong character. */
export function isRtlText(text: string): boolean {
  const m = text.match(STRONG);
  return !!m && RTL_CHAR.test(m[0]);
}

/**
 * Visual order for a right-to-left line: segments are mirrored inside the
 * line, while runs of left-to-right segments (Latin words, numbers) keep
 * their own order.
 */
function mirrorRtl(segs: Seg[]) {
  const visible = segs.filter((s) => s.text.trim());
  if (!visible.length) return;
  const L = Math.min(...visible.map((s) => s.x));
  const R = Math.max(...visible.map((s) => s.x + s.w));
  for (const s of segs) s.x = L + R - (s.x + s.w);
  // Re-reverse consecutive left-to-right segments (logical order kept in segs)
  let i = 0;
  while (i < segs.length) {
    if (!LTR_CHAR.test(segs[i].text) || RTL_CHAR.test(segs[i].text)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < segs.length && !RTL_CHAR.test(segs[j + 1].text) && (LTR_CHAR.test(segs[j + 1].text) || !segs[j + 1].text.trim())) j++;
    while (j > i && !segs[j].text.trim()) j--;
    if (j > i) {
      const gl = Math.min(...segs.slice(i, j + 1).map((s) => s.x));
      const gr = Math.max(...segs.slice(i, j + 1).map((s) => s.x + s.w));
      for (let k = i; k <= j; k++) segs[k].x = gl + gr - (segs[k].x + segs[k].w);
    }
    i = j + 1;
  }
}

const tokenWidth = (t: Token) => t.pieces.reduce((a, p) => a + measure(p.style.font, p.text), 0);

function buildStory(el: CanvasElementData, text: string): Para[] {
  const runs = validRuns({ runs: el.runs, text });
  const paraTexts = text.split('\n');
  const fmts = el.paras ? normalizeParas(el.paras, paraTexts.length) : [];
  const baseStyle = resolveStyle(el);
  const baseSize = el.fontSize ?? 16;

  // Style for every character (only when rich)
  let styleAt: ((i: number) => { style: SegStyle; size: number }) | null = null;
  if (runs) {
    const starts: number[] = [];
    let pos = 0;
    const resolved = runs.map((r) => {
      starts.push(pos);
      pos += r.text.length;
      return { style: resolveStyle(el, r), size: r.fontSize ?? baseSize };
    });
    let ri = 0;
    styleAt = (i: number) => {
      if (i < starts[ri]) ri = 0;
      while (ri + 1 < starts.length && starts[ri + 1] <= i) ri++;
      return resolved[ri];
    };
  }

  const paras: Para[] = [];
  let offset = 0;
  paraTexts.forEach((pt, pi) => {
    const pieces: Piece[] = [];
    if (styleAt) {
      let k = 0;
      while (k < pt.length) {
        const s = styleAt(offset + k);
        let e = k + 1;
        while (e < pt.length && styleAt(offset + e) === s) e++;
        pieces.push({ text: pt.slice(k, e), style: s.style, size: s.size });
        k = e;
      }
    } else if (pt) pieces.push({ text: pt, style: baseStyle, size: baseSize });

    // Split into word / space tokens; a word may span several styles.
    const tokens: Token[] = [];
    let word: Piece[] = [];
    const flushWord = () => {
      if (word.length) tokens.push({ pieces: word, w: 0, space: false });
      word = [];
    };
    for (const p of pieces) {
      const parts = p.text.match(/[ \t]+|[^ \t]+/g) || [];
      for (const part of parts) {
        if (part[0] === ' ' || part[0] === '\t') {
          flushWord();
          tokens.push({ pieces: [{ ...p, text: part }], w: 0, space: true });
        } else word.push({ ...p, text: part });
      }
    }
    flushWord();
    for (const t of tokens) t.w = tokenWidth(t);

    const markInfo = styleAt
      ? styleAt(Math.min(offset + pt.length, Math.max(0, text.length - 1)))
      : { style: baseStyle, size: baseSize };
    paras.push({ tokens, fmt: fmts[pi] ?? {}, mark: markInfo.style, markSize: markInfo.size, rtl: isRtlText(pt) });
    offset += pt.length + 1;
  });
  return paras;
}

/** Breaks a word token that is wider than the line. */
function splitToken(t: Token, maxW: number): [Token, Token | null] {
  const chars: { ch: string; p: Piece }[] = [];
  for (const p of t.pieces) for (const ch of p.text) chars.push({ ch, p });
  let n = chars.length;
  const widthOf = (k: number) => {
    let w = 0;
    let i = 0;
    while (i < k) {
      const p = chars[i].p;
      let s = '';
      while (i < k && chars[i].p === p) s += chars[i++].ch;
      w += measure(p.style.font, s);
    }
    return w;
  };
  while (n > 1 && widthOf(n) > maxW) n--;
  const toTok = (from: number, to: number): Token => {
    const pieces: Piece[] = [];
    for (let i = from; i < to; i++) {
      const last = pieces[pieces.length - 1];
      if (last && last.style === chars[i].p.style) last.text += chars[i].ch;
      else pieces.push({ ...chars[i].p, text: chars[i].ch });
    }
    const tok = { pieces, w: 0, space: false };
    tok.w = tokenWidth(tok);
    return tok;
  };
  return [toTok(0, n), n < chars.length ? toTok(n, chars.length) : null];
}

// ---------------------------------------------------------------- layout
interface Cursor {
  p: number;
  t: number;
}

export function framePadding(el: CanvasElementData): [number, number, number, number] {
  return el.padding ?? [TEXT_PAD, TEXT_PAD, TEXT_PAD, TEXT_PAD];
}

function lineHeightFor(el: CanvasElementData, fmt: ParaFormat, size: number, family: string): number {
  if (fmt.lineHeightPx) return fmt.lineHeightPx;
  if (!el.paras) return size * LINE_HEIGHT;
  return size * lineFactor(family) * (fmt.lineSpacing ?? 1);
}

const ALIGNS: TextAlign[] = ['left', 'center', 'right', 'justify'];

function layoutFrame(paras: Para[], cur: Cursor, el: CanvasElementData, mustPlaceOne: boolean) {
  const pad = framePadding(el);
  const innerW = Math.max(4, el.width - pad[0] - pad[2]);
  const innerH = Math.max(0, el.height - pad[1] - pad[3]);
  const lines: LaidLine[] = [];
  let y = 0;
  let { p, t } = cur;

  while (p < paras.length) {
    const para = paras[p];
    const fmt = para.fmt;
    const first = t === 0;
    const align: TextAlign = ALIGNS.includes(fmt.align as TextAlign) ? (fmt.align as TextAlign) : el.textAlign || 'left';
    const indent = fmt.indent ?? 0;
    const firstIndent = fmt.firstIndent ?? 0;
    const right = fmt.rightIndent ?? 0;
    const before = first ? fmt.spaceBefore ?? 0 : 0;

    let startX = indent + (first ? firstIndent : 0);
    let bulletSeg: Seg | null = null;
    if (first && fmt.bullet) {
      const st = para.tokens.find((k) => !k.space)?.pieces[0]?.style ?? para.mark;
      const bx = Math.max(0, indent + firstIndent);
      const bw = measure(st.font, fmt.bullet);
      const m = metrics(st);
      bulletSeg = { text: fmt.bullet, x: bx, w: bw, style: st, asc: m.asc, desc: m.desc };
      startX = Math.max(indent, bx + bw + st.size * 0.35);
    }
    const avail = Math.max(4, innerW - startX - right);

    // Fill one line
    const lineToks: Token[] = [];
    let x = 0;
    let hasWord = false;
    let tt = t;
    const toks = para.tokens;
    let pendingTail: Token | null = null;
    while (tt < toks.length) {
      const tok = toks[tt];
      if (tok.space) {
        lineToks.push(tok);
        x += tok.w;
        tt++;
        continue;
      }
      if (x + tok.w <= avail + 0.01) {
        lineToks.push(tok);
        x += tok.w;
        hasWord = true;
        tt++;
        continue;
      }
      if (!hasWord) {
        const [head, tail] = splitToken(tok, Math.max(4, avail - x));
        lineToks.push(head);
        hasWord = true;
        if (tail) pendingTail = tail;
        else tt++;
      }
      break;
    }
    const endsPara = tt >= toks.length && !pendingTail;

    // Line metrics: every character of the line counts (like Publisher)
    let lh = 0;
    let maxAsc = 0;
    let maxDesc = 0;
    const consider = (style: SegStyle, size: number) => {
      lh = Math.max(lh, lineHeightFor(el, fmt, size, style.family));
      const m = metrics(style);
      maxAsc = Math.max(maxAsc, m.asc - style.shift);
      maxDesc = Math.max(maxDesc, m.desc + style.shift);
    };
    for (const tok of lineToks) for (const pc of tok.pieces) consider(pc.style, pc.size);
    if (!lineToks.length) consider(para.mark, para.markSize);
    if (bulletSeg) consider(bulletSeg.style, bulletSeg.style.size);

    const after = endsPara ? fmt.spaceAfter ?? 0 : 0;
    const fits = y + before + lh <= innerH + 0.5;
    if (!fits && (lines.length > 0 || !mustPlaceOne)) break;
    if (pendingTail) toks[tt] = pendingTail;

    // Horizontal placement
    let last = lineToks.length - 1;
    while (last >= 0 && lineToks[last].space) last--;
    const contentW = lineToks.slice(0, last + 1).reduce((a, k) => a + k.w, 0);
    const justify = align === 'justify' && !endsPara && last > 0;
    let gaps = 0;
    if (justify) for (let i = 0; i < last; i++) if (lineToks[i].space) gaps++;
    const extra = justify && gaps ? (avail - contentW) / gaps : 0;
    let lx = startX;
    if (align === 'center') lx += (avail - contentW) / 2;
    else if (align === 'right' || (align === 'justify' && !justify && para.rtl)) lx += avail - contentW;

    const segs: Seg[] = [];
    if (bulletSeg) segs.push(bulletSeg);
    let cx = lx;
    lineToks.forEach((tok, i) => {
      const isGap = tok.space && i < last;
      for (const pc of tok.pieces) {
        const w = measure(pc.style.font, pc.text);
        const prev = segs[segs.length - 1];
        const m = metrics(pc.style);
        if (prev && prev !== bulletSeg && prev.style === pc.style && !justify && Math.abs(prev.x + prev.w - cx) < 0.01) {
          prev.text += pc.text;
          prev.w += w;
        } else segs.push({ text: pc.text, x: cx, w, style: pc.style, asc: m.asc, desc: m.desc });
        cx += w;
      }
      if (isGap) cx += extra;
    });

    if (para.rtl) mirrorRtl(bulletSeg ? segs.slice(1) : segs);
    const baseline = (lh - (maxAsc + maxDesc)) / 2 + maxAsc;
    lines.push({
      text: lineToks.map((k) => k.pieces.map((pc) => pc.text).join('')).join(''),
      endsPara,
      segs,
      y: y + before,
      height: lh,
      baseline,
      rtl: para.rtl || undefined
    });
    y += before + lh + after;
    t = tt;
    if (endsPara) {
      p++;
      t = 0;
    }
    if (!fits) break; // forced single line
  }
  return { lines, cursor: { p, t }, contentHeight: y, innerH, pad };
}

function finishFlow(
  el: CanvasElementData,
  res: ReturnType<typeof layoutFrame>,
  extra: Pick<FrameFlow, 'overflow' | 'storyHeadId' | 'chainIndex'>
): FrameFlow {
  const free = res.innerH - res.contentHeight;
  const offsetY = free > 0 ? (el.vAlign === 'middle' ? free / 2 : el.vAlign === 'bottom' ? free : 0) : 0;
  return { lines: res.lines, contentHeight: res.contentHeight, offsetY, pad: res.pad, ...extra };
}

/** Lays out a standalone text (page numbers, previews). */
export function layoutText(el: CanvasElementData, text: string): FrameFlow {
  const paras = buildStory({ ...el, runs: undefined, paras: el.paras }, text);
  const res = layoutFrame(paras, { p: 0, t: 0 }, el, true);
  return finishFlow(el, res, { overflow: res.cursor.p < paras.length, storyHeadId: el.id, chainIndex: 0 });
}

/**
 * Flows for the text frames of one page (and the master layer) only; falls
 * back to the whole document when linked frames are involved.
 */
export function computePageFlows(doc: PubDocument, pageIndex: number): Map<string, FrameFlow> {
  const page = doc.pages[pageIndex];
  const own = [...(page?.elements ?? []), ...(doc.master?.elements ?? [])].filter((e) => e.type === 'text');
  if (own.some((e) => e.nextFrameId) || allTextFrames(doc).some((e) => e.nextFrameId)) return computeDocumentFlows(doc);
  return computeDocumentFlows({ ...doc, pages: page ? [page] : [], master: doc.master });
}

/** Text frames that are the target of another frame's nextFrameId. */
function targetsOf(all: CanvasElementData[]) {
  const s = new Set<string>();
  for (const e of all) if (e.type === 'text' && e.nextFrameId) s.add(e.nextFrameId);
  return s;
}

/** Collects every text frame in the document (pages + master). */
export function allTextFrames(doc: PubDocument): CanvasElementData[] {
  const out: CanvasElementData[] = [];
  for (const p of doc.pages) for (const e of p.elements) if (e.type === 'text') out.push(e);
  for (const e of doc.master?.elements || []) if (e.type === 'text') out.push(e);
  return out;
}

/**
 * Computes the visible lines of every text frame in a document, following
 * nextFrameId links (across pages too). Cycles are ignored safely.
 * Standalone frames are cached per element object.
 */
export function computeDocumentFlows(doc: PubDocument): Map<string, FrameFlow> {
  const frames = allTextFrames(doc);
  const byId = new Map(frames.map((f) => [f.id, f]));
  const targets = targetsOf(frames);
  const result = new Map<string, FrameFlow>();

  for (const head of frames) {
    if (targets.has(head.id) && byId.has(head.id)) continue;
    if (!head.nextFrameId) {
      let f = flowCache.get(head);
      if (!f || (f as FrameFlow & { epoch?: number }).epoch !== cacheEpoch) {
        const paras = buildStory(head, head.text || '');
        const res = layoutFrame(paras, { p: 0, t: 0 }, head, true);
        f = finishFlow(head, res, { overflow: res.cursor.p < paras.length, storyHeadId: head.id, chainIndex: 0 });
        (f as FrameFlow & { epoch?: number }).epoch = cacheEpoch;
        flowCache.set(head, f);
      }
      result.set(head.id, f);
      continue;
    }
    flowChain(head, byId, result);
  }
  // Orphan cycles (A→B→A) have no head: treat the first one as head.
  for (const f of frames) if (!result.has(f.id)) flowChain(f, byId, result);
  return result;
}

function flowChain(head: CanvasElementData, byId: Map<string, CanvasElementData>, out: Map<string, FrameFlow>) {
  const paras = buildStory(head, head.text || '');
  let cursor: Cursor = { p: 0, t: 0 };
  let frame: CanvasElementData | undefined = head;
  const seen = new Set<string>();
  let idx = 0;
  while (frame && !seen.has(frame.id)) {
    seen.add(frame.id);
    const next: CanvasElementData | undefined = frame.nextFrameId ? byId.get(frame.nextFrameId) : undefined;
    const hasNext: boolean = !!next && !seen.has(next.id);
    // Linked frames use the head's text formatting.
    const styled = frame === head ? frame : { ...frame, paras: head.paras, textAlign: head.textAlign };
    const res = layoutFrame(paras, cursor, styled, !hasNext);
    cursor = res.cursor;
    out.set(frame.id, finishFlow(frame, res, { overflow: cursor.p < paras.length && !hasNext, storyHeadId: head.id, chainIndex: idx++ }));
    frame = hasNext ? next : undefined;
  }
}

/** Removes a frame from link chains (used when a frame is deleted). */
export function unlinkReferences(doc: PubDocument, removedIds: Set<string>): PubDocument {
  const fix = (els: CanvasElementData[]) =>
    els.map((e) => {
      if (e.nextFrameId && removedIds.has(e.nextFrameId)) {
        const target = findEl(doc, e.nextFrameId);
        return { ...e, nextFrameId: target?.nextFrameId && !removedIds.has(target.nextFrameId) ? target.nextFrameId : undefined };
      }
      return e;
    });
  return {
    ...doc,
    pages: doc.pages.map((p) => ({ ...p, elements: fix(p.elements) })),
    master: doc.master ? { elements: fix(doc.master.elements) } : doc.master
  };
}

export function findEl(doc: PubDocument, id: string): CanvasElementData | undefined {
  for (const p of doc.pages) {
    const f = p.elements.find((e) => e.id === id);
    if (f) return f;
  }
  return doc.master?.elements.find((e) => e.id === id);
}

/** Page index of an element (-1 = master layer). */
export function pageOfElement(doc: PubDocument, id: string): number {
  for (let i = 0; i < doc.pages.length; i++) if (doc.pages[i].elements.some((e) => e.id === id)) return i;
  return -1;
}
