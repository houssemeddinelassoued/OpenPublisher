import { useEffect, useMemo, useState } from 'react';
import {
  Home,
  Library,
  History,
  HelpCircle,
  Info,
  Plus,
  FolderOpen,
  Folder as FolderIcon,
  FolderPlus,
  Clock,
  Star,
  Trash2,
  Pencil,
  Copy,
  ChevronRight,
  ChevronDown,
  CloudDownload,
  CloudUpload,
  Search,
  FileText,
  X,
  ShieldCheck,
  LayoutTemplate,
  GripVertical
} from 'lucide-react';
import { useI18n } from '../i18n';
import { AppLogo, LanguageSwitcher, NQLogo } from '../components/Brand';
import { NewDocModal, VersionsModal } from '../components/Modals';
import { SaveTemplateModal } from '../components/TemplateModal';
import { PagePreview } from '../editor/ElementView';
import type { DocVersion, Folder, Orientation, PageSizePreset, PubDocument } from '../core/model';
import { pageOrientation } from '../core/model';
import { getLastBackupAt, listVersions, HISTORY_RETENTION_DAYS } from '../core/db';
import type { TemplateGroup, TemplateInfo } from '../templates';
import { APP_COMPANY, APP_INITIATIVE, APP_VERSION } from '../meta';

export type HubTab = 'home' | 'library' | 'history';

export interface HubProps {
  tab: HubTab;
  setTab: (t: HubTab) => void;
  docs: PubDocument[];
  folders: Folder[];
  templates: TemplateInfo[];
  openDoc: (d: PubDocument) => void;
  createBlank: (title: string, preset: PageSizePreset, w: number, h: number, o: Orientation, folderId?: string | null) => void;
  createFromTemplate: (tpl: TemplateInfo, folderId?: string | null) => void;
  deleteTemplate: (id: string) => void;
  saveDocAsTemplate: (doc: PubDocument, name: string, description: string) => void;
  updateDocMeta: (id: string, patch: Partial<PubDocument>) => void;
  duplicateDoc: (d: PubDocument) => void;
  deleteDoc: (d: PubDocument) => void;
  createFolder: (name: string, parentId: string | null) => void;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  moveFolder: (id: string, parentId: string | null) => void;
  importFile: () => void;
  exportBackup: () => void;
  importBackup: () => void;
  restoreVersion: (v: DocVersion) => void;
  openHelp: () => void;
  openAbout: () => void;
}

const BACKUP_SNOOZE_KEY = 'op.backupSnoozeUntil';
const BACKUP_EVERY_DAYS = 7;
const DOC_MIME = 'application/x-op-doc';
const FOLDER_MIME = 'application/x-op-folder';

// ---------------------------------------------------------------------------
// Drag & drop helpers (documents and folders → folders)
// ---------------------------------------------------------------------------
function isInside(folders: Folder[], folderId: string, ancestorId: string): boolean {
  const byId = new Map(folders.map((f) => [f.id, f]));
  let cur: string | null | undefined = folderId;
  let guard = 0;
  while (cur && guard++ < 50) {
    if (cur === ancestorId) return true;
    cur = byId.get(cur)?.parentId;
  }
  return false;
}

/** Makes an element a drop target for documents / folders. */
function useFolderDrop(target: string | null, p: Pick<HubProps, 'updateDocMeta' | 'moveFolder' | 'folders'>) {
  const [over, setOver] = useState(false);
  const accepts = (e: React.DragEvent) => e.dataTransfer.types.includes(DOC_MIME) || e.dataTransfer.types.includes(FOLDER_MIME);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!over) setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        setOver(false);
        const docId = e.dataTransfer.getData(DOC_MIME);
        const folderId = e.dataTransfer.getData(FOLDER_MIME);
        if (docId) {
          e.preventDefault();
          p.updateDocMeta(docId, { folderId: target });
        } else if (folderId && folderId !== target && !(target && isInside(p.folders, target, folderId))) {
          e.preventDefault();
          p.moveFolder(folderId, target);
        }
      }
    }
  };
}

