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
  ShieldCheck
} from 'lucide-react';
import { useI18n } from '../i18n';
import { AppLogo, LanguageSwitcher, NQLogo } from '../components/Brand';
import { NewDocModal, VersionsModal } from '../components/Modals';
import { PagePreview } from '../editor/ElementView';
import type { DocVersion, Folder, Orientation, PageSizePreset, PubDocument } from '../core/model';
import { getLastBackupAt, listVersions, HISTORY_RETENTION_DAYS } from '../core/db';
import type { TemplateGroup, TemplateInfo } from '../templates';
import { APP_AUTHOR, APP_COMPANY, APP_VERSION } from '../meta';

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
  updateDocMeta: (id: string, patch: Partial<PubDocument>) => void;
  duplicateDoc: (d: PubDocument) => void;
  deleteDoc: (d: PubDocument) => void;
  createFolder: (name: string, parentId: string | null) => void;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  importFile: () => void;
  exportBackup: () => void;
  importBackup: () => void;
  restoreVersion: (v: DocVersion) => void;
  openHelp: () => void;
  openAbout: () => void;
}

const BACKUP_SNOOZE_KEY = 'op.backupSnoozeUntil';
const BACKUP_EVERY_DAYS = 7;

export function Hub(p: HubProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [newDocFor, setNewDocFor] = useState<{ folderId: string | null } | null>(null);
  const [versionsFor, setVersionsFor] = useState<PubDocument | null>(null);
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

  return (
    <div className="h-full flex bg-[#f4f8f8] text-slate-900">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-white border-e border-slate-200 flex flex-col">
        <div className="px-5 py-4 flex items-center gap-3 border-b border-slate-100">
          <AppLogo size={42} />
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
            <button
              key={f.id}
              onClick={() => {
                setLibFolder(f.id);
                p.setTab('library');
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-100 text-start"
            >
              <FolderIcon className="w-3.5 h-3.5 text-brand-600 fill-brand-100 shrink-0" />
              <span className="truncate">{f.name}</span>
            </button>
          ))}
        </div>

        <div className="border-t border-slate-100 p-4 flex items-center gap-3">
          <NQLogo size={34} />
          <div className="text-[11px] leading-tight text-slate-500 min-w-0">
            <div className="font-semibold text-brand-900 truncate">{APP_COMPANY}</div>
            <div className="truncate">
              {APP_AUTHOR} • v{APP_VERSION}
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white/80 backdrop-blur border-b border-slate-200 px-6 py-3 flex items-center gap-3">
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
          <button onClick={p.openHelp} className="hub-btn inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium">
            <HelpCircle className="w-4 h-4 text-brand-700" /> {t('common.help')}
          </button>
          <button onClick={p.openAbout} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium">
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
                <DocList {...p} docs={filtered} onVersions={setVersionsFor} />
              </section>
            ) : p.tab === 'home' ? (
              <HomeTab {...p} onNewDoc={() => setNewDocFor({ folderId: null })} onVersions={setVersionsFor} />
            ) : p.tab === 'library' ? (
              <LibraryTab
                {...p}
                folderId={libFolder}
                setFolderId={setLibFolder}
                onNewDoc={(folderId) => setNewDocFor({ folderId })}
                onVersions={setVersionsFor}
              />
            ) : (
              <HistoryTab {...p} onVersions={setVersionsFor} />
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
    </div>
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
      <button
        onClick={exportBackup}
        className="px-4 py-2 text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg inline-flex items-center gap-2"
      >
        <CloudDownload className="w-4 h-4" /> {t('bk.now')}
      </button>
    </div>
  );
}

