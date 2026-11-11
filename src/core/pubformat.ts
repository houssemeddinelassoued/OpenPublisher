/**
 * Reader for Microsoft Publisher 2002–2021 binary files (.pub).
 *
 * The file is an OLE2 container with three main parts:
 *  - "Contents"                : document tree (pages, shapes, tables, sizes) in
 *                                a tagged block format
 *  - "Escher/EscherStm"        : OfficeArt drawing records (positions, fills,
 *                                lines, rotation, picture references)
 *  - "Quill/QuillSub/CONTENTS" : text stories with character / paragraph styles
 *  - "Escher/EscherDelayStm"   : picture data (BLIP records)
 *
 * Structure knowledge comes from libmspub (LibreOffice) and from comparing
 * against Publisher's own object model. No DOM APIs are used here so the
 * parser can be tested with Node.
 */
import { readCfb, isCfb } from './cfb.ts';

export const EMU_PER_PT = 12700;
export const EMU_PER_PX = 9525; // 914400 EMU per inch / 96 px per inch

// ---------------------------------------------------------------- bytes
class Bin {
  readonly b: Uint8Array;
  readonly dv: DataView;
  constructor(b: Uint8Array) {
    this.b = b;
    this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  get length() {
    return this.b.length;
  }
  u8(o: number) {
    return o < this.b.length ? this.b[o] : 0;
  }
  u16(o: number) {
    return o + 2 <= this.b.length ? this.dv.getUint16(o, true) : 0;
  }
  u32(o: number) {
    return o + 4 <= this.b.length ? this.dv.getUint32(o, true) : 0;
  }
  s32(o: number) {
    return o + 4 <= this.b.length ? this.dv.getInt32(o, true) : 0;
  }
  utf16(o: number, chars: number) {
    let s = '';
    for (let i = 0; i < chars && o + i * 2 + 1 < this.b.length; i++) s += String.fromCharCode(this.u16(o + i * 2));
    return s;
  }
}

// ---------------------------------------------------------------- tagged blocks
/** A block of the "Contents" / Quill style format: id(1) type(1) data. */
export interface Block {
  id: number;
  type: number;
  /** Offset of the block data. */
  off: number;
  /** Data length (for containers: total length including the 4-byte size). */
  len: number;
  /** Scalar value for fixed-size blocks. */
  value: number;
  end: number;
}

function blockDataLength(type: number): number {
  switch (type) {
    case 0x78:
    case 0x05:
    case 0x08:
    case 0x0a:
      return 0;
    case 0x10:
    case 0x12:
    case 0x18:
    case 0x1a:
    case 0x07:
      return 2;
    case 0x20:
    case 0x22:
    case 0x58:
    case 0x68:
    case 0x70:
    case 0xb8:
      return 4;
    case 0x28:
      return 8;
    case 0x38:
      return 16;
    case 0x48:
      return 24;
    case 0xc0:
    case 0x80:
    case 0x82:
    case 0x88:
    case 0x8a:
    case 0x90:
    case 0x98:
    case 0xa0:
      return -1;
  }
  return 0;
}

const CONTAINER_TYPES = new Set([0x80, 0x82, 0x88, 0x8a, 0x90, 0x98, 0xa0]);

function readBlock(bin: Bin, p: number): Block {
  const id = bin.u8(p);
  const type = bin.u8(p + 1);
  const off = p + 2;
  const l = blockDataLength(type);
  if (l < 0) {
    const len = Math.max(4, bin.u32(off));
    return { id, type, off, len, value: 0, end: off + len };
  }
  let value = 0;
  if (l === 2) value = bin.u16(off);
  else if (l === 4) value = bin.u32(off);
  return { id, type, off, len: l, value, end: off + l };
}

/** Children of a container block (or of a chunk, given its start offset). */
function children(bin: Bin, start: number, end: number): Block[] {
  const out: Block[] = [];
  let p = start;
  while (p + 2 <= end && p + 2 <= bin.length) {
    const b = readBlock(bin, p);
    if (b.end <= p || b.end > end + 8) break;
    out.push(b);
    p = b.end;
  }
  return out;
}

const kids = (bin: Bin, b: Block) => children(bin, b.off + 4, b.end);
/** Fields of a structure that starts with its own u32 length. */
const fieldsAt = (bin: Bin, start: number) => children(bin, start + 4, start + bin.u32(start));
const field = (list: Block[], id: number) => list.find((x) => x.id === id);
const blockString = (bin: Bin, b: Block) => bin.utf16(b.off + 4, (b.len - 4) / 2).replace(/\0+$/, '');

// ---------------------------------------------------------------- Contents chunks
export interface Chunk {
  seq: number;
  type: number;
  offset: number;
  parent: number;
}

export const CHUNK = {
  SHAPE: 0x01,
  TABLE: 0x10,
  GROUP: 0x30,
  PAGE: 0x43,
  DOCUMENT: 0x44,
  PALETTE: 0x5c,
  CELLS: 0x63,
  IMAGE_INFO: 0x66
} as const;

function readChunks(bin: Bin): Chunk[] {
  const trailer = bin.u32(0x1a);
  const chunks: Chunk[] = [];
  let p = trailer + 4;
  let seq = -1;
  for (let part = 0; part < 3 && p < bin.length; part++) {
    const t = readBlock(bin, p);
    if (t.type === 0x90) {
      for (const b of kids(bin, t)) {
        seq++;
        if (b.type !== 0x88) continue;
        const f = kids(bin, b);
        const type = field(f, 2);
        const off = field(f, 4);
        if (!type || !off) continue;
        chunks.push({ seq, type: type.value, offset: off.value, parent: field(f, 5)?.value ?? 0 });
      }
    }
    p = t.end;
  }
  return chunks;
}

// ---------------------------------------------------------------- Escher
export interface EscherShape {
  spid: number;
  /** OfficeArt shape type (1 rectangle, 3 ellipse, 20 line, 201 table, 202 text box…). */
  shapeType: number;
  flags: number;
  opt: Map<number, number>;
  complex: Map<number, Uint8Array>;
  tert: Map<number, number>;
  /** Absolute anchor in EMU relative to the page centre. */
  anchor?: [number, number, number, number];
  /** Anchor inside the parent group's coordinate space. */
  childAnchor?: [number, number, number, number];
  /** Coordinate space declared by a group. */
  groupRect?: [number, number, number, number];
  /** Key/value data carried by the client anchor record (tables decorations). */
  anchorData: Map<number, number>;
  /** "Contents" sequence number of the shape. */
  seq?: number;
  children: EscherShape[];
  isGroup: boolean;
  /** Drawing order in the Escher stream (= z-order, back to front). */
  order: number;
}

export interface BlipRef {
  type: number;
  foDelay: number;
  size: number;
}

const SF_GROUP = 0x1;
const SF_FLIP_H = 0x40;
const SF_FLIP_V = 0x80;
export const shapeFlipH = (s: EscherShape) => (s.flags & SF_FLIP_H) !== 0;
export const shapeFlipV = (s: EscherShape) => (s.flags & SF_FLIP_V) !== 0;

function readOpt(bin: Bin, body: number, len: number, count: number, scalars: Map<number, number>, complex?: Map<number, Uint8Array>) {
  let data = body + count * 6;
  for (let i = 0; i < count; i++) {
    const q = body + i * 6;
    const raw = bin.u16(q);
    const pid = raw & 0x3fff;
    const isComplex = (raw & 0x8000) !== 0;
    const v = bin.u32(q + 2);
    if (isComplex) {
      if (complex && data + v <= body + len) complex.set(pid, bin.b.subarray(data, data + v));
      data += v;
    } else scalars.set(pid, v);
  }
}

function readKeyValues(bin: Bin, body: number, len: number): Map<number, number> {
  const m = new Map<number, number>();
  for (let q = body + 4; q + 6 <= body + len; q += 6) m.set(bin.u16(q), bin.s32(q + 2));
  return m;
}

function readSpContainer(bin: Bin, start: number, end: number): EscherShape {
  const sp: EscherShape = {
    spid: 0,
    shapeType: 0,
    flags: 0,
    opt: new Map(),
    complex: new Map(),
    tert: new Map(),
    anchorData: new Map(),
    children: [],
    isGroup: false,
    order: 0
  };
  let p = start;
  while (p + 8 <= end) {
    const vi = bin.u16(p);
    const type = bin.u16(p + 2);
    const len = bin.u32(p + 4);
    const body = p + 8;
    const inst = vi >> 4;
    switch (type) {
      case 0xf00a:
        sp.spid = bin.u32(body);
        sp.flags = bin.u32(body + 4);
        sp.shapeType = inst;
        sp.isGroup = (sp.flags & SF_GROUP) !== 0;
        break;
      case 0xf009:
        sp.groupRect = [bin.s32(body), bin.s32(body + 4), bin.s32(body + 8), bin.s32(body + 12)];
        break;
      case 0xf00b:
        readOpt(bin, body, len, inst, sp.opt, sp.complex);
        break;
      case 0xf122:
        readOpt(bin, body, len, inst, sp.tert);
        break;
      case 0xf010: {
        const kv = readKeyValues(bin, body, len);
        sp.anchorData = kv;
        if (kv.has(0x2001) && kv.has(0x2003) && !kv.has(0x6802)) {
          sp.anchor = [kv.get(0x2001)!, kv.get(0x2002) ?? 0, kv.get(0x2003)!, kv.get(0x2004) ?? 0];
        } else if (len >= 20 && !kv.size) {
          sp.anchor = [bin.s32(body + 4), bin.s32(body + 8), bin.s32(body + 12), bin.s32(body + 16)];
        }
        break;
      }
      case 0xf011: {
        const kv = readKeyValues(bin, body, len);
        if (kv.has(0x6801)) sp.seq = kv.get(0x6801);
        break;
      }
      case 0xf00f:
        sp.childAnchor = [bin.s32(body), bin.s32(body + 4), bin.s32(body + 8), bin.s32(body + 12)];
        break;
    }
    p = body + len;
  }
  return sp;
}

interface EscherData {
  /** Top-level shapes (groups contain their children). */
  shapes: EscherShape[];
  /** Every shape linked to a Contents sequence number. */
  bySeq: Map<number, EscherShape>;
  /** Table cell borders / fills keyed by table sequence number. */
  tableDecorations: Map<number, EscherShape[]>;
  blips: BlipRef[];
  /** Default property values from the drawing group. */
  defaults: Map<number, number>;
}

function readEscher(bin: Bin): EscherData {
  const data: EscherData = { shapes: [], bySeq: new Map(), tableDecorations: new Map(), blips: [], defaults: new Map() };

  const walkGroup = (start: number, end: number, out: EscherShape[]) => {
    let p = start;
    let first = true;
    let group: EscherShape | null = null;
    while (p + 8 <= end) {
      const type = bin.u16(p + 2);
      const len = bin.u32(p + 4);
      const body = p + 8;
      if (type === 0xf004) {
        const sp = readSpContainer(bin, body, body + len);
        if (first && sp.groupRect) {
          group = sp;
          group.isGroup = true;
          out.push(group);
        } else {
          (group ? group.children : out).push(sp);
          register(sp);
        }
        if (group && first) register(group);
      } else if (type === 0xf003) {
        walkGroup(body, body + len, group ? group.children : out);
      }
      first = false;
      p = body + len;
    }
  };

  let drawOrder = 0;
  const register = (sp: EscherShape) => {
    sp.order = ++drawOrder;
    if (sp.seq != null) data.bySeq.set(sp.seq, sp);
    const tableRef = sp.anchorData.get(0x6802);
    if (tableRef != null) {
      const list = data.tableDecorations.get(tableRef) ?? [];
      list.push(sp);
      data.tableDecorations.set(tableRef, list);
    }
  };

  let p = 0;
  while (p + 8 <= bin.length) {
    const vi = bin.u16(p);
    const type = bin.u16(p + 2);
    const len = bin.u32(p + 4);
    const body = p + 8;
    if ((vi & 0xf) !== 0xf || len === 0 && type !== 0xf002) {
      p = body + len;
      continue;
    }
    if (type === 0xf000) {
      // Drawing group: picture store + default properties
      let q = body;
      while (q + 8 <= body + len) {
        const t2 = bin.u16(q + 2);
        const l2 = bin.u32(q + 4);
        const b2 = q + 8;
        if (t2 === 0xf001) {
          let r = b2;
          while (r + 8 <= b2 + l2) {
            const lr = bin.u32(r + 4);
            const br = r + 8;
            data.blips.push({ type: bin.u8(br), size: bin.u32(br + 20), foDelay: bin.u32(br + 28) });
            r = br + lr;
          }
        } else if (t2 === 0xf00b) {
          readOpt(bin, b2, l2, bin.u16(q) >> 4, data.defaults);
        }
        q = b2 + l2;
      }
      p = body + len + 4; // Publisher appends 4 bytes after the drawing group
      continue;
    }
    if (type === 0xf002) {
      let q = body;
      while (q + 8 <= body + len) {
        const t2 = bin.u16(q + 2);
        const l2 = bin.u32(q + 4);
        const b2 = q + 8;
        if (t2 === 0xf003) walkGroup(b2, b2 + l2, data.shapes);
        else if (t2 === 0xf004) {
          const sp = readSpContainer(bin, b2, b2 + l2);
          data.shapes.push(sp);
          register(sp);
        }
        q = b2 + l2;
      }
      p = body + len + 4;
      continue;
    }
    p = body + len;
  }
  return data;
}

// ---------------------------------------------------------------- pictures
export interface PubPicture {
  mime: string;
  bytes: Uint8Array;
  /** Metafile pictures (EMF/WMF/PICT) are kept but cannot be shown by browsers. */
  metafile?: boolean;
  compressed?: boolean;
}

function readPicture(delay: Bin, ref: BlipRef): PubPicture | null {
  const p = ref.foDelay;
  if (p + 8 > delay.length) return null;
  const vi = delay.u16(p);
  const type = delay.u16(p + 2);
  const len = delay.u32(p + 4);
  const inst = vi >> 4;
  const body = p + 8;
  const end = Math.min(body + len, delay.length);
  const twoUids = (inst & 1) === 1;
  const uidLen = twoUids ? 32 : 16;
  switch (type) {
    case 0xf01d: // JPEG
    case 0xf02a: // JPEG CMYK
      return { mime: 'image/jpeg', bytes: delay.b.subarray(body + uidLen + 1, end) };
    case 0xf01e:
      return { mime: 'image/png', bytes: delay.b.subarray(body + uidLen + 1, end) };
    case 0xf029:
      return { mime: 'image/tiff', bytes: delay.b.subarray(body + uidLen + 1, end) };
    case 0xf01f: {
      // DIB: add a BITMAPFILEHEADER so browsers can display it as BMP
      const dib = delay.b.subarray(body + uidLen + 1, end);
      const headerSize = dib.length >= 4 ? new DataView(dib.buffer, dib.byteOffset).getUint32(0, true) : 40;
      const bitCount = dib.length >= 16 ? new DataView(dib.buffer, dib.byteOffset).getUint16(14, true) : 24;
      let colors = dib.length >= 36 ? new DataView(dib.buffer, dib.byteOffset).getUint32(32, true) : 0;
      if (!colors && bitCount <= 8) colors = 1 << bitCount;
      const out = new Uint8Array(14 + dib.length);
      const dv = new DataView(out.buffer);
      out[0] = 0x42;
      out[1] = 0x4d;
      dv.setUint32(2, out.length, true);
      dv.setUint32(10, 14 + headerSize + colors * 4, true);
      out.set(dib, 14);
      return { mime: 'image/bmp', bytes: out };
    }
    case 0xf01a: // EMF
    case 0xf01b: // WMF
    case 0xf01c: {
      // PICT
      const hdr = body + uidLen;
      const compressed = delay.u8(hdr + 32) === 0;
      const mime = type === 0xf01a ? 'image/emf' : type === 0xf01b ? 'image/wmf' : 'image/pict';
      return { mime, bytes: delay.b.subarray(hdr + 34, end), metafile: true, compressed };
    }
  }
  return null;
}

// ---------------------------------------------------------------- colours
export function colorRefToHex(ref: number, palette: string[]): string | undefined {
  const kind = (ref >>> 24) & 0xff;
  if (kind === 0x08) return palette[ref & 0xffffff];
  if (kind === 0x10) {
    // Tint / shade of a palette or RGB colour: low word = base index
    const base = palette[ref & 0xff] ?? '#000000';
    const amount = ((ref >>> 16) & 0xff) / 255;
    const op = (ref >>> 8) & 0xff;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
    const f = (c: number) => Math.round(op === 2 ? c * amount : c + (255 - c) * (1 - amount));
    return rgbHex(f(r), f(g), f(b));
  }
  if (kind === 0x00 || kind === 0x02) return rgbHex(ref & 0xff, (ref >> 8) & 0xff, (ref >> 16) & 0xff);
  return undefined;
}

function rgbHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- Quill (text)
export interface QuillChunkRef {
  name: string;
  id: number;
  offset: number;
  length: number;
}

export interface RawCharStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Points. */
  size?: number;
  /** Index into the Quill colour list. */
  color?: number;
  /** Index into the font table. */
  font?: number;
  /** Font and size used for complex scripts (Arabic, Hebrew). */
  csFont?: number;
  csSize?: number;
  superscript?: boolean;
  subscript?: boolean;
  /** Raw blocks, kept for debugging. */
  raw?: string;
}

