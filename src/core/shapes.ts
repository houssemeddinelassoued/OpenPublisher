// ============================================================================
// Shape catalogue. Every shape is an SVG path drawn in a 100 × 100 box and
// stretched to the element size (same path for screen and 300 dpi export).
// ============================================================================

export type ShapeGroup = 'basic' | 'polygons' | 'stars' | 'arrows' | 'callouts' | 'symbols';

export interface ShapeDef {
  id: string;
  group: ShapeGroup;
  /** SVG path in a 0..100 box. Native shapes (rectangle, circle, line) have none. */
  path?: string;
  evenodd?: boolean;
  /** Default border radius for the rounded rectangle preset. */
  radius?: number;
}

function polygon(n: number, rotDeg = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((rotDeg + (360 / n) * i) * Math.PI) / 180;
    pts.push(`${(50 + 50 * Math.cos(a)).toFixed(2)} ${(50 + 50 * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
}

function star(n: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? 50 : 50 * inner;
    const a = ((-90 + (180 / n) * i) * Math.PI) / 180;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
}

export const SHAPES: ShapeDef[] = [
  // Basic
  { id: 'rectangle', group: 'basic' },
  { id: 'rounded', group: 'basic', radius: 18 },
  { id: 'circle', group: 'basic' },
  { id: 'line', group: 'basic' },
  { id: 'triangle', group: 'basic', path: 'M50 0 L100 100 L0 100 Z' },
  { id: 'rightTriangle', group: 'basic', path: 'M0 0 L100 100 L0 100 Z' },
  { id: 'diamond', group: 'basic', path: 'M50 0 L100 50 L50 100 L0 50 Z' },
  { id: 'parallelogram', group: 'basic', path: 'M25 0 L100 0 L75 100 L0 100 Z' },
  { id: 'trapezoid', group: 'basic', path: 'M22 0 L78 0 L100 100 L0 100 Z' },
  { id: 'frame', group: 'basic', path: 'M0 0 H100 V100 H0 Z M12 12 V88 H88 V12 Z', evenodd: true },
  { id: 'donut', group: 'basic', path: 'M50 0 A50 50 0 1 0 50 100 A50 50 0 1 0 50 0 Z M50 25 A25 25 0 1 1 50 75 A25 25 0 1 1 50 25 Z', evenodd: true },
  { id: 'cylinder', group: 'basic', path: 'M0 12 C0 -4 100 -4 100 12 V88 C100 104 0 104 0 88 Z M0 12 C0 28 100 28 100 12' },
  // Polygons
  { id: 'pentagon', group: 'polygons', path: polygon(5) },
  { id: 'hexagon', group: 'polygons', path: 'M25 0 L75 0 L100 50 L75 100 L25 100 L0 50 Z' },
  { id: 'heptagon', group: 'polygons', path: polygon(7) },
  { id: 'octagon', group: 'polygons', path: 'M30 0 L70 0 L100 30 L100 70 L70 100 L30 100 L0 70 L0 30 Z' },
  { id: 'decagon', group: 'polygons', path: polygon(10) },
  { id: 'cross', group: 'polygons', path: 'M35 0 H65 V35 H100 V65 H65 V100 H35 V65 H0 V35 H35 Z' },
  { id: 'document', group: 'polygons', path: 'M0 0 H100 V85 C75 70 50 100 25 90 C15 86 6 85 0 88 Z' },
  { id: 'wave', group: 'polygons', path: 'M0 15 C25 0 50 30 75 15 C85 9 95 9 100 12 V85 C75 100 50 70 25 85 C15 91 5 91 0 88 Z' },
  // Stars
  { id: 'star4', group: 'stars', path: star(4, 0.38) },
  { id: 'star5', group: 'stars', path: star(5, 0.45) },
  { id: 'star6', group: 'stars', path: star(6, 0.55) },
  { id: 'star8', group: 'stars', path: star(8, 0.6) },
  { id: 'burst', group: 'stars', path: star(12, 0.72) },
  { id: 'seal', group: 'stars', path: star(24, 0.86) },
  // Arrows
  { id: 'arrowRight', group: 'arrows', path: 'M0 30 L60 30 L60 5 L100 50 L60 95 L60 70 L0 70 Z' },
  { id: 'arrowLeft', group: 'arrows', path: 'M100 30 L40 30 L40 5 L0 50 L40 95 L40 70 L100 70 Z' },
  { id: 'arrowUp', group: 'arrows', path: 'M30 100 L30 40 L5 40 L50 0 L95 40 L70 40 L70 100 Z' },
  { id: 'arrowDown', group: 'arrows', path: 'M30 0 L70 0 L70 60 L95 60 L50 100 L5 60 L30 60 Z' },
  { id: 'arrowDouble', group: 'arrows', path: 'M0 50 L25 10 L25 32 L75 32 L75 10 L100 50 L75 90 L75 68 L25 68 L25 90 Z' },
  { id: 'chevron', group: 'arrows', path: 'M0 0 L70 0 L100 50 L70 100 L0 100 L30 50 Z' },
  { id: 'homePlate', group: 'arrows', path: 'M0 0 L75 0 L100 50 L75 100 L0 100 Z' },
  { id: 'uturn', group: 'arrows', path: 'M10 100 V40 C10 15 30 0 55 0 C80 0 95 15 95 40 V55 H100 L80 80 L60 55 H70 V40 C70 30 64 25 55 25 C46 25 35 30 35 40 V100 Z' },
  // Callouts / speech
  { id: 'speech', group: 'callouts', path: 'M10 0 H90 Q100 0 100 10 V62 Q100 72 90 72 H45 L20 100 L26 72 H10 Q0 72 0 62 V10 Q0 0 10 0 Z' },
  { id: 'speechOval', group: 'callouts', path: 'M50 0 C78 0 100 16 100 38 C100 60 78 76 50 76 C45 76 40 76 36 75 L18 100 L24 72 C10 66 0 53 0 38 C0 16 22 0 50 0 Z' },
  { id: 'cloud', group: 'callouts', path: 'M25 85 C8 85 0 72 5 60 C0 50 3 34 18 33 C18 15 38 8 50 18 C58 4 82 6 85 24 C98 26 100 44 92 54 C100 66 90 82 75 78 C68 92 45 94 38 84 C34 86 30 86 25 85 Z' },
  { id: 'ribbon', group: 'callouts', path: 'M0 15 H100 L88 50 L100 85 H0 L12 50 Z' },
  { id: 'banner', group: 'callouts', path: 'M0 10 H20 V0 H80 V10 H100 L92 40 L100 70 H80 V80 L70 70 H30 L20 80 V70 H0 L8 40 Z' },
  { id: 'plaque', group: 'callouts', path: 'M15 0 H85 A15 15 0 0 0 100 15 V85 A15 15 0 0 0 85 100 H15 A15 15 0 0 0 0 85 V15 A15 15 0 0 0 15 0 Z' },
  // Symbols
  { id: 'heart', group: 'symbols', path: 'M50 100 C22 78 0 58 0 32 C0 13 14 0 29 0 C40 0 47 7 50 15 C53 7 60 0 71 0 C86 0 100 13 100 32 C100 58 78 78 50 100 Z' },
  { id: 'lightning', group: 'symbols', path: 'M55 0 L15 55 L45 55 L35 100 L85 40 L55 40 L70 0 Z' },
  { id: 'moon', group: 'symbols', path: 'M70 0 C35 5 12 28 12 55 C12 82 38 100 68 100 C48 90 38 72 38 50 C38 28 48 10 70 0 Z' },
  { id: 'sun', group: 'symbols', path: `${star(16, 0.7)} M50 22 A28 28 0 1 1 49.9 22 Z` },
  { id: 'drop', group: 'symbols', path: 'M50 0 C50 0 90 45 90 65 C90 87 72 100 50 100 C28 100 10 87 10 65 C10 45 50 0 50 0 Z' },
  { id: 'check', group: 'symbols', path: 'M5 55 L20 40 L40 60 L80 15 L95 30 L40 90 Z' },
  { id: 'xmark', group: 'symbols', path: 'M15 0 L50 35 L85 0 L100 15 L65 50 L100 85 L85 100 L50 65 L15 100 L0 85 L35 50 L0 15 Z' },
  {
    id: 'smiley',
    group: 'symbols',
    path: 'M50 0 A50 50 0 1 0 50 100 A50 50 0 1 0 50 0 Z M30 35 A7 9 0 1 0 44 35 A7 9 0 1 0 30 35 Z M56 35 A7 9 0 1 0 70 35 A7 9 0 1 0 56 35 Z M25 60 Q50 86 75 60 Q50 74 25 60 Z',
    evenodd: true
  },
  { id: 'flag', group: 'symbols', path: 'M5 0 H13 V100 H5 Z M13 5 C35 -5 55 20 95 5 V55 C55 70 35 45 13 55 Z' },
  { id: 'pencil', group: 'symbols', path: 'M70 0 L100 30 L35 95 L0 100 L5 65 Z' },
  { id: 'book', group: 'symbols', path: 'M0 10 C20 0 40 0 50 12 C60 0 80 0 100 10 V95 C80 85 60 85 50 97 C40 85 20 85 0 95 Z' }
];

const BY_ID = new Map(SHAPES.map((s) => [s.id, s]));

export function getShape(id?: string): ShapeDef | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export const SHAPE_GROUPS: ShapeGroup[] = ['basic', 'polygons', 'stars', 'arrows', 'callouts', 'symbols'];
