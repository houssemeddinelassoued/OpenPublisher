import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n';
import { Hub, type HubTab } from './pages/Hub';
import { Editor } from './editor/Editor';
import { HelpModal, ImportReportModal, VersionsModal } from './components/Modals';
import { AboutModal } from './components/About';
import type { DocVersion, Folder, Orientation, PageSizePreset, PubDocument, PubImportReport, UserTemplate } from './core/model';
import { cloneDoc, uid } from './core/model';
import {
  addVersion,
  buildBackup,
  deleteDocument,
  deleteFolderRecord,
  downloadBlob,
  listVersions,
  loadDocuments,
  loadFolders,
  markBackupDone,
  pruneOldVersions,
  restoreBackup,
  saveDocument,
  saveFolder,
  loadTemplates,
  saveTemplate,
  deleteTemplate as deleteTemplateRecord
} from './core/db';
import { parseFallbackDocumentFile, parsePublisherBinaryBuffer } from './core/importers';
import { buildTemplates, userTemplateInfo, type TemplateInfo } from './templates';
import { APP_VERSION } from './meta';
import { createHistory, type HistoryStore } from './editor/history';

const AUTO_VERSION_MS = 10 * 60 * 1000;

/** Saves a version unless the latest snapshot already matches this state. */
async function snapshot(doc: PubDocument, reason: DocVersion['reason']) {
  const [latest] = await listVersions(doc.id);
  if (latest && latest.doc.updatedAt === doc.updatedAt) return;
  await addVersion(doc, reason);
}