export interface RawParaStyle {
  align?: 'left' | 'center' | 'right' | 'justify';
  /** Default character style (index into the style sheet). */
  charStyle?: number;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  /** Multiple of the single line height. */
  lineSpacing?: number;
  /** Exact line height in points. */
  lineSpacingPt?: number;
  leftIndentPt?: number;
  firstIndentPt?: number;
  rightIndentPt?: number;
  bullet?: string;
  /** Raw bullet character code (Symbol / Wingdings font codes). */
  bulletCode?: number;
  listType?: number;
  raw?: string;
}

interface StyleSpan<T> {
  /** Absolute byte offsets in the Quill stream, end exclusive. */
  start: number;
  end: number;
  style: T;
}

export interface QuillStory {
  id: number;
  text: string;
  chars: { start: number; end: number; style: RawCharStyle }[];
  paras: { start: number; end: number; style: RawParaStyle }[];
  /** Table stories: character offsets where each cell ends. */
  cellEnds?: number[];
}

export interface QuillData {
  stories: Map<number, QuillStory>;
  fonts: string[];
  colors: number[];
  defaultChar: RawCharStyle[];
  defaultPara: RawParaStyle[];
}

function describeBlocks(bin: Bin, list: Block[]): string {
  return list
    .map((b) => {
      if (CONTAINER_TYPES.has(b.type)) return `${b.id.toString(16)}{${describeBlocks(bin, kids(bin, b))}}`;
      if (b.type === 0xc0) return `${b.id.toString(16)}="${blockString(bin, b)}"`;
      if (b.len === 0) return b.id.toString(16);
      if (b.len > 4) return `${b.id.toString(16)}:${b.len}b`;
      return `${b.id.toString(16)}=${b.value}`;
    })
    .join(' ');
}

