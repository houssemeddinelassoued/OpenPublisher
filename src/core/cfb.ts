/**
 * Minimal reader for OLE2 / Compound File Binary containers (the envelope of
 * Microsoft Publisher .pub files). Read-only, no dependencies.
 */

export interface CfbEntry {
  name: string;
  path: string;
  type: number; // 1 storage, 2 stream, 5 root
  start: number;
  size: number;
}

export interface CfbFile {
  entries: CfbEntry[];
  /** Stream content by full path, e.g. "Quill/QuillSub/CONTENTS". */
  read(path: string): Uint8Array | null;
}

const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;

export function isCfb(bytes: Uint8Array): boolean {
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return bytes.length >= 512 && sig.every((b, i) => bytes[i] === b);
}

export function readCfb(bytes: Uint8Array): CfbFile {
  if (!isCfb(bytes)) throw new Error('Not an OLE2 compound file');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (o: number) => dv.getUint32(o, true);
  const u16 = (o: number) => dv.getUint16(o, true);

  const sectorSize = 1 << u16(0x1e);
  const miniSectorSize = 1 << u16(0x20);
  const numFatSectors = u32(0x2c);
  const firstDirSector = u32(0x30);
  const miniCutoff = u32(0x38);
  const firstMiniFat = u32(0x3c);
  const firstDifat = u32(0x44);
  const numDifat = u32(0x48);
  const sectorOffset = (s: number) => (s + 1) * sectorSize;

  // DIFAT -> list of FAT sectors
  const fatSectors: number[] = [];
  for (let i = 0; i < 109 && fatSectors.length < numFatSectors; i++) {
    const s = u32(0x4c + i * 4);
    if (s !== FREESECT) fatSectors.push(s);
  }
  let difat = firstDifat;
  for (let n = 0; n < numDifat && difat !== ENDOFCHAIN && difat !== FREESECT; n++) {
    const base = sectorOffset(difat);
    const per = sectorSize / 4 - 1;
    for (let i = 0; i < per && fatSectors.length < numFatSectors; i++) {
      const s = u32(base + i * 4);
      if (s !== FREESECT) fatSectors.push(s);
    }
    difat = u32(base + per * 4);
  }

  const perSector = sectorSize / 4;
  const fat = new Uint32Array(fatSectors.length * perSector);
  fatSectors.forEach((s, i) => {
    const base = sectorOffset(s);
    for (let j = 0; j < perSector; j++) {
      if (base + j * 4 + 4 <= bytes.length) fat[i * perSector + j] = u32(base + j * 4);
    }
  });

  const chain = (start: number, table: Uint32Array): number[] => {
    const out: number[] = [];
    const seen = new Set<number>();
    let s = start;
    while (s !== ENDOFCHAIN && s !== FREESECT && s < table.length && !seen.has(s)) {
      seen.add(s);
      out.push(s);
      s = table[s];
    }
    return out;
  };

  const readChain = (start: number, size: number): Uint8Array => {
    const sectors = chain(start, fat);
    const out = new Uint8Array(sectors.length * sectorSize);
    sectors.forEach((s, i) => {
      const off = sectorOffset(s);
      out.set(bytes.subarray(off, Math.min(off + sectorSize, bytes.length)), i * sectorSize);
    });
    return size >= 0 ? out.subarray(0, Math.min(size, out.length)) : out;
  };

  // Directory
  const dirBytes = readChain(firstDirSector, -1);
  const raw: { name: string; type: number; left: number; right: number; child: number; start: number; size: number }[] = [];
  for (let off = 0; off + 128 <= dirBytes.length; off += 128) {
    const nameLen = dirBytes[off + 0x40] | (dirBytes[off + 0x41] << 8);
    let name = '';
    for (let i = 0; i + 1 < nameLen - 1 && i < 64; i += 2) {
      name += String.fromCharCode(dirBytes[off + i] | (dirBytes[off + i + 1] << 8));
    }
    const d = new DataView(dirBytes.buffer, dirBytes.byteOffset + off, 128);
    raw.push({
      name,
      type: dirBytes[off + 0x42],
      left: d.getUint32(0x44, true),
      right: d.getUint32(0x48, true),
      child: d.getUint32(0x4c, true),
      start: d.getUint32(0x74, true),
      size: d.getUint32(0x78, true)
    });
  }

  // Mini stream + mini FAT
  const root = raw[0];
  const miniStream = root ? readChain(root.start, root.size) : new Uint8Array(0);
  const miniFatBytes = firstMiniFat !== ENDOFCHAIN ? readChain(firstMiniFat, -1) : new Uint8Array(0);
  const miniFat = new Uint32Array(Math.floor(miniFatBytes.length / 4));
  const mdv = new DataView(miniFatBytes.buffer, miniFatBytes.byteOffset, miniFatBytes.byteLength);
  for (let i = 0; i < miniFat.length; i++) miniFat[i] = mdv.getUint32(i * 4, true);

  const readMini = (start: number, size: number): Uint8Array => {
    const sectors = chain(start, miniFat);
    const out = new Uint8Array(sectors.length * miniSectorSize);
    sectors.forEach((s, i) => {
      const off = s * miniSectorSize;
      out.set(miniStream.subarray(off, off + miniSectorSize), i * miniSectorSize);
    });
    return out.subarray(0, Math.min(size, out.length));
  };

  // Walk the red-black trees to build full paths
  const entries: CfbEntry[] = [];
  const visit = (idx: number, prefix: string, guard: Set<number>) => {
    if (idx === FREESECT || idx >= raw.length || guard.has(idx)) return;
    guard.add(idx);
    const e = raw[idx];
    visit(e.left, prefix, guard);
    const path = prefix ? `${prefix}/${e.name}` : e.name;
    entries.push({ name: e.name, path, type: e.type, start: e.start, size: e.size });
    if (e.type === 1) visit(e.child, path, guard);
    visit(e.right, prefix, guard);
  };
  if (root) visit(root.child, '', new Set([0]));

  const byPath = new Map(entries.map((e) => [e.path.toLowerCase(), e]));
  return {
    entries,
    read(path: string) {
      const e = byPath.get(path.toLowerCase());
      if (!e || e.type !== 2) return null;
      return e.size < miniCutoff ? readMini(e.start, e.size) : readChain(e.start, e.size);
    }
  };
}
