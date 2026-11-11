import { useEffect, useState } from 'react';
import {
  X,
  LayoutTemplate,
  Type,
  Move,
  AlignHorizontalJustifyCenter,
  Link2,
  Layers,
  Printer,
  Save,
  Keyboard,
  History,
  RotateCcw,
  Plus
} from 'lucide-react';
import { useI18n } from '../i18n';
import type { DocVersion, Orientation, PageSizePreset, PubDocument, PubImportReport } from '../core/model';
import { PAGE_PRESETS } from '../core/model';
import { addVersion, listVersions } from '../core/db';

export function Modal({
  title,
  onClose,
  children,
  wide = false,
  footer
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  footer?: React.ReactNode;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div data-modal-open className="fixed inset-0 z-[100] bg-slate-900/50 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div
        className={`bg-white rounded-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] flex flex-col shadow-xl border border-slate-200`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-100">
          <h3 className="font-bold text-lg text-brand-900">{title}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700" aria-label={t('common.close')}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-4 overflow-y-auto op-scroll space-y-4">{children}</div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          {footer ?? (
            <button onClick={onClose} className="px-4 py-2 text-sm font-semibold bg-brand-700 hover:bg-brand-800 text-white rounded-lg">
              {t('common.close')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function HelpModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const steps = [
    { icon: LayoutTemplate, k: 's1' },
    { icon: Type, k: 's2' },
    { icon: Move, k: 's3' },
    { icon: AlignHorizontalJustifyCenter, k: 's4' },
    { icon: Link2, k: 's5' },
    { icon: Layers, k: 's6' },
    { icon: Printer, k: 's7' },
    { icon: Save, k: 's8' }
  ];
  return (
    <Modal title={t('help.title')} onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        {steps.map((s) => (
          <div key={s.k} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
              <s.icon className="w-4 h-4 text-brand-700 shrink-0" /> {t(`help.${s.k}t`)}
            </div>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">{t(`help.${s.k}d`)}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
        <div className="flex items-center gap-2 font-semibold text-brand-900 text-sm mb-2">
          <Keyboard className="w-4 h-4" /> {t('help.kbd')}
        </div>
        <ul className="text-sm text-brand-900/90 grid sm:grid-cols-2 gap-y-1 gap-x-4" dir="auto">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
            <li key={i}>• {t(`help.k${i}`)}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t('help.pub')}</div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
export function ImportReportModal({ report, onClose }: { report: PubImportReport; onClose: () => void }) {
  const { t } = useI18n();
  const st = report.stats;
  const size = report.detectedPageSize;
  const item = 'flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-50 text-sm';
  return (
    <Modal
      title={t('imp.title')}
      onClose={onClose}
      footer={
        <button onClick={onClose} className="px-4 py-2 text-sm font-semibold bg-brand-700 hover:bg-brand-800 text-white rounded-lg">
          {t('imp.ok')}
        </button>
      }
    >
      {st ? (
        <>
          <p className="text-sm text-slate-700">{t('imp.pubText', { f: report.fileName })}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className={item}>
              <span>{t('imp.pages')}</span>
              <b>{st.pages}</b>
            </div>
            <div className={item}>
              <span>{t('imp.format')}</span>
              <b>
                {size.preset === 'Custom' ? `${size.widthMm} × ${size.heightMm} mm` : size.preset} · {t(`common.${size.orientation}`)}
              </b>
            </div>
            <div className={item}>
              <span>{t('imp.frames')}</span>
              <b>{st.textFrames}</b>
            </div>
            <div className={item}>
              <span>{t('imp.tables')}</span>
              <b>{st.tables}</b>
            </div>
            <div className={item}>
              <span>{t('imp.pictures')}</span>
              <b>{st.pictures}</b>
            </div>
            <div className={item}>
              <span>{t('imp.master')}</span>
              <b>{st.masterElements ? t('imp.yes') : t('imp.no')}</b>
            </div>
          </div>
          {!!report.missingFonts?.length && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {t('imp.fonts', { f: report.missingFonts.join(', ') })}
            </div>
          )}
          {!!st.unsupportedPictures && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t('imp.metafiles', { n: st.unsupportedPictures })}</div>
          )}
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">{t('imp.check')}</div>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-700">
            {t('imp.text', { f: report.fileName, t: report.extractedTextBlocks.length, i: report.extractedImagesCount })}
          </p>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t('imp.warn')}</div>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
export function NewDocModal({
  onCreate,
  onClose
}: {
  onCreate: (title: string, preset: PageSizePreset, w: number, h: number, o: Orientation) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(t('common.newDoc'));
  const [preset, setPreset] = useState<PageSizePreset>('A4');
  const [w, setW] = useState(210);
  const [h, setH] = useState(297);
  const [o, setO] = useState<Orientation>('portrait');
  const field = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500';
  return (
    <Modal
      title={t('hub.newDocTitle')}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">
            {t('common.cancel')}
          </button>
          <button
            onClick={() => onCreate(title, preset, w, h, o)}
            className="px-4 py-2 text-sm font-semibold bg-brand-700 hover:bg-brand-800 text-white rounded-lg"
          >
            {t('common.create')}
          </button>
        </>
      }
    >
      <label className="block text-xs font-semibold text-slate-700">
        {t('hub.title')}
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={`${field} mt-1`} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-slate-700">
          {t('hub.format')}
          <select
            value={preset}
            onChange={(e) => {
              const v = e.target.value as PageSizePreset;
              setPreset(v);
              if (v !== 'Custom') {
                setW(PAGE_PRESETS[v][0]);
                setH(PAGE_PRESETS[v][1]);
              }
            }}
            className={`${field} mt-1`}
          >
            <option value="A4">A4 (210 × 297 mm)</option>
            <option value="A5">A5 (148 × 210 mm)</option>
            <option value="A3">A3 (297 × 420 mm)</option>
            <option value="Letter">Letter (216 × 279 mm)</option>
            <option value="Custom">{t('hub.custom')}</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-700">
          {t('hub.orientation')}
          <select value={o} onChange={(e) => setO(e.target.value as Orientation)} className={`${field} mt-1`}>
            <option value="portrait">{t('common.portrait')}</option>
            <option value="landscape">{t('common.landscape')}</option>
          </select>
        </label>
      </div>
      {preset === 'Custom' && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-slate-700">
            {t('hub.width')}
            <input type="number" min={50} max={1000} value={w} onChange={(e) => setW(Number(e.target.value))} className={`${field} mt-1`} />
          </label>
          <label className="block text-xs font-semibold text-slate-700">
            {t('hub.height')}
            <input type="number" min={50} max={1000} value={h} onChange={(e) => setH(Number(e.target.value))} className={`${field} mt-1`} />
          </label>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
export function VersionsModal({
  doc,
  onRestore,
  onClose
}: {
  doc: PubDocument;
  onRestore: (v: DocVersion) => void;
  onClose: () => void;
}) {
  const { t, fmtDate } = useI18n();
  const [versions, setVersions] = useState<DocVersion[] | null>(null);
  const reload = () => listVersions(doc.id).then(setVersions);
  useEffect(() => {
    listVersions(doc.id).then(setVersions);
  }, [doc.id]);
  return (
    <Modal
      title={t('hist.versionsOf', { t: doc.title })}
      onClose={onClose}
      footer={
        <>
          <button
            onClick={async () => {
              await addVersion(doc, 'manual');
              reload();
            }}
            className="px-4 py-2 text-sm font-semibold text-brand-800 bg-brand-50 hover:bg-brand-100 rounded-lg inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> {t('hist.snapshot')}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold bg-brand-700 hover:bg-brand-800 text-white rounded-lg">
            {t('common.close')}
          </button>
        </>
      }
    >
      <p className="text-xs text-slate-500 flex items-center gap-1.5">
        <History className="w-3.5 h-3.5" /> {t('hist.retention')}
      </p>
      {versions && versions.length === 0 && <p className="text-sm text-slate-500">{t('hist.noVersions')}</p>}
      <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
        {versions?.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900">{fmtDate(v.savedAt)}</div>
              <div className="text-xs text-slate-500 truncate">
                {t(`hist.reason.${v.reason}`)} • {v.title} • {t('common.pages', { n: v.pageCount ?? v.doc?.pages.length ?? 0 })}
              </div>
            </div>
            <button
              onClick={() => {
                if (window.confirm(t('hist.restoreConfirm'))) onRestore(v);
              }}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-800 text-xs font-semibold inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" /> {t('hist.restore')}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