function firstScalarInside(bin: Bin, b: Block): number | undefined {
  for (const k of kids(bin, b)) {
    if (CONTAINER_TYPES.has(k.type)) {
      const v = firstScalarInside(bin, k);
      if (v != null) return v;
    } else if (k.len > 0 && k.len <= 4) return k.value;
  }
  return undefined;
}

function readCharStyle(bin: Bin, start: number, debug: boolean): RawCharStyle {
  const s: RawCharStyle = {};
  const list = fieldsAt(bin, start);
  let bold1 = false,
    bold2 = false,
    italic1 = false,
    italic2 = false;
  for (const b of list) {
    switch (b.id) {
      case 0x02:
        bold1 = true;
        break;
      case 0x37:
        bold2 = true;
        break;
      case 0x03:
        italic1 = true;
        break;
      case 0x38:
        italic2 = true;
        break;
      case 0x1e:
        s.underline = true;
        break;
      case 0x0c:
        s.size = b.value / EMU_PER_PT;
        break;
      case 0x44:
        s.color = CONTAINER_TYPES.has(b.type) ? firstScalarInside(bin, b) : b.value;
        break;
      case 0x2e:
        s.color = firstScalarInside(bin, b);
        break;
      case 0x24:
        if (CONTAINER_TYPES.has(b.type)) {
          s.font = firstScalarInside(bin, b);
          // Slot 0x2a holds the "complex script" font used for Arabic / Hebrew text
          const cs = kids(bin, b).find((k) => k.id === 0x2a);
          const v = cs && CONTAINER_TYPES.has(cs.type) ? firstScalarInside(bin, cs) : undefined;
          if (v != null && v !== 0xffff) s.csFont = v;
        } else s.font = b.value;
        break;
      case 0x39:
        s.csSize = b.value / EMU_PER_PT;
        break;
      case 0x0f:
        if (b.value === 1) s.superscript = true;
        else if (b.value === 2) s.subscript = true;
        break;
    }
  }
  if (bold1 || bold2) s.bold = true;
  if (italic1 || italic2) s.italic = true;
  if (debug) s.raw = describeBlocks(bin, list);
  return s;
}