function HomeTab(p: HubProps & { onNewDoc: () => void; onVersions: (d: PubDocument) => void }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<'all' | TemplateGroup>('all');
  const groups: ('all' | TemplateGroup)[] = ['all', 'class', 'parents', 'rewards', 'organisation'];
  const grpLabel: Record<string, string> = {
    all: t('grp.all'),
    class: t('grp.class'),
    parents: t('grp.parents'),
    rewards: t('grp.rewards'),
    organisation: t('grp.organisation')
  };
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
                {grpLabel[g]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {shown.map((tpl) => (
            <button
              key={tpl.key}
              onClick={() => p.createFromTemplate(tpl)}
              className="group text-start bg-white hover:shadow-md border border-slate-200 hover:border-brand-400 rounded-2xl p-3 transition flex flex-col"
            >
              <div className="h-44 rounded-xl bg-slate-100 flex items-center justify-center mb-3 overflow-hidden">
                <PagePreview doc={tpl.doc} pageIndex={0} width={tpl.doc.orientation === 'landscape' ? 180 : 120} />
              </div>
              <div className="font-semibold text-sm text-slate-900 group-hover:text-brand-700">{t(`tpl.${tpl.key}.title`)}</div>
              <div className="text-xs text-slate-500 mt-0.5 flex-1">{t(`tpl.${tpl.key}.desc`)}</div>
              <div className="text-[11px] text-slate-400 mt-2">
                {t('common.pages', { n: tpl.doc.pages.length })} • {tpl.doc.orientation === 'landscape' ? t('common.landscape') : t('common.portrait')}
              </div>
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">{t('tpl.contentNote')}</p>
      </section>

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
              <button key={d.id} onClick={() => p.openDoc(d)} className="group text-start">
                <div className="h-36 rounded-xl bg-slate-100 border border-slate-200 group-hover:border-brand-400 flex items-center justify-center overflow-hidden">
                  <PagePreview doc={d} pageIndex={0} width={d.orientation === 'landscape' ? 130 : 88} />
                </div>
                <div className="text-sm font-medium mt-1.5 truncate group-hover:text-brand-700">{d.title}</div>
              </button>
            ))}
          </div>
        )}
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
        <button
          onClick={exportBackup}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-xs font-semibold"
        >
          <CloudDownload className="w-4 h-4" /> {t('bk.export')}
        </button>
        <button
          onClick={importBackup}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold"
        >
          <CloudUpload className="w-4 h-4 text-brand-700" /> {t('bk.import')}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Library (folders / sub-folders / files)
