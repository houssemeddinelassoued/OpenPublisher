// ============================================================================
// Data model & page geometry
// ============================================================================

export type PageSizePreset = 'A4' | 'A5' | 'A3' | 'Letter' | 'Custom';
export type Orientation = 'portrait' | 'landscape';
export type ElementType = 'text' | 'image' | 'shape' | 'table' | 'pagenum' | 'border';
/** 'rectangle' | 'circle' | 'line' are native; every other variant is an SVG path (see shapes.ts). */
export type ShapeVariant = 'rectangle' | 'circle' | 'line' | (string & {});
export type TextAlign = 'left' | 'center' | 'right' | 'justify';

export interface CanvasElementData {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  /** Rotation in degrees, clockwise, around the element centre. */
  rotation?: number;
  // Text
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textAlign?: TextAlign;
  /** Linked text frame (Publisher "story autoflow"): overflow continues into this frame. */
  nextFrameId?: string;
  // Shape / box
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  shapeVariant?: ShapeVariant;
  borderRadius?: number;
  opacity?: number;
  // Image
  imageUrl?: string;
  // Table
  rows?: number;
  cols?: number;
  tableData?: string[][];
  // Decorative border
  borderPreset?: 'classic' | 'double' | 'ornate' | 'modern';
}

export interface PageData {
  id: string;
  name: string;
  background: string;
  backgroundPattern?: 'none' | 'dots' | 'warm' | 'blueprint';
  elements: CanvasElementData[];
  /** When true the master page layer is not drawn on this page. */
  hideMaster?: boolean;
  /** Per-page orientation override (mixed portrait / landscape documents). */
  orientation?: Orientation;
}

export interface MasterPage {
  elements: CanvasElementData[];
}

export interface PubDocument {
  id: string;
  title: string;
  category: string;
  updatedAt: string;
  createdAt?: string;
  pageSize: PageSizePreset;
  widthMm: number;
  heightMm: number;
  orientation: Orientation;
  marginMm: number;
  pages: PageData[];
  isTemplate?: boolean;
  /** Personal library folder. null / undefined = library root. */
  folderId?: string | null;
  favorite?: boolean;
  /** Repeating layer drawn beneath every page. */
  master?: MasterPage;
  /** Draw 3 mm bleed + crop / registration marks on canvas and in exports. */
  printMarks?: boolean;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  color?: string;
}

export interface DocVersion {
  id: string;
  docId: string;
  title: string;
  savedAt: string;
  reason: 'open' | 'auto' | 'close' | 'manual' | 'restore';
  doc: PubDocument;
}

/** A template created by the user from a document or from some pages. */
export interface UserTemplate {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  doc: PubDocument;
}

export interface PubImportReport {
  fileName: string;
  fileSize: number;
  formatDetected: 'OLE2-PUB' | 'RAW-BINARY-PUB' | 'HTML-FALLBACK' | 'DOCX-FALLBACK' | 'JSON-NATIVE';
  ole2MagicValid: boolean;
  extractedTextBlocks: string[];
  extractedImagesCount: number;
  detectedPageSize: {
    preset: PageSizePreset;
    widthMm: number;
    heightMm: number;
    orientation: Orientation;
  };
  warnings: string[];
  generatedDoc: PubDocument;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export const MM_TO_PX = 96 / 25.4; // 3.7795 px per mm at 96 dpi
export const BLEED_MM = 3;
/** Extra space around the bleed where crop / registration marks are drawn. */
export const MARK_ZONE_MM = 10;

export const PAGE_PRESETS: Record<Exclude<PageSizePreset, 'Custom'>, [number, number]> = {
  A4: [210, 297],
  A5: [148, 210],
  A3: [297, 420],
  Letter: [215.9, 279.4]
};

export function getCanvasPixelDimensions(doc: Pick<PubDocument, 'widthMm' | 'heightMm' | 'orientation'>): {
  width: number;
  height: number;
} {
  const baseW = Math.round(doc.widthMm * MM_TO_PX);
  const baseH = Math.round(doc.heightMm * MM_TO_PX);
  if (doc.orientation === 'landscape') {
    return { width: Math.max(baseW, baseH), height: Math.min(baseW, baseH) };
  }
  return { width: Math.min(baseW, baseH), height: Math.max(baseW, baseH) };
}

export function pageOrientation(doc: Pick<PubDocument, 'orientation'>, page?: Pick<PageData, 'orientation'>): Orientation {
  return page?.orientation ?? doc.orientation;
}

/** Pixel size of one page (pages may override the document orientation). */
export function getPageDims(doc: Pick<PubDocument, 'widthMm' | 'heightMm' | 'orientation'>, page?: Pick<PageData, 'orientation'>) {
  return getCanvasPixelDimensions({ widthMm: doc.widthMm, heightMm: doc.heightMm, orientation: pageOrientation(doc, page) });
}

/**
 * Master page elements are laid out for the document's default orientation.
 * On a page with another orientation their position is scaled so headers,
 * footers and page numbers stay at the same relative place.
 */
export function masterElementsFor(doc: PubDocument, page: PageData): CanvasElementData[] {
  const els = doc.master?.elements ?? [];
  if (!els.length || page.hideMaster) return page.hideMaster ? [] : els;
  const from = getPageDims(doc);
  const to = getPageDims(doc, page);
  if (from.width === to.width && from.height === to.height) return els;
  const sx = to.width / from.width;
  const sy = to.height / from.height;
  return els.map((e) => ({ ...e, x: Math.round(e.x * sx), y: Math.round(e.y * sy), width: Math.round(e.width * sx) }));
}

export function uid(prefix = 'el'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function cloneDoc<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/** Axis-aligned bounding box of a (possibly rotated) element. */
export function elementBounds(el: CanvasElementData) {
  const r = ((el.rotation || 0) * Math.PI) / 180;
  if (!r) return { x: el.x, y: el.y, w: el.width, h: el.height };
  const cos = Math.abs(Math.cos(r));
  const sin = Math.abs(Math.sin(r));
  const w = el.width * cos + el.height * sin;
  const h = el.width * sin + el.height * cos;
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}