const ALIGN: Record<number, RawParaStyle['align']> = { 0: 'left', 1: 'right', 2: 'center', 3: 'justify', 6: 'justify' };

function readParaStyle(bin: Bin, start: number, debug: boolean): RawParaStyle {
  const s: RawParaStyle = {};
  const list = fieldsAt(bin, start);
  for (const b of list) {
    switch (b.id) {
      case 0x04:
        s.align = ALIGN[b.value & 0xff];
        break;
      case 0x19:
        s.charStyle = b.value;
        break;
      case 0x34:
        // odd = exact height (eighths of an EMU), even = multiple of single spacing
        if (b.value & 1) s.lineSpacingPt = (b.value - 1) / 8 / EMU_PER_PT;
        else if (b.value & 2) s.lineSpacing = (b.value - 2) / 1219200;
        break;
      case 0x0c:
        s.firstIndentPt = (b.value | 0) / EMU_PER_PT;
        break;
      case 0x0d:
        s.leftIndentPt = (b.value | 0) / EMU_PER_PT;
        break;
      case 0x0e:
        s.rightIndentPt = (b.value | 0) / EMU_PER_PT;
        break;
      case 0x12:
        s.spaceBeforePt = (b.value | 0) / EMU_PER_PT;
        break;
      case 0x13:
        s.spaceAfterPt = (b.value | 0) / EMU_PER_PT;
        break;
      case 0x57:
        if (CONTAINER_TYPES.has(b.type)) {
          const f = kids(bin, b);
          const ch = field(f, 1)?.value;
          s.listType = field(f, 0)?.value;
          if (ch) s.bulletCode = ch;
        }
        break;
    }
  }
  if (debug) s.raw = describeBlocks(bin, list);
  return s;
}

