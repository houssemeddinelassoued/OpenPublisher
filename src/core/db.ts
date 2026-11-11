// ============================================================================
// Local persistence (IndexedDB): documents, library folders, version history
// ============================================================================
import type { CanvasElementData, DocVersion, Folder, PubDocument, UserTemplate } from './model';
import { uid } from './model';

const DB_NAME = 'openpublisher_db_v1';
const DB_VERSION = 4;
const DOCS = 'documents';
const FOLDERS = 'folders';
const VERSIONS = 'versions';
const TEMPLATES = 'templates';
const ASSETS = 'assets';

/** Version snapshots older than this are pruned automatically. */
export const HISTORY_RETENTION_DAYS = 365;
const MAX_VERSIONS_PER_DOC = 60;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(FOLDERS)) db.createObjectStore(FOLDERS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(TEMPLATES)) db.createObjectStore(TEMPLATES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(ASSETS)) db.createObjectStore(ASSETS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(VERSIONS)) {
        const s = db.createObjectStore(VERSIONS, { keyPath: 'id' });
        s.createIndex('docId', 'docId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAll<T>(store: string): Promise<T[]> {
  try {
    const db = await openDatabase();
    return (await reqToPromise(db.transaction(store, 'readonly').objectStore(store).getAll())) as T[];
  } catch {
    return [];
  }
}

async function put<T>(store: string, value: T): Promise<boolean> {
  try {
    const db = await openDatabase();
    await reqToPromise(db.transaction(store, 'readwrite').objectStore(store).put(value));
    return true;
  } catch (err) {
    console.error('[OpenPublisher] save failed', err);
    return false;
  }
}

async function del(store: string, key: string): Promise<void> {
  try {
    const db = await openDatabase();
    await reqToPromise(db.transaction(store, 'readwrite').objectStore(store).delete(key));
  } catch (err) {
    console.error('[OpenPublisher] delete failed', err);
  }
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
export async function loadDocuments(): Promise<PubDocument[]> {
  const docs = (await getAll<PubDocument>(DOCS)).filter((d) => !d.isTemplate);
  docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return Promise.all(docs.map((d) => inlineAssets(d)));
}
/** Saves a document; its pictures are stored once in the asset store. */
export async function saveDocument(doc: PubDocument): Promise<boolean> {
  try {
    return await put(DOCS, (await leanDoc(doc)).doc);
  } catch (err) {
    console.error('[OpenPublisher] save failed', err);
    return false;
  }
}
export async function deleteDocument(id: string) {
  await del(DOCS, id);
  const versions = await listVersions(id);
  for (const v of versions) await del(VERSIONS, v.id);
  await collectUnusedAssets();
}

// ---------------------------------------------------------------------------
// Library folders
// ---------------------------------------------------------------------------
export async function loadFolders(): Promise<Folder[]> {
  const f = await getAll<Folder>(FOLDERS);
  return f.sort((a, b) => a.name.localeCompare(b.name));
}
export const saveFolder = (f: Folder) => put(FOLDERS, f);
export const deleteFolderRecord = (id: string) => del(FOLDERS, id);

// ---------------------------------------------------------------------------
// Version history
// Snapshots are stored compressed (gzip Blob) and pictures are kept once in
// the "assets" store, so large documents do not multiply on every snapshot.
// ---------------------------------------------------------------------------
async function byDocId(docId: string): Promise<DocVersion[]> {
  try {
    const db = await openDatabase();
    const idx = db.transaction(VERSIONS, 'readonly').objectStore(VERSIONS).index('docId');
    return (await reqToPromise(idx.getAll(docId))) as DocVersion[];
  } catch {
    return [];
  }
}

export async function listVersions(docId?: string): Promise<DocVersion[]> {
  const out = docId ? await byDocId(docId) : await getAll<DocVersion>(VERSIONS);
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

async function hashString(s: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < s.length; i++) {
      h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619);
      h2 = Math.imul(h2 ^ s.charCodeAt(s.length - 1 - i), 2246822519);
    }
    return `${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}${s.length.toString(16)}`;
  }
}

function forEachElement(doc: PubDocument, fn: (e: CanvasElementData) => void) {
  for (const p of doc.pages) p.elements.forEach(fn);
  doc.master?.elements.forEach(fn);
}

// Pictures shared by documents and snapshots (data URL <-> asset id).
const idByUrl = new Map<string, string>();
const urlById = new Map<string, string>();
const storedAssets = new Set<string>();

async function assetIdFor(url: string): Promise<string> {
  let id = idByUrl.get(url);
  if (!id) {
    id = await hashString(url);
    idByUrl.set(url, id);
    urlById.set(id, url);
  }
  if (!storedAssets.has(id)) {
    const db = await openDatabase();
    const exists = await reqToPromise(db.transaction(ASSETS, 'readonly').objectStore(ASSETS).getKey(id));
    if (exists === undefined) await put(ASSETS, { id, data: url });
    storedAssets.add(id);
  }
  return id;
}

const isBigDataUrl = (u?: string) => !!u && u.startsWith('data:') && u.length > 2048;