// ---------------------------------------------------------------------------
function LibraryTab(
  p: HubProps & {
    folderId: string | null;
    setFolderId: (id: string | null) => void;
    onNewDoc: (folderId: string | null) => void;
    onVersions: (d: PubDocument) => void;
  }
) {
  const { t } = useI18n();
  const byId = new Map(p.folders.map((f) => [f.id, f]));
  // Fall back to root if the current folder was deleted.
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
  const newFolder = () => setNewName(t('lib.defaultFolder'));
  const submitFolder = () => {
    if (newName && newName.trim()) p.createFolder(newName.trim(), current);
    setNewName(null);
  };

  return (
    <div className="flex gap-6 items-start">
      <div className="w-60 shrink-0 bg-white border border-slate-200 rounded-2xl p-3 hidden md:block">
        <button
          onClick={() => p.setFolderId(null)}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-semibold ${
            current === null ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Library className="w-4 h-4" /> {t('lib.root')}
        </button>
        <FolderTree folders={p.folders} parentId={null} current={current} onPick={p.setFolderId} depth={0} />
      </div>

      <div className="flex-1 min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
              <button onClick={() => p.setFolderId(null)} className="hover:text-brand-700 font-medium">
                {t('lib.title')}
              </button>
              {path.map((f) => (
                <span key={f.id} className="inline-flex items-center gap-1">
                  <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
                  <button onClick={() => p.setFolderId(f.id)} className="hover:text-brand-700 font-medium">
                    {f.name}
                  </button>
                </span>
              ))}
            </div>
            <h2 className="text-xl font-bold text-brand-900">{path.length ? path[path.length - 1].name : t('lib.title')}</h2>
            {!current && <p className="text-sm text-slate-500">{t('lib.sub')}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={newFolder} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium">
              <FolderPlus className="w-4 h-4 text-brand-700" /> {current ? t('lib.newSubfolder') : t('lib.newFolder')}
            </button>
            <button
              onClick={() => p.onNewDoc(current)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold"
            >
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
            {sub.map((f) => {
              const nDocs = p.docs.filter((d) => d.folderId === f.id).length;
              const nSub = p.folders.filter((x) => x.parentId === f.id).length;
              return (
                <div
                  key={f.id}
                  className="group bg-white border border-slate-200 hover:border-brand-400 rounded-xl p-3 flex items-start gap-3 cursor-pointer"
                  onDoubleClick={() => p.setFolderId(f.id)}
                  onClick={() => p.setFolderId(f.id)}
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
            })}
          </div>
        )}

        {docsHere.length === 0 && sub.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-500 text-sm">{t('lib.empty')}</div>
        ) : (
          docsHere.length > 0 && <DocList {...p} docs={docsHere} onVersions={p.onVersions} />
        )}
      </div>
    </div>
  );
}

function FolderTree({
  folders,
  parentId,
  current,
  onPick,
  depth
}: {
  folders: Folder[];
  parentId: string | null;
  current: string | null;
  onPick: (id: string) => void;
  depth: number;
}) {
  const children = folders.filter((f) => (f.parentId ?? null) === parentId);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (depth > 12) return null;
  return (
    <ul>
      {children.map((f) => {
        const hasKids = folders.some((x) => x.parentId === f.id);
        const isOpen = open[f.id] ?? true;
        return (
          <li key={f.id}>
            <div
              className={`flex items-center gap-1 rounded-lg text-sm ${current === f.id ? 'bg-brand-50 text-brand-800 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}
              style={{ paddingInlineStart: 4 + depth * 14 }}
            >
              <button onClick={() => setOpen({ ...open, [f.id]: !isOpen })} className={`p-0.5 ${hasKids ? '' : 'invisible'}`}>
                {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />}
              </button>
              <button onClick={() => onPick(f.id)} className="flex-1 flex items-center gap-1.5 py-1.5 text-start min-w-0">
                <FolderIcon className="w-3.5 h-3.5 text-brand-600 fill-brand-100 shrink-0" />
                <span className="truncate">{f.name}</span>
              </button>
            </div>
            {hasKids && isOpen && <FolderTree folders={folders} parentId={f.id} current={current} onPick={onPick} depth={depth + 1} />}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Shared document list
// ---------------------------------------------------------------------------
function DocList(p: HubProps & { docs: PubDocument[]; onVersions: (d: PubDocument) => void }) {
  const { t, fmtDate } = useI18n();
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
        <div key={d.id} className="px-4 py-3 hover:bg-slate-50 flex flex-wrap items-center gap-3">
          <button onClick={() => p.openDoc(d)} className="flex items-center gap-3 min-w-0 flex-1 text-start">
            <div className="w-12 h-14 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
              {d.pages.length ? (
                <PagePreview doc={d} pageIndex={0} width={d.orientation === 'landscape' ? 44 : 32} />
              ) : (
                <FileText className="w-5 h-5 text-brand-600" />
              )}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm text-slate-900 truncate">{d.title}</div>
              <div className="text-xs text-slate-500">
                {t('common.pages', { n: d.pages.length })} • {d.orientation === 'landscape' ? t('common.landscape') : t('common.portrait')} •{' '}
                {t('common.modified', { d: fmtDate(d.updatedAt) })}
              </div>
            </div>
          </button>
          <div className="flex items-center gap-1">
            <IconBtn
              title={d.favorite ? t('lib.unfavorite') : t('lib.favorite')}
              onClick={() => p.updateDocMeta(d.id, { favorite: !d.favorite })}
            >
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
            <button
              onClick={() => p.openDoc(d)}
              className="ms-1 px-3 py-1.5 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-800 text-xs font-semibold"
            >
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
function HistoryTab(p: HubProps & { onVersions: (d: PubDocument) => void }) {
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
    const dow = (now.getDay() + 6) % 7; // Monday = 0
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
      {groups.length === 0 && (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-500 text-sm">{t('hist.empty')}</div>
      )}
      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand-700 flex items-center gap-2">
            <Clock className="w-4 h-4" /> {g.label}
            <span className="text-slate-400 font-medium normal-case tracking-normal">({g.docs.length})</span>
          </h3>
          <DocList {...p} docs={g.docs} onVersions={p.onVersions} />
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