/**
 * FDPC / FDPP pages (512 bytes, like Word FKPs): u16 n, u16 ?, u32 fc[n + 1]
 * (byte offsets from the start of the TEXT chunk), u16 styleOffset[n].
 */
function readStyleRuns<T>(bin: Bin, ref: QuillChunkRef, read: (start: number) => T, cache: Map<number, T>): StyleSpan<T>[] {
  const n = bin.u16(ref.offset);
  const fcs: number[] = [];
  let p = ref.offset + 4;
  for (let i = 0; i <= n; i++, p += 4) fcs.push(bin.u32(p));
  const out: StyleSpan<T>[] = [];
  for (let i = 0; i < n; i++, p += 2) {
    const so = bin.u16(p);
    let style = cache.get(ref.offset + so);
    if (!style) {
      style = so ? read(ref.offset + so) : ({} as T);
      cache.set(ref.offset + so, style);
    }
    out.push({ start: fcs[i], end: fcs[i + 1], style });
  }
  return out;
}

function countOverlaps<T>(spans: StyleSpan<T>[]): number {
  const s = [...spans].sort((a, b) => a.start - b.start);
  let n = 0;
  for (let i = 1; i < s.length; i++) if (s[i].start < s[i - 1].end) n++;
  return n;
}

/** Paints style spans over a story-wide index (later pages win). */
function paintSpans<T>(spans: StyleSpan<T>[], totalChars: number, base: number): { index: Int32Array; styles: T[] } {
  const index = new Int32Array(totalChars).fill(-1);
  const styles: T[] = [];
  spans.forEach((s, i) => {
    styles.push(s.style);
    const a = Math.max(0, (s.start - base) >> 1);
    const b = Math.min(totalChars, (s.end - base) >> 1);
    for (let k = a; k < b; k++) index[k] = i;
  });
  return { index, styles };
}

function runsFromIndex<T>(index: Int32Array, styles: T[], from: number, to: number): { start: number; end: number; style: T }[] {
  const out: { start: number; end: number; style: T }[] = [];
  let k = from;
  while (k < to) {
    const id = index[k];
    let e = k + 1;
    while (e < to && index[e] === id) e++;
    out.push({ start: k - from, end: e - from, style: id >= 0 ? styles[id] : ({} as T) });
    k = e;
  }
  return out;
}