/** Copy of a document where large inline pictures are replaced by "asset:" references. */
async function leanDoc(doc: PubDocument): Promise<{ doc: PubDocument; ids: string[] }> {
  const ids = new Set<string>();
  const mapEls = async (els: CanvasElementData[]) => {
    const out: CanvasElementData[] = [];
    for (const e of els) {
      if (isBigDataUrl(e.imageUrl)) {
        const id = await assetIdFor(e.imageUrl!);
        ids.add(id);
        out.push({ ...e, imageUrl: `asset:${id}` });
      } else {
        if (e.imageUrl?.startsWith('asset:')) ids.add(e.imageUrl.slice(6));
        out.push(e);
      }
    }
    return out;
  };
  const pages = [];
  for (const p of doc.pages) pages.push({ ...p, elements: await mapEls(p.elements) });
  const master = doc.master ? { elements: await mapEls(doc.master.elements) } : doc.master;
  return { doc: { ...doc, pages, master }, ids: [...ids] };
}

/** Puts pictures back into a lean document (strings are shared between documents). */
async function inlineAssets(doc: PubDocument): Promise<PubDocument> {
  let db: IDBDatabase | null = null;
  const resolve = async (id: string) => {
    let url = urlById.get(id);
    if (url === undefined) {
      db ??= await openDatabase();
      const rec = (await reqToPromise(db.transaction(ASSETS, 'readonly').objectStore(ASSETS).get(id))) as { data: string } | undefined;
      url = rec?.data ?? '';
      if (url) {
        urlById.set(id, url);
        idByUrl.set(url, id);
        storedAssets.add(id);
      }
    }
    return url || undefined;
  };
  const fix = async (els: CanvasElementData[]) => {
    if (!els.some((e) => e.imageUrl?.startsWith('asset:'))) return els;
    const out: CanvasElementData[] = [];
    for (const e of els) out.push(e.imageUrl?.startsWith('asset:') ? { ...e, imageUrl: await resolve(e.imageUrl.slice(6)) } : e);
    return out;
  };
  const pages = [];
  for (const p of doc.pages) pages.push({ ...p, elements: await fix(p.elements) });
  const master = doc.master ? { elements: await fix(doc.master.elements) } : doc.master;
  return { ...doc, pages, master };
}

async function compress(json: string): Promise<{ blob: Blob; type: 'gzip' | 'json' }> {
  try {
    if (typeof CompressionStream !== 'undefined') {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
      return { blob: await new Response(stream).blob(), type: 'gzip' };
    }
  } catch {
    /* fall through */
  }
  return { blob: new Blob([json], { type: 'application/json' }), type: 'json' };
}

async function decompress(blob: Blob, type: 'gzip' | 'json' | undefined): Promise<string> {
  if (type === 'gzip') return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return blob.text();
}

/** Full document of a snapshot (decompressed, pictures restored). */
export async function loadVersionDoc(v: DocVersion): Promise<PubDocument> {
  if (v.doc) return v.doc;
  if (!v.packed) throw new Error('empty version');
  return inlineAssets(JSON.parse(await decompress(v.packed, v.packedType)));
}

export async function addVersion(doc: PubDocument, reason: DocVersion['reason']): Promise<void> {
  const { doc: lean, ids } = await leanDoc(doc);
  const { blob, type } = await compress(JSON.stringify(lean));
  const v: DocVersion = {
    id: uid('ver'),
    docId: doc.id,
    title: doc.title,
    savedAt: new Date().toISOString(),
    reason,
    packed: blob,
    packedType: type,
    pageCount: doc.pages.length,
    docUpdatedAt: doc.updatedAt,
    assetIds: ids
  };
  await put(VERSIONS, v);
  // Keep per-document history bounded.
  const versions = await listVersions(doc.id);
  for (const old of versions.slice(MAX_VERSIONS_PER_DOC)) await del(VERSIONS, old.id);
}

export async function deleteVersion(id: string) {
  await del(VERSIONS, id);
}

/** Deletes pictures no snapshot refers to any more. */
export async function collectUnusedAssets(): Promise<number> {
  try {
    const used = new Set<string>(urlById.keys());
    for (const v of await getAll<DocVersion>(VERSIONS)) for (const id of v.assetIds ?? []) used.add(id);
    for (const d of await getAll<PubDocument>(DOCS))
      forEachElement(d, (e) => {
        if (e.imageUrl?.startsWith('asset:')) used.add(e.imageUrl.slice(6));
      });
    const db = await openDatabase();
    const keys = (await reqToPromise(db.transaction(ASSETS, 'readonly').objectStore(ASSETS).getAllKeys())) as string[];
    let n = 0;
    for (const k of keys) {
      if (!used.has(k)) {
        await del(ASSETS, k);
        storedAssets.delete(k);
        n++;
      }
    }
    return n;
  } catch {
    return 0;
  }
}