const dropRing = (over: boolean) => (over ? 'ring-2 ring-brand-500 bg-brand-50' : '');

export function Hub(p: HubProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [newDocFor, setNewDocFor] = useState<{ folderId: string | null } | null>(null);
  const [versionsFor, setVersionsFor] = useState<PubDocument | null>(null);
  const [templateFor, setTemplateFor] = useState<PubDocument | null>(null);
  const [libFolder, setLibFolder] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => (q ? p.docs.filter((d) => d.title.toLowerCase().includes(q)) : p.docs), [p.docs, q]);

  const nav: { id: HubTab; label: string; icon: typeof Home }[] = [
    { id: 'home', label: t('nav.home'), icon: Home },
    { id: 'library', label: t('nav.library'), icon: Library },
    { id: 'history', label: t('nav.history'), icon: History }
  ];
  const favorites = p.docs.filter((d) => d.favorite);
  const rootFolders = p.folders.filter((f) => !f.parentId);
  const listProps = { ...p, onVersions: setVersionsFor, onTemplate: setTemplateFor };

  return (
    <div className="h-full flex bg-[#f4f8f8] text-slate-900">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-white border-e border-slate-200 flex flex-col">
        <div className="px-4 py-3.5 flex items-center gap-3 border-b border-slate-100">
          <AppLogo size={46} />
          <div className="min-w-0">
            <div className="font-bold text-brand-900 leading-tight">OpenPublisher</div>
            <div className="text-[11px] text-slate-500 truncate">{t('app.tagline')}</div>
          </div>
        </div>
        <nav className="p-3 space-y-1">
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => p.setTab(n.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${
                p.tab === n.id ? 'bg-brand-700 text-white shadow-sm' : 'text-slate-700 hover:bg-brand-50'
              }`}
            >
              <n.icon className="w-4.5 h-4.5" /> {n.label}
            </button>
          ))}
        </nav>

        <div className="px-4 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{t('lib.quick')}</div>
        <div className="flex-1 overflow-y-auto op-scroll px-3 pb-3 space-y-0.5">
          {favorites.map((d) => (
            <button
              key={d.id}
              onClick={() => p.openDoc(d)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-100 text-start"
            >
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400 shrink-0" />
              <span className="truncate">{d.title}</span>
            </button>
          ))}
          {rootFolders.map((f) => (
            <SidebarFolder
              key={f.id}
              folder={f}
              hub={p}
              onOpen={() => {
                setLibFolder(f.id);
                p.setTab('library');
              }}
            />
          ))}
        </div>

        <button onClick={p.openAbout} className="border-t border-slate-100 p-3 flex items-center gap-3 text-start hover:bg-slate-50">
          <NQLogo size={38} />
          <div className="text-[11px] leading-tight text-slate-500 min-w-0">
            <div className="font-semibold text-brand-900 truncate">{APP_COMPANY}</div>
            <div className="truncate">
              {APP_INITIATIVE} • v{APP_VERSION}
            </div>
          </div>
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white/80 backdrop-blur border-b border-slate-200 px-6 py-3 flex items-center gap-3 relative z-20">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('common.search')}
              className="w-full ps-9 pe-8 py-2 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute top-1/2 -translate-y-1/2 end-2 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex-1" />
          <LanguageSwitcher />
          <button onClick={p.openHelp} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium">
            <HelpCircle className="w-4 h-4 text-brand-700" /> {t('common.help')}
          </button>
          <button onClick={p.openAbout} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium">
            <Info className="w-4 h-4 text-brand-700" /> {t('common.about')}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto op-scroll">
          <div className="max-w-6xl mx-auto px-6 py-7 space-y-8">
            {q ? (
              <section className="space-y-3">
                <h2 className="text-lg font-bold text-brand-900">
                  “{query}” — {t('lib.files', { n: filtered.length })}
                </h2>
                <DocList {...listProps} docs={filtered} />
              </section>
            ) : p.tab === 'home' ? (
              <HomeTab {...listProps} onNewDoc={() => setNewDocFor({ folderId: null })} />
            ) : p.tab === 'library' ? (
              <LibraryTab {...listProps} folderId={libFolder} setFolderId={setLibFolder} onNewDoc={(folderId) => setNewDocFor({ folderId })} />
            ) : (
              <HistoryTab {...listProps} />
            )}
          </div>
        </main>
      </div>

      {newDocFor && (
        <NewDocModal
          onClose={() => setNewDocFor(null)}
          onCreate={(title, preset, w, h, o) => {
            p.createBlank(title, preset, w, h, o, newDocFor.folderId);
            setNewDocFor(null);
          }}
        />
      )}
      {versionsFor && (
        <VersionsModal
          doc={versionsFor}
          onClose={() => setVersionsFor(null)}
          onRestore={(v) => {
            setVersionsFor(null);
            p.restoreVersion(v);
          }}
        />
      )}
      {templateFor && (
        <SaveTemplateModal
          defaultName={templateFor.title}
          scopes={[{ scope: 'document', pages: templateFor.pages.length }]}
          initialScope="document"
          onClose={() => setTemplateFor(null)}
          onSave={(name, desc) => {
            p.saveDocAsTemplate(templateFor, name, desc);
            setTemplateFor(null);
          }}
        />
      )}
    </div>
  );
}

type ListProps = HubProps & { onVersions: (d: PubDocument) => void; onTemplate: (d: PubDocument) => void };

function SidebarFolder({ folder, hub, onOpen }: { folder: Folder; hub: HubProps; onOpen: () => void }) {
  const drop = useFolderDrop(folder.id, hub);
  return (
    <button
      onClick={onOpen}
      {...drop.props}
      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-100 text-start ${dropRing(drop.over)}`}
    >
      <FolderIcon className="w-3.5 h-3.5 text-brand-600 fill-brand-100 shrink-0" />
      <span className="truncate">{folder.name}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
function BackupBanner({ docs, exportBackup }: { docs: PubDocument[]; exportBackup: () => void }) {
  const { t } = useI18n();
  const [hidden, setHidden] = useState(() => {
    try {
      return Number(localStorage.getItem(BACKUP_SNOOZE_KEY) || 0) > Date.now();
    } catch {
      return false;
    }
  });
  const last = getLastBackupAt();
  const days = last ? Math.floor((Date.now() - last) / 86400000) : -1;
  if (hidden || docs.length === 0 || (days >= 0 && days < BACKUP_EVERY_DAYS)) return null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-wrap items-center gap-4">
      <ShieldCheck className="w-8 h-8 text-amber-600 shrink-0" />
      <div className="flex-1 min-w-[200px]">
        <div className="font-semibold text-amber-900">{t('bk.proposeTitle')}</div>
        <div className="text-sm text-amber-800">{days < 0 ? t('bk.proposeNever') : t('bk.proposeOld', { n: days })}</div>
      </div>
      <button
        onClick={() => {
          try {
            localStorage.setItem(BACKUP_SNOOZE_KEY, String(Date.now() + 3 * 86400000));
          } catch {
            /* ignore */
          }
          setHidden(true);
        }}
        className="px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 rounded-lg"
      >
        {t('bk.later')}
      </button>
      <button onClick={exportBackup} className="px-4 py-2 text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg inline-flex items-center gap-2">
        <CloudDownload className="w-4 h-4" /> {t('bk.now')}
      </button>
    </div>
  );
}