function readQuill(bin: Bin, debug: boolean): QuillData {
  const refs: QuillChunkRef[] = [];
  let listOff = 0x18;
  const seen = new Set<number>();
  while (listOff !== 0xffffffff && listOff < bin.length && !seen.has(listOff)) {
    seen.add(listOff);
    const n = bin.u16(listOff + 2);
    const next = bin.u32(listOff + 4);
    let p = listOff + 8;
    for (let i = 0; i < n; i++, p += 24) {
      const name = String.fromCharCode(bin.u8(p + 2), bin.u8(p + 3), bin.u8(p + 4), bin.u8(p + 5));
      refs.push({ name, id: bin.u16(p + 6), offset: bin.u32(p + 16), length: bin.u32(p + 20) });
    }
    listOff = next;
  }

  const q: QuillData = { stories: new Map(), fonts: [], colors: [], defaultChar: [], defaultPara: [] };
  const textRef = refs.find((r) => r.name === 'TEXT');
  const strs = refs.find((r) => r.name === 'STRS');
  const syid = refs.find((r) => r.name === 'SYID');
  if (!textRef || !strs || !syid) return q;

  // Fonts
  const fontRef = refs.find((r) => r.name === 'FONT');
  if (fontRef) {
    const n = bin.u32(fontRef.offset + 4);
    let p = fontRef.offset + 8 + 12 + 4 * n;
    for (let i = 0; i < n && p < fontRef.offset + fontRef.length; i++) {
      const len = bin.u16(p);
      q.fonts.push(bin.utf16(p + 2, len).replace(/\0+$/, ''));
      p += 2 + len * 2 + 4;
    }
  }

  // Text colours ("PL  ")
  const plRef = refs.find((r) => r.name === 'PL  ');
  if (plRef) {
    const n = bin.u32(plRef.offset);
    let p = plRef.offset + 12;
    for (let i = 0; i < n && p < plRef.offset + plRef.length; i++) {
      const len = bin.u32(p);
      const f = children(bin, p + 4, p + len);
      q.colors.push(field(f, 1)?.value ?? 0);
      p += Math.max(4, len);
    }
  }

  // Style sheet: alternating default character and paragraph styles
  const stsh = refs.find((r) => r.name === 'STSH' && r.id === 1);
  if (stsh) {
    const n = bin.u32(stsh.offset + 4);
    const offs: number[] = [];
    for (let i = 0; i < n; i++) offs.push(bin.u32(stsh.offset + 20 + i * 4));
    offs.forEach((o, i) => {
      const at = stsh.offset + 20 + o + 2;
      if (i % 2 === 0) q.defaultChar.push(readCharStyle(bin, at, debug));
      else q.defaultPara.push(readParaStyle(bin, at, debug));
    });
  }

  // Character and paragraph runs
  const charRuns: StyleSpan<RawCharStyle>[] = [];
  const paraRuns: StyleSpan<RawParaStyle>[] = [];
  const charCache = new Map<number, RawCharStyle>();
  const paraCache = new Map<number, RawParaStyle>();
  for (const r of refs) {
    if (r.name === 'FDPC') charRuns.push(...readStyleRuns(bin, r, (s) => readCharStyle(bin, s, debug), charCache));
    else if (r.name === 'FDPP') paraRuns.push(...readStyleRuns(bin, r, (s) => readParaStyle(bin, s, debug), paraCache));
  }
  const totalChars = textRef.length >> 1;
  const charIdx = paintSpans(charRuns, totalChars, textRef.offset);
  const paraIdx = paintSpans(paraRuns, totalChars, textRef.offset);

  // Stories
  const lengths: number[] = [];
  const nLen = bin.u32(strs.offset);
  const skip = bin.u32(strs.offset + 4);
  for (let i = 0; i < nLen; i++) lengths.push(bin.u32(strs.offset + 4 + skip + i * 4));
  const ids: number[] = [];
  const nIds = bin.u32(syid.offset + 4);
  for (let i = 0; i < nIds; i++) ids.push(bin.u32(syid.offset + 8 + i * 4));

  const cellDefs = new Map<number, number[]>();
  for (const r of refs) {
    if (r.name !== 'TCD ') continue;
    const n = bin.u32(r.offset) + 1;
    const list: number[] = [];
    for (let i = 0; i < n; i++) list.push(bin.u32(r.offset + 0xc + i * 4));
    cellDefs.set(r.id, list);
  }

  let pos = 0; // character offset in the TEXT chunk
  for (let s = 0; s < Math.min(lengths.length, ids.length); s++) {
    const len = lengths[s];
    const text = bin.utf16(textRef.offset + pos * 2, len);
    const story: QuillStory = {
      id: ids[s],
      text,
      chars: runsFromIndex(charIdx.index, charIdx.styles, pos, pos + len),
      paras: runsFromIndex(paraIdx.index, paraIdx.styles, pos, pos + len)
    };
    const cells = cellDefs.get(s);
    if (cells) story.cellEnds = cells.map((x, i) => (i < cells.length - 1 ? x + 1 : x));
    q.stories.set(ids[s], story);
    pos += len;
  }
  if (debug) (q as QuillData & { overlaps?: number }).overlaps = countOverlaps(charRuns) + countOverlaps(paraRuns);
  return q;
}

// ---------------------------------------------------------------- document
export interface PubShapeInfo {
  seq: number;
  chunkType: number;
  fields: Block[];
  escher?: EscherShape;
  /** Absolute rectangle in EMU from the page's top-left corner. */
  rect?: { x: number; y: number; w: number; h: number };
  textId?: number;
  children?: PubShapeInfo[];
}

export interface PubPageInfo {
  seq: number;
  isMaster: boolean;
  masterSeq?: number;
  name?: string;
  shapes: PubShapeInfo[];
}

export interface PubTableInfo {
  rows: number;
  cols: number;
  colWidths: number[];
  rowHeights: number[];
  cells: { r0: number; r1: number; c0: number; c1: number; marginL: number; marginR: number; marginT: number; marginB: number; fields: Block[] }[];
}

