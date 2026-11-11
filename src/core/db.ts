// ============================================================================
// Local persistence (IndexedDB): documents, library folders, version history
// ============================================================================
import type { DocVersion, Folder, PubDocument } from './model';
import { uid } from './model';

const DB_NAME = 'openpublisher_db_v1';
const DB_VERSION = 2;
const DOCS = 'documents';
const FOLDERS = 'folders';
const VERSIONS = 'versions';

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
  return docs;
}
export const saveDocument = (doc: PubDocument) => put(DOCS, doc);
export async function deleteDocument(id: string) {
  await del(DOCS, id);
  const versions = await listVersions(id);
  for (const v of versions) await del(VERSIONS, v.id);
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
// ---------------------------------------------------------------------------
export async function listVersions(docId?: string): Promise<DocVersion[]> {
  const all = await getAll<DocVersion>(VERSIONS);
  const out = docId ? all.filter((v) => v.docId === docId) : all;
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function addVersion(doc: PubDocument, reason: DocVersion['reason']): Promise<void> {
  const v: DocVersion = {
    id: uid('ver'),
    docId: doc.id,
    title: doc.title,
    savedAt: new Date().toISOString(),
    reason,
    doc: JSON.parse(JSON.stringify(doc))
  };
  await put(VERSIONS, v);
  // Keep per-document history bounded.
  const versions = await listVersions(doc.id);
  for (const old of versions.slice(MAX_VERSIONS_PER_DOC)) await del(VERSIONS, old.id);
}

export async function deleteVersion(id: string) {
  await del(VERSIONS, id);
}

/** Removes snapshots older than one year. */
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
  return n;
}

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
  versions: DocVersion[];
}

export async function buildBackup(appVersion: string, includeVersions = true): Promise<OpbBundle> {
  return {
    format: OPB_FORMAT,
    formatVersion: 2,
    app: 'OpenPublisher',
    appVersion,
    exportedAt: new Date().toISOString(),
    documents: await loadDocuments(),
    folders: await loadFolders(),
    versions: includeVersions ? await listVersions() : []
  };
}

/** Accepts a .opb bundle, the legacy v1 JSON workspace bundle, or a single document. */
export async function restoreBackup(raw: unknown): Promise<{ docs: number; folders: number }> {
  const data = raw as Partial<OpbBundle> & { documents?: PubDocument[]; pages?: unknown };
  let docs: PubDocument[] = [];
  let folders: Folder[] = [];
  let versions: DocVersion[] = [];
  if (Array.isArray(data?.documents)) {
    docs = data.documents;
    folders = Array.isArray(data.folders) ? data.folders : [];
    versions = Array.isArray(data.versions) ? data.versions : [];
  } else if (Array.isArray(raw)) {
    docs = raw as PubDocument[];
  } else if (data && Array.isArray((data as PubDocument).pages)) {
    docs = [data as PubDocument];
  }
  docs = docs.filter((d) => d && Array.isArray(d.pages) && d.id);
  for (const f of folders) await saveFolder(f);
  for (const d of docs) await saveDocument({ ...d, isTemplate: false });
  for (const v of versions) await put(VERSIONS, v);
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