function previewWidth(d: PubDocument, portraitW: number) {
  return pageOrientation(d, d.pages[0]) === 'landscape' ? Math.round(portraitW * 1.414) : portraitW;
}

function HomeTab(p: ListProps & { onNewDoc: () => void }) {
  const { t, fmtDate } = useI18n();
  const userCount = p.templates.filter((x) => x.userId).length;
  const [filter, setFilter] = useState<'all' | TemplateGroup>('all');
  const groups: ('all' | TemplateGroup)[] = ['all', ...(userCount ? (['mine'] as const) : []), 'class', 'parents', 'rewards', 'organisation'];
  const shown = p.templates.filter((x) => filter === 'all' || x.group === filter);
  const last = p.docs[0];
  return (
    <>
      <section className="rounded-3xl bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 text-white p-7 shadow-md relative overflow-hidden">
        <div className="absolute -end-10 -top-10 w-56 h-56 rounded-full bg-aqua/20" />
        <h1 className="text-2xl font-bold tracking-tight relative">{t('hub.hello')}</h1>
        <p className="text-brand-100 text-sm mt-1 relative">{t('hub.subtitle')}</p>
        <div className="flex flex-wrap gap-3 mt-5 relative">
          {last && (
            <button
              onClick={() => p.openDoc(last)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-brand-800 hover:bg-brand-50 text-sm font-semibold shadow-sm"
            >
              <Clock className="w-4 h-4" />
              {t('hub.resume', { t: last.title.length > 28 ? last.title.slice(0, 28) + '…' : last.title })}
            </button>
          )}
          <HeroBtn onClick={() => p.createBlank(t('common.newDoc'), 'A4', 210, 297, 'portrait')} icon={Plus} label={t('hub.blankPortrait')} />
          <HeroBtn onClick={() => p.createBlank(t('common.newDoc'), 'A4', 210, 297, 'landscape')} icon={Plus} label={t('hub.blankLandscape')} />
          <HeroBtn onClick={p.importFile} icon={FolderOpen} label={t('hub.openFile')} title={t('hub.openFileTip')} />
          <button onClick={p.onNewDoc} className="px-3 py-2.5 text-sm text-brand-100 hover:text-white underline underline-offset-4">
            {t('hub.otherFormat')}
          </button>
        </div>
      </section>

      <BackupBanner docs={p.docs} exportBackup={p.exportBackup} />

      {/* Recent documents (before templates) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-900">{t('hub.recent')}</h2>
          {p.docs.length > 6 && (
            <button onClick={() => p.setTab('history')} className="text-sm font-semibold text-brand-700 hover:underline">
              {t('hub.seeAll')}
            </button>
          )}
        </div>
        {p.docs.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-500 text-sm">{t('hub.noDocs')}</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {p.docs.slice(0, 6).map((d) => (
              <button key={d.id} onClick={() => p.openDoc(d)} className="group text-start" title={d.title}>
                <div className="h-36 rounded-xl bg-slate-100 border border-slate-200 group-hover:border-brand-400 group-hover:shadow-md flex items-center justify-center overflow-hidden transition">
                  <PagePreview doc={d} pageIndex={0} width={previewWidth(d, 88)} />
                </div>
                <div className="text-sm font-semibold mt-1.5 truncate group-hover:text-brand-700">{d.title}</div>
                <div className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3 shrink-0" />
                  <span className="truncate">{fmtDate(d.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Templates */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-brand-900">{t('hub.templates')}</h2>
            <p className="text-sm text-slate-500">{t('hub.templatesSub')}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => (
              <button
                key={g}
                onClick={() => setFilter(g)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  filter === g ? 'bg-brand-700 border-brand-700 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t(`grp.${g}`)}
                {g === 'mine' && ` (${userCount})`}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {shown.map((tpl) => (
            <div key={tpl.key} className="group relative">
              <button
                onClick={() => p.createFromTemplate(tpl)}
                className="w-full h-full text-start bg-white hover:shadow-md border border-slate-200 hover:border-brand-400 rounded-2xl p-3 transition flex flex-col"
              >
                <div className="h-44 rounded-xl bg-slate-100 flex items-center justify-center mb-3 overflow-hidden">
                  <PagePreview doc={tpl.doc} pageIndex={0} width={previewWidth(tpl.doc, 120)} />
                </div>
                <div className="flex items-center gap-1.5">
                  {tpl.userId && <LayoutTemplate className="w-3.5 h-3.5 text-brand-600 shrink-0" />}
                  <span className="font-semibold text-sm text-slate-900 group-hover:text-brand-700 truncate">{tpl.title ?? t(`tpl.${tpl.key}.title`)}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5 flex-1">{tpl.userId ? tpl.description || t('tpl.mine') : t(`tpl.${tpl.key}.desc`)}</div>
                <div className="text-[11px] text-slate-400 mt-2">{t('common.pages', { n: tpl.doc.pages.length })}</div>
              </button>
              {tpl.userId && (
                <button
                  title={t('common.delete')}
                  onClick={() => {
                    if (window.confirm(t('tpl.deleteConfirm', { t: tpl.title ?? '' }))) p.deleteTemplate(tpl.userId!);
                  }}
                  className="absolute top-2 end-2 p-1.5 rounded-lg bg-white/95 border border-slate-200 text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 shadow-sm"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400">{t('tpl.contentNote')}</p>
      </section>

      <BackupCard exportBackup={p.exportBackup} importBackup={p.importBackup} />
    </>
  );
}

function HeroBtn({ onClick, icon: Icon, label, title }: { onClick: () => void; icon: typeof Plus; label: string; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/30 text-white text-sm font-semibold"
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

function BackupCard({ exportBackup, importBackup }: { exportBackup: () => void; importBackup: () => void }) {
  const { t, fmtDate } = useI18n();
  const last = getLastBackupAt();
  return (
    <section className="rounded-2xl bg-white border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4">
      <div className="max-w-xl">
        <div className="font-semibold text-sm text-brand-900">{t('bk.title')}</div>
        <p className="text-xs text-slate-500 mt-0.5">{t('bk.desc')}</p>
        <p className="text-xs text-slate-400 mt-1">{last ? t('bk.last', { d: fmtDate(last) }) : t('bk.never')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={exportBackup} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-xs font-semibold">
          <CloudDownload className="w-4 h-4" /> {t('bk.export')}
        </button>
        <button onClick={importBackup} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold">
          <CloudUpload className="w-4 h-4 text-brand-700" /> {t('bk.import')}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Library (folders / sub-folders / files, drag & drop)
// ---------------------------------------------------------------------------
function LibraryTab(p: ListProps & { folderId: string | null; setFolderId: (id: string | null) => void; onNewDoc: (folderId: string | null) => void }) {
  const { t } = useI18n();
  const byId = new Map(p.folders.map((f) => [f.id, f]));
  const current = p.folderId && byId.has(p.folderId) ? p.folderId : null;
  const path: Folder[] = [];
  for (let id = current; id; id = byId.get(id)?.parentId ?? null) {
    const f = byId.get(id);
    if (!f || path.includes(f)) break;
    path.unshift(f);
  }
  const sub = p.folders.filter((f) => (f.parentId ?? null) === current);
  const docsHere = p.docs.filter((d) => (d.folderId ?? null) === current || (current === null && d.folderId && !byId.has(d.folderId)));

  const [newName, setNewName] = useState<string | null>(null);
  const submitFolder = () => {
    if (newName && newName.trim()) p.createFolder(newName.trim(), current);
    setNewName(null);
  };
  const rootDrop = useFolderDrop(null, p);

  return (
    <div className="flex gap-6 items-start">
      <div className="w-60 shrink-0 bg-white border border-slate-200 rounded-2xl p-3 hidden md:block">
        <button
          onClick={() => p.setFolderId(null)}
          {...rootDrop.props}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-semibold ${
            current === null ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-50'
          } ${dropRing(rootDrop.over)}`}
        >
          <Library className="w-4 h-4" /> {t('lib.root')}
        </button>
        <FolderTree hub={p} parentId={null} current={current} onPick={p.setFolderId} depth={0} />
        <p className="text-[11px] text-slate-400 mt-3 px-1 leading-relaxed">{t('lib.dndHint')}</p>
      </div>

      <div className="flex-1 min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
              <Crumb label={t('lib.title')} target={null} hub={p} onClick={() => p.setFolderId(null)} />
              {path.map((f) => (
                <span key={f.id} className="inline-flex items-center gap-1">
                  <ChevronRight className="w-3.5 h-3.5" />
                  <Crumb label={f.name} target={f.id} hub={p} onClick={() => p.setFolderId(f.id)} />
                </span>
              ))}
            </div>
            <h2 className="text-xl font-bold text-brand-900">{path.length ? path[path.length - 1].name : t('lib.title')}</h2>
            {!current && <p className="text-sm text-slate-500">{t('lib.sub')}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setNewName(t('lib.defaultFolder'))}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium"
            >
              <FolderPlus className="w-4 h-4 text-brand-700" /> {current ? t('lib.newSubfolder') : t('lib.newFolder')}
            </button>
            <button onClick={() => p.onNewDoc(current)} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold">
              <Plus className="w-4 h-4" /> {t('lib.newDocHere')}
            </button>
          </div>
        </div>

        {newName !== null && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitFolder();
            }}
            className="flex items-center gap-2 bg-white border border-brand-300 rounded-xl p-3"
          >
            <FolderPlus className="w-5 h-5 text-brand-600 shrink-0" />
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => e.key === 'Escape' && setNewName(null)}
              placeholder={t('lib.folderName')}
              className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button type="submit" className="px-3 py-1.5 text-sm font-semibold bg-brand-700 hover:bg-brand-800 text-white rounded-lg">
              {t('common.create')}
            </button>
            <button type="button" onClick={() => setNewName(null)} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
              {t('common.cancel')}
            </button>
          </form>
        )}

        {sub.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {sub.map((f) => (
              <FolderCard key={f.id} folder={f} hub={p} onOpen={() => p.setFolderId(f.id)} />
            ))}
          </div>
        )}

        {docsHere.length === 0 && sub.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-500 text-sm">{t('lib.empty')}</div>
        ) : (
          docsHere.length > 0 && <DocList {...p} docs={docsHere} />
        )}
      </div>
    </div>
  );
}

function Crumb({ label, target, hub, onClick }: { label: string; target: string | null; hub: HubProps; onClick: () => void }) {
  const drop = useFolderDrop(target, hub);
  return (
    <button onClick={onClick} {...drop.props} className={`hover:text-brand-700 font-medium rounded px-1 ${dropRing(drop.over)}`}>
      {label}
    </button>
  );
}

function FolderCard({ folder: f, hub: p, onOpen }: { folder: Folder; hub: HubProps; onOpen: () => void }) {
  const { t } = useI18n();
  const drop = useFolderDrop(f.id, p);
  const nDocs = p.docs.filter((d) => d.folderId === f.id).length;
  const nSub = p.folders.filter((x) => x.parentId === f.id).length;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(FOLDER_MIME, f.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      {...drop.props}
      onClick={onOpen}
      className={`group bg-white border border-slate-200 hover:border-brand-400 rounded-xl p-3 flex items-start gap-3 cursor-pointer transition ${dropRing(drop.over)}`}
    >
      <FolderIcon className="w-9 h-9 text-brand-500 fill-brand-100 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm truncate">{f.name}</div>
        <div className="text-xs text-slate-500">
          {t('lib.folders', { n: nSub })} • {t('lib.files', { n: nDocs })}
        </div>
      </div>
      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
        <button
          title={t('common.rename')}
          onClick={() => {
            const name = window.prompt(t('lib.folderName'), f.name);
            if (name && name.trim()) p.renameFolder(f.id, name.trim());
          }}
          className="p-1 rounded text-slate-400 hover:text-brand-700 hover:bg-brand-50"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          title={t('common.delete')}
          onClick={() => {
            if (window.confirm(t('lib.deleteFolderConfirm', { t: f.name }))) p.deleteFolder(f.id);
          }}
          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function FolderTree({ hub, parentId, current, onPick, depth }: { hub: HubProps; parentId: string | null; current: string | null; onPick: (id: string) => void; depth: number }) {
  const children = hub.folders.filter((f) => (f.parentId ?? null) === parentId);
  if (depth > 12) return null;
  return (
    <ul>
      {children.map((f) => (
        <FolderTreeItem key={f.id} folder={f} hub={hub} current={current} onPick={onPick} depth={depth} />
      ))}
    </ul>
  );
}

function FolderTreeItem({ folder: f, hub, current, onPick, depth }: { folder: Folder; hub: HubProps; current: string | null; onPick: (id: string) => void; depth: number }) {
  const [open, setOpen] = useState(true);
  const drop = useFolderDrop(f.id, hub);
  const hasKids = hub.folders.some((x) => x.parentId === f.id);
  return (
    <li>
      <div
        {...drop.props}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(FOLDER_MIME, f.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        className={`flex items-center gap-1 rounded-lg text-sm ${current === f.id ? 'bg-brand-50 text-brand-800 font-semibold' : 'text-slate-700 hover:bg-slate-50'} ${dropRing(drop.over)}`}
        style={{ paddingInlineStart: 4 + depth * 14 }}
      >
        <button onClick={() => setOpen(!open)} className={`p-0.5 ${hasKids ? '' : 'invisible'}`}>
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => onPick(f.id)} className="flex-1 flex items-center gap-1.5 py-1.5 text-start min-w-0">
          <FolderIcon className="w-3.5 h-3.5 text-brand-600 fill-brand-100 shrink-0" />
          <span className="truncate">{f.name}</span>
        </button>
      </div>
      {hasKids && open && <FolderTree hub={hub} parentId={f.id} current={current} onPick={onPick} depth={depth + 1} />}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Shared document list (rows are draggable onto folders)
// ---------------------------------------------------------------------------
function DocList(p: ListProps & { docs: PubDocument[] }) {
  const { t, fmtDate } = useI18n();
  const [dragging, setDragging] = useState<string | null>(null);
  const folderOptions = useMemo(() => {
    const byId = new Map(p.folders.map((f) => [f.id, f]));
    const label = (f: Folder) => {
      const parts: string[] = [];
      let cur: Folder | undefined = f;
      let guard = 0;
      while (cur && guard++ < 20) {
        parts.unshift(cur.name);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return parts.join(' / ');
    };
    return p.folders.map((f) => ({ id: f.id, label: label(f) })).sort((a, b) => a.label.localeCompare(b.label));
  }, [p.folders]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
      {p.docs.map((d) => (
        <div
          key={d.id}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DOC_MIME, d.id);
            e.dataTransfer.effectAllowed = 'move';
            setDragging(d.id);
          }}
          onDragEnd={() => setDragging(null)}
          className={`px-3 py-3 hover:bg-slate-50 flex flex-wrap items-center gap-3 ${dragging === d.id ? 'opacity-40' : ''}`}
        >
          <GripVertical className="w-4 h-4 text-slate-300 cursor-grab shrink-0" aria-hidden />
          <button onClick={() => p.openDoc(d)} className="flex items-center gap-3 min-w-0 flex-1 text-start">
            <div className="w-12 h-14 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
              {d.pages.length ? <PagePreview doc={d} pageIndex={0} width={previewWidth(d, 32)} /> : <FileText className="w-5 h-5 text-brand-600" />}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm text-slate-900 truncate">{d.title}</div>
              <div className="text-xs text-slate-500">
                {t('common.pages', { n: d.pages.length })} • {t('common.modified', { d: fmtDate(d.updatedAt) })}
              </div>
            </div>
          </button>
          <div className="flex items-center gap-1">
            <IconBtn title={d.favorite ? t('lib.unfavorite') : t('lib.favorite')} onClick={() => p.updateDocMeta(d.id, { favorite: !d.favorite })}>
              <Star className={`w-4 h-4 ${d.favorite ? 'text-amber-500 fill-amber-400' : ''}`} />
            </IconBtn>
            <select
              value={d.folderId ?? ''}
              onChange={(e) => p.updateDocMeta(d.id, { folderId: e.target.value || null })}
              title={t('lib.moveTo')}
              className="max-w-36 text-xs border border-slate-200 rounded-lg px-1.5 py-1 bg-white text-slate-600"
            >
              <option value="">{t('lib.rootOption')}</option>
              {folderOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            <IconBtn title={t('hist.versions')} onClick={() => p.onVersions(d)}>
              <History className="w-4 h-4" />
            </IconBtn>
            <IconBtn title={t('tplm.fromDoc')} onClick={() => p.onTemplate(d)}>
              <LayoutTemplate className="w-4 h-4" />
            </IconBtn>
            <IconBtn
              title={t('common.rename')}
              onClick={() => {
                const name = window.prompt(t('hub.title'), d.title);
                if (name && name.trim()) p.updateDocMeta(d.id, { title: name.trim() });
              }}
            >
              <Pencil className="w-4 h-4" />
            </IconBtn>
            <IconBtn title={t('common.duplicate')} onClick={() => p.duplicateDoc(d)}>
              <Copy className="w-4 h-4" />
            </IconBtn>
            <IconBtn title={t('common.delete')} danger onClick={() => p.deleteDoc(d)}>
              <Trash2 className="w-4 h-4" />
            </IconBtn>
            <button onClick={() => p.openDoc(d)} className="ms-1 px-3 py-1.5 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-800 text-xs font-semibold">
              {t('common.open')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function IconBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`p-1.5 rounded-lg text-slate-400 ${danger ? 'hover:text-rose-600 hover:bg-rose-50' : 'hover:text-brand-700 hover:bg-brand-50'}`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// History (documents grouped by period, last 12 months)
// ---------------------------------------------------------------------------
function HistoryTab(p: ListProps) {
  const { t, locale } = useI18n();
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    listVersions().then((vs) => {
      const c: Record<string, number> = {};
      for (const v of vs) c[v.docId] = (c[v.docId] || 0) + 1;
      setCounts(c);
    });
  }, [p.docs]);

  const groups = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = 86400000;
    const dow = (now.getDay() + 6) % 7;
    const startWeek = startToday - dow * day;
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const limit = Date.now() - HISTORY_RETENTION_DAYS * day;
    const out: { key: string; label: string; docs: PubDocument[] }[] = [];
    const push = (key: string, label: string, d: PubDocument) => {
      let g = out.find((x) => x.key === key);
      if (!g) out.push((g = { key, label, docs: [] }));
      g.docs.push(d);
    };
    for (const d of p.docs) {
      const ts = new Date(d.updatedAt).getTime();
      if (ts < limit) continue;
      if (ts >= startToday) push('today', t('hist.today'), d);
      else if (ts >= startToday - day) push('yesterday', t('hist.yesterday'), d);
      else if (ts >= startWeek) push('week', t('hist.thisWeek'), d);
      else if (ts >= startMonth) push('month', t('hist.thisMonth'), d);
      else {
        const dt = new Date(ts);
        const label = dt.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
        push(`m-${dt.getFullYear()}-${dt.getMonth()}`, label.charAt(0).toUpperCase() + label.slice(1), d);
      }
    }
    return out;
  }, [p.docs, t, locale]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-brand-900">{t('hist.title')}</h2>
        <p className="text-sm text-slate-500">{t('hist.sub')}</p>
        <p className="text-xs text-slate-400 mt-1">{t('hist.retention')}</p>
      </div>
      {groups.length === 0 && <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-500 text-sm">{t('hist.empty')}</div>}
      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand-700 flex items-center gap-2">
            <Clock className="w-4 h-4" /> {g.label}
            <span className="text-slate-400 font-medium normal-case tracking-normal">({g.docs.length})</span>
          </h3>
          <DocList {...p} docs={g.docs} />
          <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
            {g.docs
              .filter((d) => counts[d.id])
              .map((d) => (
                <span key={d.id}>
                  {d.title}: {t('hist.versionCount', { n: counts[d.id] })}
                </span>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