export interface PubFile {
  widthEmu: number;
  heightEmu: number;
  pages: PubPageInfo[];
  masters: PubPageInfo[];
  palette: string[];
  quill: QuillData;
  escher: EscherData;
  pictures: (PubPicture | null)[];
  chunkBySeq: Map<number, Chunk>;
  table(seq: number): PubTableInfo | null;
  imageName(seq: number): string | undefined;
  summary: Record<string, unknown>;
}

const DUMMY_PAGES = new Set([0x10d, 0x110, 0x113, 0x117]);

/**
 * Texts of a file whose layout cannot be read (older Publisher versions,
 * damaged files): the Quill stories if present, else UTF-16 text runs.
 */
export function readPublisherTexts(bytes: Uint8Array): string[] {
  try {
    const quill = readCfb(bytes).read('Quill/QuillSub/CONTENTS');
    if (quill) {
      const stories = [...readQuill(new Bin(quill), false).stories.values()]
        .map((s) => s.text.replace(/\r|\u000b/g, '\n').replace(/[\u0000-\u0008\u000c\u000e-\u001f]/g, '').trim())
        .filter((t) => t.length > 0);
      if (stories.length) return stories;
    }
  } catch {
    /* fall back to a raw scan */
  }
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const c = bytes[i] | (bytes[i + 1] << 8);
    const printable = (c >= 0x20 && c < 0xd800 && c !== 0xfffe && c !== 0xffff) || c === 13;
    if (printable) cur += c === 13 ? '\n' : String.fromCharCode(c);
    else {
      const t = cur.trim();
      if (t.length >= 12 && /\p{L}{3,}/u.test(t)) out.push(t);
      cur = '';
    }
  }
  return [...new Set(out)].slice(0, 200);
}

export function isPublisherFile(bytes: Uint8Array): boolean {
  if (!isCfb(bytes)) return false;
  try {
    const cfb = readCfb(bytes);
    return !!cfb.read('Contents') && !!cfb.read('Quill/QuillSub/CONTENTS');
  } catch {
    return false;
  }
}

