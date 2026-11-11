// ============================================================================
// Converts a parsed Publisher file (pubformat.ts) into an OpenPublisher
// document: pages, master page, text frames with rich text, tables (cells +
// borders), pictures and shapes. Pure function: pictures are returned as
// references that the browser layer turns into data URLs.
// ============================================================================
import type { CanvasElementData, PageData, PageSizePreset, ParaFormat, PubDocument, TextAlign, TextRun } from './model.ts';
import { PAGE_PRESETS } from './model.ts';
import { EMU_PER_PX, colorRefToHex, shapeFlipH, shapeFlipV, type EscherShape, type PubFile, type PubShapeInfo, type QuillStory, type RawCharStyle, type RawParaStyle } from './pubformat.ts';
import { cssFontFamily } from './fontmetrics.ts';
import { compactRuns, dominant } from './richtext.ts';

export interface PictureRequest {
  key: string;
  index: number;
  /** Fractions of the source picture to crop away (left, top, right, bottom). */
  crop: [number, number, number, number];
  name?: string;
}

export interface PubConversion {
  doc: PubDocument;
  pictures: PictureRequest[];
  fonts: string[];
  stats: { pages: number; textFrames: number; tables: number; pictures: number; shapes: number; masterElements: number };
}

const PT_TO_PX = 96 / 72;
const RTL_LETTER = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;
const LTR_LETTER = /[A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff]/;
const px = (emu: number) => Math.round((emu / EMU_PER_PX) * 100) / 100;
let idCounter = 0;
const newId = (p = 'el') => `${p}-${Date.now().toString(36)}-${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const BULLETS: Record<number, string> = {
  0xb7: '•',
  0xa7: '▪',
  0xa8: '◆',
  0x6c: '●',
  0x6e: '■',
  0x71: '❑',
  0x75: '◆',
  0x76: '❖',
  0xd8: '➢',
  0xfc: '✓',
  0xfb: '✗',
  0x2d: '–',
  0x6f: '○'
};

const SHAPE_MAP: Record<number, string> = {
  1: 'rectangle',
  2: 'rounded',
  3: 'circle',
  4: 'diamond',
  5: 'triangle',
  6: 'rightTriangle',
  7: 'parallelogram',
  8: 'trapezoid',
  9: 'hexagon',
  10: 'octagon',
  11: 'cross',
  12: 'star5',
  13: 'arrowRight',
  15: 'homePlate',
  20: 'line',
  21: 'plaque',
  22: 'cylinder',
  23: 'donut',
  55: 'chevron',
  56: 'pentagon',
  58: 'star8',
  61: 'speech',
  62: 'speech',
  63: 'speechOval',
  64: 'wave',
  66: 'arrowLeft',
  67: 'arrowDown',
  68: 'arrowUp',
  69: 'arrowDouble',
  71: 'burst',
  72: 'burst',
  73: 'lightning',
  74: 'heart',
  92: 'seal',
  96: 'smiley',
  106: 'cloud',
  114: 'document',
  183: 'sun',
  184: 'moon',
  187: 'star4'
};

function presetOf(wMm: number, hMm: number): PageSizePreset {
  const [a, b] = [Math.min(wMm, hMm), Math.max(wMm, hMm)];
  for (const [k, [pw, ph]] of Object.entries(PAGE_PRESETS)) if (Math.abs(pw - a) < 1.5 && Math.abs(ph - b) < 1.5) return k as PageSizePreset;
  return 'Custom';
}

export function convertPublisher(pf: PubFile, title: string): PubConversion {
  const pictures: PictureRequest[] = [];
  const pictureKeys = new Map<string, string>();
  const fonts = new Set<string>();
  const stats = { pages: 0, textFrames: 0, tables: 0, pictures: 0, shapes: 0, masterElements: 0 };
  const q = pf.quill;

  // ---------------------------------------------------------------- helpers
  const color = (ref: number | undefined) => (ref == null ? undefined : colorRefToHex(ref, pf.palette));
  const optOr = (sp: EscherShape | undefined, id: number) => sp?.opt.get(id) ?? pf.escher.defaults.get(id);
  const bool = (sp: EscherShape | undefined, id: number, bit: number) => {
    const v = optOr(sp, id);
    if (v == null) return undefined;
    const use = 1 << (bit + 16);
    return v & use ? (v & (1 << bit)) !== 0 : undefined;
  };
  const fillOf = (sp?: EscherShape): string | undefined => {
    const filled = bool(sp, 0x1bf, 4) ?? false;
    if (!filled) return undefined;
    const c = color(optOr(sp, 0x181)) ?? '#ffffff';
    const op = sp?.opt.get(0x182);
    if (op != null && op < 0x10000) {
      const a = op / 0x10000;
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
      return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})`;
    }
    return c;
  };
  const lineOf = (sp?: EscherShape): { color: string; width: number } | undefined => {
    const on = bool(sp, 0x1ff, 3) ?? true;
    if (!on || !sp) return undefined;
    return { color: color(optOr(sp, 0x1c0)) ?? '#000000', width: Math.max(0.5, px(optOr(sp, 0x1cb) ?? 9525)) };
  };

  // Character / paragraph style resolution
  const charStyle = (raw: RawCharStyle, para: RawParaStyle, rtl: boolean): TextRun & { text: '' } => {
    const base = q.defaultChar[para.charStyle ?? 0] ?? {};
    const size = (rtl ? raw.csSize ?? base.csSize : undefined) ?? raw.size ?? base.size ?? 10;
    const fontIdx = (rtl ? raw.csFont ?? base.csFont : undefined) ?? raw.font ?? base.font;
    const fontName = fontIdx != null && fontIdx < q.fonts.length ? q.fonts[fontIdx] : 'Times New Roman';
    fonts.add(fontName);
    const colorIdx = raw.color ?? base.color;
    const c = colorIdx != null && colorIdx < q.colors.length ? color(q.colors[colorIdx]) : undefined;
    const run: TextRun & { text: '' } = {
      text: '',
      fontSize: Math.round(size * PT_TO_PX * 100) / 100,
      fontFamily: cssFontFamily(fontName),
      fontColor: c ?? '#000000'
    };
    if (raw.bold ?? base.bold) run.bold = true;
    if (raw.italic ?? base.italic) run.italic = true;
    if (raw.underline ?? base.underline) run.underline = true;
    if (raw.superscript) run.script = 1;
    else if (raw.subscript) run.script = -1;
    return run;
  };
  const paraFormat = (raw: RawParaStyle): ParaFormat => {
    const base = q.defaultPara[0] ?? {};
    const p: ParaFormat = {};
    const align = raw.align ?? base.align;
    if (align && align !== 'left') p.align = align as TextAlign;
    if (raw.lineSpacingPt) p.lineHeightPx = raw.lineSpacingPt * PT_TO_PX;
    else p.lineSpacing = raw.lineSpacing ?? base.lineSpacing ?? 1;
    const pt = (v?: number) => (v ? Math.round(v * PT_TO_PX * 100) / 100 : undefined);
    const sb = pt(raw.spaceBeforePt);
    const sa = pt(raw.spaceAfterPt);
    const li = pt(raw.leftIndentPt);
    const fi = pt(raw.firstIndentPt);
    const ri = pt(raw.rightIndentPt);
    if (sb) p.spaceBefore = sb;
    if (sa) p.spaceAfter = sa;
    if (li) p.indent = li;
    if (fi) p.firstIndent = fi;
    if (ri) p.rightIndent = ri;
    if (raw.bulletCode && raw.listType !== 0) p.bullet = BULLETS[raw.bulletCode] ?? String.fromCharCode(raw.bulletCode);
    return p;
  };

  /**
   * Text, runs and paragraph formats of story[from, to). Publisher paragraph
   * marks (\r) become \n; the final mark is dropped.
   */
  const richText = (story: QuillStory, from: number, to: number) => {
    let end = to;
    if (end > from && (story.text[end - 1] === '\r' || story.text[end - 1] === '\u0007')) end--;
    const runs: TextRun[] = [];
    const paras: ParaFormat[] = [];
    let text = '';
    let ci = 0;
    let pi = 0;
    const paraAt = (i: number) => {
      while (pi < story.paras.length - 1 && story.paras[pi].end <= i) pi++;
      return story.paras[pi]?.style ?? {};
    };
    const charAt = (i: number) => {
      while (ci < story.chars.length - 1 && story.chars[ci].end <= i) ci++;
      return story.chars[ci]?.style ?? {};
    };
    let lastStyle: TextRun | null = null;
    let lastRaw: RawCharStyle | null = null;
    let lastPara: RawParaStyle | null = null;
    let rtl = false;
    let lastRtl = false;
    let paraPushed = false;
    for (let i = from; i < end; i++) {
      let ch = story.text[i];
      const praw = paraAt(i);
      if (!paraPushed) {
        paras.push(paraFormat(praw));
        paraPushed = true;
      }
      if (ch === '\r' || ch === '\u000b' || ch === '\u000c') {
        ch = '\n';
        paraPushed = false;
      } else if (ch === '\u001e') ch = '-';
      else if (ch === '\u001f') continue;
      else if (ch < ' ' && ch !== '\t') continue;
      const craw = charAt(i);
      // Arabic / Hebrew letters use the complex-script font; neutral characters follow the text around them
      if (RTL_LETTER.test(ch)) rtl = true;
      else if (LTR_LETTER.test(ch)) rtl = false;
      if (craw !== lastRaw || praw !== lastPara || rtl !== lastRtl || !lastStyle) {
        lastStyle = charStyle(craw, praw, rtl);
        lastRaw = craw;
        lastPara = praw;
        lastRtl = rtl;
        runs.push({ ...lastStyle });
      }
      runs[runs.length - 1].text += ch;
      text += ch;
    }
    if (!paraPushed && end > from) paras.push(paraFormat(paraAt(end)));
    if (!paras.length) paras.push(paraFormat(paraAt(from)));
    return { text, runs: compactRuns(runs), paras };
  };

  /** Element-level style = most common run style (used by the editor panels). */
  const baseFromRuns = (runs: TextRun[]) => ({
    fontSize: dominant(runs, 'fontSize') ?? 16,
    fontFamily: dominant(runs, 'fontFamily') ?? 'Inter, sans-serif',
    fontColor: dominant(runs, 'fontColor') ?? '#000000',
    bold: !!dominant(runs, 'bold'),
    italic: !!dominant(runs, 'italic')
  });

  const pictureRef = (index: number, crop: [number, number, number, number], name?: string) => {
    const key = `${index}:${crop.map((c) => c.toFixed(4)).join(',')}`;
    let k = pictureKeys.get(key);
    if (!k) {
      k = `pubimg:${pictures.length}`;
      pictureKeys.set(key, k);
      pictures.push({ key: k, index, crop, name });
    }
    return k;
  };

  // ---------------------------------------------------------------- shapes
  type Out = CanvasElementData[];

  const rectPx = (s: PubShapeInfo) => {
    const r = s.rect!;
    let x = px(r.x);
    let y = px(r.y);
    let w = px(r.w);
    let h = px(r.h);
    const rot = s.escher?.opt.get(0x04);
    let rotation = rot ? (rot | 0) / 65536 : 0;
    rotation = ((rotation % 360) + 360) % 360;
    // OfficeArt stores the bounding box of shapes rotated by ~90° / ~270°
    if ((rotation >= 45 && rotation < 135) || (rotation >= 225 && rotation < 315)) {
      const cx = x + w / 2;
      const cy = y + h / 2;
      [w, h] = [h, w];
      x = cx - w / 2;
      y = cy - h / 2;
    }
    return { x, y, w, h, rotation: Math.round(rotation * 100) / 100 };
  };

  const textPadding = (sp?: EscherShape): [number, number, number, number] => [
    px(sp?.opt.get(0x81) ?? 91440),
    px(sp?.opt.get(0x82) ?? 45720),
    px(sp?.opt.get(0x83) ?? 91440),
    px(sp?.opt.get(0x84) ?? 45720)
  ];
  const vAlignOf = (v?: number): CanvasElementData['vAlign'] => {
    if (v == null) return undefined;
    const m = v % 3;
    return m === 1 ? 'middle' : m === 2 ? 'bottom' : undefined;
  };

  const textFrame = (story: QuillStory, from: number, to: number, box: { x: number; y: number; w: number; h: number }, extra: Partial<CanvasElementData>): CanvasElementData => {
    const rt = richText(story, from, to);
    stats.textFrames++;
    const base = baseFromRuns(rt.runs);
    // Runs only keep what differs from the frame's own style.
    const runs = compactRuns(
      rt.runs.map((r) => {
        const o: TextRun = { text: r.text };
        if (r.fontSize !== base.fontSize) o.fontSize = r.fontSize;
        if (r.fontFamily !== base.fontFamily) o.fontFamily = r.fontFamily;
        if (r.fontColor !== base.fontColor) o.fontColor = r.fontColor;
        if (!!r.bold !== base.bold) o.bold = !!r.bold;
        if (!!r.italic !== base.italic) o.italic = !!r.italic;
        if (r.underline) o.underline = true;
        if (r.script) o.script = r.script;
        return o;
      })
    );
    return {
      id: newId(),
      type: 'text',
      x: box.x,
      y: box.y,
      width: Math.max(4, box.w),
      height: Math.max(4, box.h),
      zIndex: 0,
      text: rt.text,
      runs: runs.length > 1 || Object.keys(runs[0] ?? {}).length > 1 ? runs : undefined,
      paras: rt.paras,
      ...base,
      textAlign: 'left',
      fillColor: 'transparent',
      strokeColor: 'transparent',
      strokeWidth: 0,
      ...extra
    };
  };

  const convertTable = (s: PubShapeInfo, out: Out) => {
    const ti = pf.table(s.seq);
    const box = rectPx(s);
    const story = s.textId != null ? q.stories.get(s.textId) : undefined;
    if (!ti || !story) {
      if (story) out.push(textFrame(story, 0, story.text.length, box, { padding: textPadding(s.escher) }));
      return;
    }
    stats.tables++;
    const sumW = ti.colWidths.reduce((a, b) => a + b, 0) || 1;
    const sumH = ti.rowHeights.reduce((a, b) => a + b, 0) || 1;
    const colX = [box.x];
    for (const w of ti.colWidths) colX.push(colX[colX.length - 1] + (w / sumW) * box.w);
    const rowY = [box.y];
    for (const h of ti.rowHeights) rowY.push(rowY[rowY.length - 1] + (h / sumH) * box.h);

    const decos = pf.escher.tableDecorations.get(s.seq) ?? [];
    const cellFill = new Map<number, string>();
    for (const d of decos) {
      if (d.anchorData.has(0x2001)) continue;
      const f = fillOf(d);
      if (f) cellFill.set(d.anchorData.get(0x2003) ?? 0, f);
    }
    const tableFill = fillOf(s.escher);
    if (tableFill) out.push({ id: newId(), type: 'shape', shapeVariant: 'rectangle', x: box.x, y: box.y, width: box.w, height: box.h, zIndex: 0, fillColor: tableFill, strokeColor: 'transparent', strokeWidth: 0 });

    const ends = story.cellEnds && story.cellEnds.length ? story.cellEnds : [story.text.length];
    const cells = ti.cells.length ? ti.cells : [{ r0: 0, r1: ti.rows - 1, c0: 0, c1: ti.cols - 1, marginL: 91440, marginR: 91440, marginT: 0, marginB: 0, fields: [] }];
    let from = 0;
    cells.forEach((c, i) => {
      const to = ends[i] ?? story.text.length;
      const r1 = Math.min(c.r1, ti.rows - 1);
      const c1 = Math.min(c.c1, ti.cols - 1);
      const x = colX[c.c0];
      const y = rowY[c.r0];
      const valign = c.fields.find((b) => b.id === 7)?.value;
      out.push(
        textFrame(story, from, to, { x, y, w: colX[c1 + 1] - x, h: rowY[r1 + 1] - y }, {
          padding: [px(c.marginL), px(c.marginT), px(c.marginR), px(c.marginB)],
          vAlign: valign === 1 ? 'middle' : valign === 2 ? 'bottom' : undefined,
          fillColor: cellFill.get(c.r0 * ti.cols + c.c0) ?? 'transparent'
        })
      );
      from = to;
    });

    // Borders: one thin filled bar per border segment, merged when contiguous
    type Bar = { horiz: boolean; at: number; a: number; b: number; color: string; width: number };
    const bars: Bar[] = [];
    for (const d of decos) {
      const kind = d.anchorData.get(0x2001);
      if (kind !== 1 && kind !== 2) continue;
      const visible = bool(d, 0x1bf, 4) ?? true;
      if (!visible) continue;
      const width = Math.max(0.5, px(d.opt.get(0x1cb) ?? 9525));
      const colorHex = color(d.opt.get(0x181) ?? 0) ?? '#000000';
      const r0 = d.anchorData.get(0x2004) ?? 0;
      const c0 = d.anchorData.get(0x2005) ?? 0;
      const r1 = d.anchorData.get(0x2006) ?? 0;
      const c1 = d.anchorData.get(0x2007) ?? 0;
      if (kind === 1) bars.push({ horiz: true, at: r0, a: c0, b: c1, color: colorHex, width });
      else bars.push({ horiz: false, at: c0, a: r0, b: r1, color: colorHex, width });
    }
    bars.sort((p1, p2) => Number(p1.horiz) - Number(p2.horiz) || p1.at - p2.at || p1.a - p2.a);
    const merged: Bar[] = [];
    for (const b of bars) {
      const last = merged[merged.length - 1];
      if (last && last.horiz === b.horiz && last.at === b.at && last.b === b.a && last.color === b.color && last.width === b.width) last.b = b.b;
      else merged.push({ ...b });
    }
    for (const b of merged) {
      const w = b.width;
      if (b.horiz) {
        const y = rowY[Math.min(b.at, rowY.length - 1)];
        const x0 = colX[Math.min(b.a, colX.length - 1)];
        const x1 = colX[Math.min(b.b, colX.length - 1)];
        out.push({ id: newId(), type: 'shape', shapeVariant: 'rectangle', x: x0 - w / 2, y: y - w / 2, width: x1 - x0 + w, height: w, zIndex: 0, fillColor: b.color, strokeColor: 'transparent', strokeWidth: 0 });
      } else {
        const x = colX[Math.min(b.at, colX.length - 1)];
        const y0 = rowY[Math.min(b.a, rowY.length - 1)];
        const y1 = rowY[Math.min(b.b, rowY.length - 1)];
        out.push({ id: newId(), type: 'shape', shapeVariant: 'rectangle', x: x - w / 2, y: y0 - w / 2, width: w, height: y1 - y0 + w, zIndex: 0, fillColor: b.color, strokeColor: 'transparent', strokeWidth: 0 });
      }
    }
  };

  const convertShape = (s: PubShapeInfo, out: Out) => {
    if (s.children) {
      for (const c of s.children) convertShape(c, out);
      return;
    }
    if (!s.rect) return;
    const sp = s.escher;
    if (s.chunkType === 0x10) return convertTable(s, out);
    const box = rectPx(s);
    const fill = fillOf(sp);
    const line = lineOf(sp);
    const pib = sp?.opt.get(0x104);
    const story = s.textId != null ? q.stories.get(s.textId) : undefined;

    if (pib && pib > 0) {
      const fx = (id: number) => ((sp?.opt.get(id) ?? 0) | 0) / 65536;
      const crop: [number, number, number, number] = [fx(0x102), fx(0x100), fx(0x103), fx(0x101)];
      stats.pictures++;
      out.push({
        id: newId(),
        type: 'image',
        x: box.x,
        y: box.y,
        width: box.w,
        height: box.h,
        rotation: box.rotation || undefined,
        zIndex: 0,
        imageUrl: pictureRef(pib - 1, crop, pf.imageName(s.seq)),
        imageFit: 'fill',
        imageName: pf.imageName(s.seq),
        strokeColor: line?.color ?? 'transparent',
        strokeWidth: line?.width ?? 0
      });
      return;
    }

    const shapeType = sp?.shapeType ?? 1;
    const isTextBox = shapeType === 202 || (shapeType === 1 && !!story);
    if (isTextBox && story) {
      out.push(
        textFrame(story, 0, story.text.length, box, {
          rotation: box.rotation || undefined,
          padding: textPadding(sp),
          vAlign: vAlignOf(sp?.opt.get(0x87)),
          fillColor: fill ?? 'transparent',
          strokeColor: line?.color ?? 'transparent',
          strokeWidth: line?.width ?? 0
        })
      );
      return;
    }

    const variant = SHAPE_MAP[shapeType] ?? 'rectangle';
    if (variant === 'line') {
      const len = Math.hypot(box.w, box.h);
      let angle = (Math.atan2(box.h, box.w) * 180) / Math.PI;
      if (sp && shapeFlipH(sp) !== shapeFlipV(sp)) angle = -angle;
      const t = Math.max(2, line?.width ?? 1);
      out.push({
        id: newId(),
        type: 'shape',
        shapeVariant: 'line',
        x: box.x + box.w / 2 - len / 2,
        y: box.y + box.h / 2 - t / 2,
        width: len,
        height: t,
        rotation: Math.round((angle + box.rotation) * 100) / 100 || undefined,
        zIndex: 0,
        strokeColor: line?.color ?? '#000000',
        strokeWidth: line?.width ?? 1
      });
      stats.shapes++;
      return;
    }
    if (fill || line) {
      stats.shapes++;
      out.push({
        id: newId(),
        type: 'shape',
        shapeVariant: variant === 'rounded' ? 'rectangle' : variant,
        borderRadius: variant === 'rounded' ? Math.min(box.w, box.h) * 0.16 : undefined,
        x: box.x,
        y: box.y,
        width: box.w,
        height: box.h,
        rotation: box.rotation || undefined,
        zIndex: 0,
        fillColor: fill ?? 'transparent',
        strokeColor: line?.color ?? 'transparent',
        strokeWidth: line?.width ?? 0
      });
    }
    if (story) out.push(textFrame(story, 0, story.text.length, box, { rotation: box.rotation || undefined, padding: textPadding(sp), vAlign: vAlignOf(sp?.opt.get(0x87)) ?? 'middle' }));
  };

  const convertList = (shapes: PubShapeInfo[]): CanvasElementData[] => {
    const out: Out = [];
    for (const s of shapes) convertShape(s, out);
    out.forEach((e, i) => (e.zIndex = i + 1));
    return out;
  };

  // ---------------------------------------------------------------- document
  const wMm = Math.round((pf.widthEmu / 36000) * 10) / 10;
  const hMm = Math.round((pf.heightEmu / 36000) * 10) / 10;
  const orientation = wMm > hMm ? 'landscape' : 'portrait';
  const preset = presetOf(wMm, hMm);
  const master = pf.masters[0];
  const masterEls = master ? convertList(master.shapes) : [];
  stats.masterElements = masterEls.length;

  const pages: PageData[] = pf.pages.map((p, i) => ({
    id: newId('page'),
    name: `Page ${i + 1}`,
    background: '#ffffff',
    backgroundPattern: 'none',
    elements: convertList(p.shapes),
    hideMaster: masterEls.length ? !p.masterSeq || (!!master && p.masterSeq !== master.seq) : undefined
  }));
  stats.pages = pages.length;

  const now = new Date().toISOString();
  const doc: PubDocument = {
    id: newId('doc'),
    title,
    category: 'Publisher',
    updatedAt: now,
    createdAt: now,
    pageSize: preset,
    widthMm: preset === 'Custom' ? Math.min(wMm, hMm) : PAGE_PRESETS[preset][0],
    heightMm: preset === 'Custom' ? Math.max(wMm, hMm) : PAGE_PRESETS[preset][1],
    orientation,
    marginMm: 10,
    pages: pages.length ? pages : [{ id: newId('page'), name: 'Page 1', background: '#ffffff', elements: [] }],
    master: masterEls.length ? { elements: masterEls } : undefined
  };
  return { doc, pictures, fonts: [...fonts], stats };
}