export default function App() {
  const { t } = useI18n();
  const [docs, setDocs] = useState<PubDocument[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [hubTab, setHubTab] = useState<HubTab>('home');
  const [editorId, setEditorId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [importReport, setImportReport] = useState<PubImportReport | null>(null);
  const [builtinTemplates] = useState<TemplateInfo[]>(() => buildTemplates());
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  const templates = [...userTemplates.map(userTemplateInfo), ...builtinTemplates];

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const saveTimers = useRef(new Map<string, number>());
  const docsRef = useRef(docs);
  docsRef.current = docs;
  /** Undo / redo stacks per document, kept for the whole session. */
  const histories = useRef(new Map<string, HistoryStore>());
  const historyFor = (id: string) => {
    let h = histories.current.get(id);
    if (!h) histories.current.set(id, (h = createHistory()));
    return h;
  };
  /** Documents edited since their last save point (Ctrl+S, closing the document). */
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const saveFailed = useRef(false);
  const markDirty = (id: string, on: boolean) =>
    setDirty((s) => {
      if (s.has(id) === on) return s;
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 3000);
  }, []);

  useEffect(() => {
    loadDocuments().then(setDocs);
    loadFolders().then(setFolders);
    loadTemplates().then(setUserTemplates);
    pruneOldVersions();
  }, []);

  // ------------------------------------------------------------- persistence
  const scheduleSave = useCallback((doc: PubDocument) => {
    const timers = saveTimers.current;
    const prev = timers.get(doc.id);
    if (prev) window.clearTimeout(prev);
    timers.set(
      doc.id,
      window.setTimeout(async () => {
        timers.delete(doc.id);
        const ok = await saveDocument(doc);
        if (!ok && !saveFailed.current) {
          saveFailed.current = true;
          notify(t('n.saveFailed'));
        }
      }, 300)
    );
  }, [notify, t]);

  const flushSave = useCallback(async (doc: PubDocument) => {
    const prev = saveTimers.current.get(doc.id);
    if (prev) window.clearTimeout(prev);
    saveTimers.current.delete(doc.id);
    const ok = await saveDocument(doc);
    if (!ok) notify(t('n.saveFailed'));
    return ok;
  }, [notify, t]);

  // Closing the window / tab: write pending edits and warn about unsaved work.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const pending = [...saveTimers.current.keys()];
      for (const id of pending) {
        const d = docsRef.current.find((x) => x.id === id);
        if (d) saveDocument(d);
      }
      if (dirtyRef.current.size > 0 || pending.length > 0 || saveFailed.current) {
        // The browser shows its own confirmation dialog ("Leave site? Changes may not be saved").
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const upsert = useCallback(
    (doc: PubDocument, immediate = false) => {
      setDocs((list) => {
        const exists = list.some((d) => d.id === doc.id);
        const next = exists ? list.map((d) => (d.id === doc.id ? doc : d)) : [doc, ...list];
        return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
      if (immediate) flushSave(doc);
      else scheduleSave(doc);
    },
    [flushSave, scheduleSave]
  );

  // ------------------------------------------------------------- documents
  const openDoc = useCallback((d: PubDocument) => {
    snapshot(d, 'open');
    setEditorId(d.id);
  }, []);

  const newDocBase = (title: string, preset: PageSizePreset, w: number, h: number, o: Orientation): PubDocument => {
    const now = new Date().toISOString();
    return {
      id: uid('doc'),
      title: title.trim() || t('common.newDoc'),
      category: `${preset} (${o})`,
      createdAt: now,
      updatedAt: now,
      pageSize: preset,
      widthMm: w,
      heightMm: h,
      orientation: o,
      marginMm: 12,
      pages: [{ id: uid('page'), name: '', background: '#ffffff', backgroundPattern: 'none', elements: [] }]
    };
  };

  const createBlank = (title: string, preset: PageSizePreset, w: number, h: number, o: Orientation, folderId: string | null = null) => {
    const d = { ...newDocBase(title, preset, w, h, o), folderId };
    upsert(d, true);
    setEditorId(d.id);
    notify(t('n.created'));
  };

  const createFromTemplate = (tpl: TemplateInfo, folderId: string | null = null) => {
    const now = new Date().toISOString();
    const d: PubDocument = {
      ...cloneDoc(tpl.doc),
      id: uid('doc'),
      title: tpl.title ?? t(`tpl.${tpl.key}.title`),
      isTemplate: false,
      createdAt: now,
      updatedAt: now,
      folderId
    };
    upsert(d, true);
    setEditorId(d.id);
    notify(t('n.created'));
  };

  const updateDocMeta = (id: string, patch: Partial<PubDocument>) => {
    const d = docsRef.current.find((x) => x.id === id);
    if (!d) return;
    // Metadata changes (folder, favourite) keep the modification date.
    const touch = 'title' in patch;
    upsert({ ...d, ...patch, updatedAt: touch ? new Date().toISOString() : d.updatedAt }, true);
    if ('folderId' in patch) notify(t('n.moved'));
  };

  const duplicateDoc = (d: PubDocument) => {
    const now = new Date().toISOString();
    upsert({ ...cloneDoc(d), id: uid('doc'), title: `${d.title} (2)`, createdAt: now, updatedAt: now, favorite: false }, true);
    notify(t('n.created'));
  };

  const deleteDoc = async (d: PubDocument) => {
    if (!window.confirm(t('common.confirmDeleteDoc', { t: d.title }))) return;
    await deleteDocument(d.id);
    histories.current.delete(d.id);
    markDirty(d.id, false);
    setDocs((list) => list.filter((x) => x.id !== d.id));
    notify(t('n.docDeleted'));
  };

  // ------------------------------------------------------------- folders
  const createFolder = (name: string, parentId: string | null) => {
    const f: Folder = { id: uid('fld'), name, parentId, createdAt: new Date().toISOString() };
    saveFolder(f);
    setFolders((l) => [...l, f].sort((a, b) => a.name.localeCompare(b.name)));
  };
  const renameFolder = (id: string, name: string) => {
    setFolders((l) =>
      l.map((f) => {
        if (f.id !== id) return f;
        const nf = { ...f, name };
        saveFolder(nf);
        return nf;
      })
    );
  };
  const moveFolder = (id: string, parentId: string | null) => {
    setFolders((l) =>
      l.map((f) => {
        if (f.id !== id) return f;
        const nf = { ...f, parentId };
        saveFolder(nf);
        return nf;
      })
    );
    notify(t('n.moved'));
  };

  // ------------------------------------------------------------- user templates
  const createUserTemplate = async (doc: PubDocument, name: string, description: string) => {
    const now = new Date().toISOString();
    const tpl: UserTemplate = {
      id: uid('tpl'),
      name,
      description,
      createdAt: now,
      doc: { ...cloneDoc(doc), id: uid('tpldoc'), title: name, isTemplate: true, folderId: null, favorite: false, updatedAt: now }
    };
    const ok = await saveTemplate(tpl);
    if (!ok) return notify(t('n.saveFailed'));
    setUserTemplates((l) => [tpl, ...l]);
    notify(t('tplm.created', { t: name }));
  };

  const removeUserTemplate = async (id: string) => {
    await deleteTemplateRecord(id);
    setUserTemplates((l) => l.filter((x) => x.id !== id));
  };

  const deleteFolder = (id: string) => {
    const f = folders.find((x) => x.id === id);
    if (!f) return;
    const parent = f.parentId ?? null;
    const nextFolders = folders
      .filter((x) => x.id !== id)
      .map((x) => {
        if (x.parentId !== id) return x;
        const moved = { ...x, parentId: parent };
        saveFolder(moved);
        return moved;
      });
    deleteFolderRecord(id);
    setFolders(nextFolders);
    for (const d of docsRef.current) if (d.folderId === id) upsert({ ...d, folderId: parent }, true);
  };

  // ------------------------------------------------------------- import / backup
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    try {
      if (ext === 'opb') return await importBackupFile(file);
      if (ext === 'json') {
        const parsed = JSON.parse(await file.text());
        if (Array.isArray(parsed?.documents)) return await importBackupFile(file);
        if (!Array.isArray(parsed?.pages)) throw new Error('format');
        const now = new Date().toISOString();
        const d: PubDocument = { ...(parsed as PubDocument), id: uid('doc'), isTemplate: false, updatedAt: now, createdAt: now };
        upsert(d, true);
        setEditorId(d.id);
        notify(t('n.imported'));
        return;
      }
      const report =
        ext === 'pub' ? await parsePublisherBinaryBuffer(file.name, await file.arrayBuffer()) : await parseFallbackDocumentFile(file);
      const d = { ...report.generatedDoc, id: uid('doc'), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      upsert(d, true);
      setEditorId(d.id);
      setImportReport(report);
    } catch {
      notify(t('n.importFail'));
    }
  };

  const importBackupFile = async (file: File) => {
    try {
      const res = await restoreBackup(JSON.parse(await file.text()));
      setDocs(await loadDocuments());
      setFolders(await loadFolders());
      notify(t('bk.restored', { n: res.docs }));
    } catch {
      notify(t('bk.invalid'));
    }
  };

  const exportBackup = async () => {
    // Flush pending saves first so the backup is complete.
    for (const id of [...saveTimers.current.keys()]) {
      const d = docsRef.current.find((x) => x.id === id);
      if (d) await flushSave(d);
    }
    const bundle = await buildBackup(APP_VERSION);
    downloadBlob(JSON.stringify(bundle), `OpenPublisher_${new Date().toISOString().slice(0, 10)}.opb`, 'application/x-openpublisher-backup');
    markBackupDone();
    notify(t('bk.done'));
  };

  const restoreVersion = async (v: DocVersion) => {
    const current = docsRef.current.find((d) => d.id === v.docId);
    if (current) {
      await addVersion(current, 'restore');
      // Restoring is undoable from the editor too.
      const h = historyFor(current.id);
      h.past.push({ doc: current, label: t('act.restore'), at: Date.now() });
      h.future = [];
      h.lastKey = '';
    }
    const restored: PubDocument = { ...cloneDoc(v.doc), updatedAt: new Date().toISOString() };
    upsert(restored, true);
    markDirty(restored.id, false);
    notify(t('n.restored'));
  };

  /** Save point: write now, keep a version, clear the "unsaved" state. */
  const saveNow = async (doc: PubDocument) => {
    const ok = await flushSave(doc);
    if (!ok) return;
    saveFailed.current = false;
    await addVersion(doc, 'manual');
    markDirty(doc.id, false);
    notify(t('n.savedVersion'));
  };

  // ------------------------------------------------------------- editor
  const editorDoc = editorId ? docs.find((d) => d.id === editorId) ?? null : null;

  // Periodic version snapshots while editing.
  useEffect(() => {
    if (!editorId) return;
    const id = window.setInterval(() => {
      const d = docsRef.current.find((x) => x.id === editorId);
      if (d) snapshot(d, 'auto');
    }, AUTO_VERSION_MS);
    return () => window.clearInterval(id);
  }, [editorId]);

  const closeEditor = async () => {
    if (editorDoc) {
      const ok = await flushSave(editorDoc);
      if (ok) {
        await snapshot(editorDoc, 'close');
        markDirty(editorDoc.id, false);
      }
    }
    setEditorId(null);
  };

  return (
    <div className="h-full">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pub,.docx,.html,.htm,.txt,.json,.opb"
        className="hidden"
        onChange={handleImportFile}
      />
      <input
        ref={backupInputRef}
        type="file"
        accept=".opb,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) importBackupFile(f);
        }}
      />

      {editorDoc ? (
        <Editor
          key={editorDoc.id}
          doc={editorDoc}
          history={historyFor(editorDoc.id)}
          dirty={dirty.has(editorDoc.id)}
          onSave={() => saveNow(docsRef.current.find((d) => d.id === editorDoc.id) ?? editorDoc)}
          onChange={(d) => {
            upsert(d);
            markDirty(d.id, true);
          }}
          onClose={closeEditor}
          onImportFile={() => fileInputRef.current?.click()}
          onShowVersions={() => setVersionsOpen(true)}
          notify={notify}
          openHelp={() => setHelpOpen(true)}
          openAbout={() => setAboutOpen(true)}
          onSaveTemplate={createUserTemplate}
        />
      ) : (
        <Hub
          tab={hubTab}
          setTab={setHubTab}
          docs={docs}
          folders={folders}
          templates={templates}
          deleteTemplate={removeUserTemplate}
          saveDocAsTemplate={createUserTemplate}
          moveFolder={moveFolder}
          openDoc={openDoc}
          createBlank={createBlank}
          createFromTemplate={createFromTemplate}
          updateDocMeta={updateDocMeta}
          duplicateDoc={duplicateDoc}
          deleteDoc={deleteDoc}
          createFolder={createFolder}
          renameFolder={renameFolder}
          deleteFolder={deleteFolder}
          importFile={() => fileInputRef.current?.click()}
          exportBackup={exportBackup}
          importBackup={() => backupInputRef.current?.click()}
          restoreVersion={restoreVersion}
          openHelp={() => setHelpOpen(true)}
          openAbout={() => setAboutOpen(true)}
        />
      )}

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      {importReport && <ImportReportModal report={importReport} onClose={() => setImportReport(null)} />}
      {versionsOpen && editorDoc && (
        <VersionsModal
          doc={editorDoc}
          onClose={() => setVersionsOpen(false)}
          onRestore={(v) => {
            setVersionsOpen(false);
            restoreVersion(v);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[120] bg-brand-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg max-w-[90vw] text-center">
          {toast}
        </div>
      )}
    </div>
  );
}