export function readPublisher(bytes: Uint8Array, opts: { debug?: boolean } = {}): PubFile {
  const debug = !!opts.debug;
  const cfb = readCfb(bytes);
  const contents = cfb.read('Contents');
  if (!contents) throw new Error('No "Contents" stream: not a Publisher 2002+ file');
  const cb = new Bin(contents);
  const chunks = readChunks(cb);
  const bySeq = new Map(chunks.map((c) => [c.seq, c]));
  const fieldsOf = (seq: number) => {
    const c = bySeq.get(seq);
    return c ? fieldsAt(cb, c.offset) : [];
  };

  // Palette
  const palette: string[] = [];
  const pal = chunks.find((c) => c.type === CHUNK.PALETTE);
  if (pal) {
    for (const b of fieldsAt(cb, pal.offset)) {
      if (b.type !== 0xa0) continue;
      for (const e of kids(cb, b)) {
        if (e.type === 0x78) {
          palette.push('#000000');
          continue;
        }
        if (e.type !== 0x88) continue;
        const v = field(kids(cb, e), 1)?.value ?? 0;
        palette.push(rgbHex(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff));
      }
    }
  }

  // Document: size and ordered page list
  const docChunk = chunks.find((c) => c.type === CHUNK.DOCUMENT);
  let widthEmu = 7560000;
  let heightEmu = 10692000;
  const pageOrder: number[] = [];
  if (docChunk) {
    for (const b of fieldsAt(cb, docChunk.offset)) {
      if (b.id === 0x12 && b.type === 0x88) {
        const f = kids(cb, b);
        widthEmu = field(f, 1)?.value || widthEmu;
        heightEmu = field(f, 2)?.value || heightEmu;
      } else if (b.id === 0x02 && CONTAINER_TYPES.has(b.type)) {
        for (const k of kids(cb, b)) if (k.len === 4) pageOrder.push(k.value);
      }
    }
  }

  const escherStream = cfb.read('Escher/EscherStm');
  const escher = escherStream ? readEscher(new Bin(escherStream)) : { shapes: [], bySeq: new Map(), tableDecorations: new Map(), blips: [], defaults: new Map() };
  const delayStream = cfb.read('Escher/EscherDelayStm');
  const delay = delayStream ? new Bin(delayStream) : null;
  const pictures = escher.blips.map((b) => (delay ? readPicture(delay, b) : null));

  const quillStream = cfb.read('Quill/QuillSub/CONTENTS');
  const quill = quillStream ? readQuill(new Bin(quillStream), debug) : { stories: new Map(), fonts: [], colors: [], defaultChar: [], defaultPara: [] };

  const cx = widthEmu / 2;
  const cy = heightEmu / 2;

  const shapeInfo = (seq: number, depth = 0): PubShapeInfo | null => {
    const chunk = bySeq.get(seq);
    if (!chunk || depth > 8) return null;
    const fields = fieldsOf(seq);
    const sp = escher.bySeq.get(seq);
    const info: PubShapeInfo = { seq, chunkType: chunk.type, fields, escher: sp };
    if (sp?.anchor) {
      const [x0, y0, x1, y1] = sp.anchor;
      info.rect = { x: cx + Math.min(x0, x1), y: cy + Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
    }
    const textId = field(fields, 0x27)?.value ?? sp?.opt.get(0x80);
    if (textId != null) info.textId = textId;
    if (chunk.type === CHUNK.GROUP) {
      info.children = [];
      const list = field(fields, 0x15);
      if (list) for (const k of kids(cb, list)) if (k.len === 4) {
        const child = shapeInfo(k.value, depth + 1);
        if (child) info.children.push(child);
      }
    }
    return info;
  };

  /** Child anchors are expressed in the parent group's own coordinate space. */
  const placeChildren = (g: PubShapeInfo) => {
    if (!g.children) return;
    const gr = g.escher?.groupRect;
    for (const c of g.children) {
      const a = c.escher?.childAnchor;
      if (g.rect && gr && a && !c.escher?.anchor) {
        const sx = g.rect.w / (gr[2] - gr[0] || 1);
        const sy = g.rect.h / (gr[3] - gr[1] || 1);
        c.rect = {
          x: g.rect.x + (Math.min(a[0], a[2]) - gr[0]) * sx,
          y: g.rect.y + (Math.min(a[1], a[3]) - gr[1]) * sy,
          w: Math.abs(a[2] - a[0]) * sx,
          h: Math.abs(a[3] - a[1]) * sy
        };
      }
      placeChildren(c);
    }
  };

  const pageInfo = (seq: number): PubPageInfo => {
    const f = fieldsOf(seq);
    const shapes: PubShapeInfo[] = [];
    const list = field(f, 0x02);
    if (list && CONTAINER_TYPES.has(list.type)) {
      for (const k of kids(cb, list)) {
        if (k.len !== 4) continue;
        const s = shapeInfo(k.value);
        if (s) {
          placeChildren(s);
          shapes.push(s);
        }
      }
    }
    const name = field(f, 0x0e);
    const isMaster = seq === 0x107 || (!!name && name.type === 0xc0 && blockString(cb, name).length > 0);
    const master = field(f, 0x0d);
    return { seq, isMaster, masterSeq: master?.value, name: name && name.type === 0xc0 ? blockString(cb, name) : undefined, shapes };
  };

  /** Publisher stacks shapes in Escher drawing order, not in page list order. */
  const byDrawOrder = (list: PubShapeInfo[]) => {
    list.sort((a, b) => (a.escher?.order ?? Number.MAX_SAFE_INTEGER) - (b.escher?.order ?? Number.MAX_SAFE_INTEGER));
    for (const x of list) if (x.children) byDrawOrder(x.children);
    return list;
  };

  const pages: PubPageInfo[] = [];
  const masters: PubPageInfo[] = [];
  for (const seq of pageOrder) {
    if (DUMMY_PAGES.has(seq)) continue;
    const c = bySeq.get(seq);
    if (!c || c.type !== CHUNK.PAGE) continue;
    const pi = pageInfo(seq);
    byDrawOrder(pi.shapes);
    (pi.isMaster ? masters : pages).push(pi);
  }

  const table = (seq: number): PubTableInfo | null => {
    const f = fieldsOf(seq);
    const rows = field(f, 0x66)?.value ?? 0;
    const cols = field(f, 0x67)?.value ?? 0;
    const arr = field(f, 0x6d);
    if (!rows || !cols || !arr) return null;
    const sizes = kids(cb, arr).map((e) => field(kids(cb, e), 2)?.value ?? 0);
    const colWidths = sizes.slice(0, cols);
    const rowHeights = sizes.slice(cols, cols + rows);
    const cells: PubTableInfo['cells'] = [];
    const cellsSeq = field(f, 0x6b)?.value;
    if (cellsSeq != null) {
      const list = field(fieldsOf(cellsSeq), 0x02);
      if (list) {
        for (const e of kids(cb, list)) {
          const cf = kids(cb, e);
          cells.push({
            r0: field(cf, 1)?.value ?? 0,
            r1: field(cf, 2)?.value ?? 0,
            c0: field(cf, 3)?.value ?? 0,
            c1: field(cf, 4)?.value ?? 0,
            marginL: field(cf, 0x0a)?.value ?? 91440,
            marginR: field(cf, 0x0b)?.value ?? 91440,
            marginT: field(cf, 0x0c)?.value ?? 0,
            marginB: field(cf, 0x0d)?.value ?? 0,
            fields: cf
          });
        }
      }
    }
    return { rows, cols, colWidths, rowHeights, cells };
  };

  const imageName = (seq: number) => {
    const ref = field(fieldsOf(seq), 0x3a)?.value;
    if (ref == null) return undefined;
    const n = field(fieldsOf(ref), 0x03);
    return n && n.type === 0xc0 ? blockString(cb, n) : undefined;
  };

  return {
    widthEmu,
    heightEmu,
    pages,
    masters,
    palette,
    quill,
    escher,
    pictures,
    chunkBySeq: bySeq,
    table,
    imageName,
    summary: {
      chunks: chunks.length,
      escherShapes: escher.bySeq.size,
      stories: quill.stories.size,
      fonts: quill.fonts.length,
      colors: quill.colors.length,
      pictures: pictures.filter(Boolean).length
    }
  };
}

/** Human-readable dump of one chunk's fields (debugging helper). */
export function describeFields(file: PubFile, seq: number): string {
  const c = file.chunkBySeq.get(seq);
  if (!c) return '';
  return `type 0x${c.type.toString(16)}`;
}

export { describeBlocks as _describeBlocks };