/** Removes snapshots older than one year, then unused pictures. */
export async function pruneOldVersions(): Promise<number> {
  const limit = Date.now() - HISTORY_RETENTION_DAYS * 86400000;
  const all = await getAll<DocVersion>(VERSIONS);
  let n = 0;
  for (const v of all) {
    if (new Date(v.savedAt).getTime() < limit) {
      await del(VERSIONS, v.id);
      n++;
    }
  }
  await collectUnusedAssets();
  return n;
}

/** Version prepared for the JSON backup file (compressed snapshot as base64). */
interface PortableVersion extends Omit<DocVersion, 'packed'> {
  packedBase64?: string;
}

async function blobToBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function base64ToBlob(b64: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes]);
}

async function exportVersions(docIds: Set<string> = new Set(), withVersions = true): Promise<{ versions: PortableVersion[]; assets: Record<string, string> }> {
  const versions: PortableVersion[] = [];
  const ids = new Set<string>(docIds);
  for (const v of withVersions ? await listVersions() : []) {
    const { packed, ...rest } = v;
    versions.push(packed ? { ...rest, packedBase64: await blobToBase64(packed) } : rest);
    for (const id of v.assetIds ?? []) ids.add(id);
  }
  const assets: Record<string, string> = {};
  const db = await openDatabase();
  for (const id of ids) {
    const rec = (await reqToPromise(db.transaction(ASSETS, 'readonly').objectStore(ASSETS).get(id))) as { data: string } | undefined;
    if (rec) assets[id] = rec.data;
  }
  return { versions, assets };
}

async function importVersions(versions: PortableVersion[], assets: Record<string, string> | undefined) {
  for (const [id, data] of Object.entries(assets ?? {})) await put(ASSETS, { id, data });
  for (const v of versions) {
    const { packedBase64, ...rest } = v;
    await put(VERSIONS, packedBase64 ? { ...rest, packed: base64ToBlob(packedBase64) } : rest);
  }
}

// ---------------------------------------------------------------------------
// User templates
// ---------------------------------------------------------------------------
export async function loadTemplates(): Promise<UserTemplate[]> {
  const t = await getAll<UserTemplate>(TEMPLATES);
  return t.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export const saveTemplate = (t: UserTemplate) => put(TEMPLATES, t);
export const deleteTemplate = (id: string) => del(TEMPLATES, id);

// ---------------------------------------------------------------------------
// Global backup (.opb)
// ---------------------------------------------------------------------------
export const OPB_FORMAT = 'openpublisher-backup';
const LAST_BACKUP_KEY = 'op.lastBackupAt';

export interface OpbBundle {
  format: typeof OPB_FORMAT;
  formatVersion: 2;
  app: string;
  appVersion: string;
  exportedAt: string;
  documents: PubDocument[];
  folders: Folder[];
  versions: PortableVersion[];
  /** Pictures referenced by compressed versions. */
  assets?: Record<string, string>;
  templates?: UserTemplate[];
}

export async function buildBackup(appVersion: string, includeVersions = true): Promise<OpbBundle> {
  const docs: PubDocument[] = [];
  const docAssets = new Set<string>();
  for (const d of (await getAll<PubDocument>(DOCS)).filter((x) => !x.isTemplate)) {
    const lean = await leanDoc(d);
    lean.ids.forEach((id) => docAssets.add(id));
    docs.push(lean.doc);
  }
  const hist = await exportVersions(docAssets, includeVersions);
  return {
    format: OPB_FORMAT,
    formatVersion: 2,
    app: 'OpenPublisher',
    appVersion,
    exportedAt: new Date().toISOString(),
    documents: docs,
    folders: await loadFolders(),
    versions: hist.versions,
    assets: hist.assets,
    templates: await loadTemplates()
  };
}

/** Accepts a .opb bundle, the legacy v1 JSON workspace bundle, or a single document. */
export async function restoreBackup(raw: unknown): Promise<{ docs: number; folders: number }> {
  const data = raw as Partial<OpbBundle> & { documents?: PubDocument[]; pages?: unknown };
  let docs: PubDocument[] = [];
  let folders: Folder[] = [];
  let versions: PortableVersion[] = [];
  let templates: UserTemplate[] = [];
  if (Array.isArray(data?.documents)) {
    docs = data.documents;
    folders = Array.isArray(data.folders) ? data.folders : [];
    versions = Array.isArray(data.versions) ? data.versions : [];
    templates = Array.isArray(data.templates) ? data.templates : [];
  } else if (Array.isArray(raw)) {
    docs = raw as PubDocument[];
  } else if (data && Array.isArray((data as PubDocument).pages)) {
    docs = [data as PubDocument];
  }
  docs = docs.filter((d) => d && Array.isArray(d.pages) && d.id);
  for (const f of folders) await saveFolder(f);
  await importVersions(versions, data.assets);
  for (const d of docs) await saveDocument({ ...d, isTemplate: false });
  for (const tp of templates) await put(TEMPLATES, tp);
  return { docs: docs.length, folders: folders.length };
}

export function getLastBackupAt(): number {
  try {
    return Number(localStorage.getItem(LAST_BACKUP_KEY) || 0);
  } catch {
    return 0;
  }
}
export function markBackupDone() {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function downloadBlob(data: BlobPart, fileName: string, type = 'application/octet-stream') {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
