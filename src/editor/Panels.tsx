import {
  X,
  Link2,
  ImagePlus,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  PanelRightClose,
  PanelRightOpen,
  SlidersHorizontal,
  History,
  Layers,
  CircleDot,
  Undo2
} from 'lucide-react';
import { useI18n } from '../i18n';
import type { CanvasElementData, PageData, PageSizePreset, PubDocument } from '../core/model';
import { PAGE_PRESETS } from '../core/model';
import { pageOfElement, type FrameFlow } from '../core/textflow';
import type { AlignOp } from './geometry';
import type { HistoryStore } from './history';
import { BG_SWATCHES, toHex } from './ui';

export type PanelTab = 'props' | 'history';
export type PatchFn = (p: Partial<CanvasElementData>, label: string, key?: string) => void;

export function SidePanel({
  collapsed,
  setCollapsed,
  tab,
  setTab,
  children,
  history
}: {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  tab: PanelTab;
  setTab: (t: PanelTab) => void;
  children: React.ReactNode;
  history: React.ReactNode;
}) {
  const { t } = useI18n();
  if (collapsed) {
    return (
      <aside className="w-10 bg-white border-s border-slate-200 shrink-0 flex flex-col items-center py-2 gap-1">
        <button onClick={() => setCollapsed(false)} title={t('panel.expand')} className="p-1.5 rounded-lg text-slate-500 hover:bg-brand-50 hover:text-brand-800">
          <PanelRightOpen className="w-4 h-4 rtl:-scale-x-100" />
        </button>
        <button
          onClick={() => {
            setTab('props');
            setCollapsed(false);
          }}
          title={t('panel.props')}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-brand-50 hover:text-brand-800"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setTab('history');
            setCollapsed(false);
          }}
          title={t('panel.history')}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-brand-50 hover:text-brand-800"
        >
          <History className="w-4 h-4" />
        </button>
      </aside>
    );
  }
  return (
    <aside className="w-64 bg-white border-s border-slate-200 shrink-0 flex flex-col min-h-0">
      <div className="flex items-center border-b border-slate-200 px-1.5 pt-1.5">
        {(
          [
            ['props', t('panel.props'), SlidersHorizontal],
            ['history', t('panel.history'), History]
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-semibold border-b-2 ${
              tab === id ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
        <button onClick={() => setCollapsed(true)} title={t('panel.collapse')} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <PanelRightClose className="w-4 h-4 rtl:-scale-x-100" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto op-scroll p-4">{tab === 'props' ? children : history}</div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
export function HistoryPanel({ history, onJump }: { history: HistoryStore; onJump: (index: number) => void }) {
  const { t } = useI18n();
  const { past, future } = history;
  const all = [...past, ...future];
  const row = (label: string, idx: number, state: 'done' | 'current' | 'undone', at?: number) => (
    <button
      key={idx}
      onClick={() => onJump(idx)}
      title={t('hist.jump')}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-start text-xs ${
        state === 'current' ? 'bg-brand-700 text-white' : state === 'undone' ? 'text-slate-400 hover:bg-slate-50 italic' : 'text-slate-700 hover:bg-brand-50'
      }`}
    >
      {state === 'current' ? <CircleDot className="w-3.5 h-3.5 shrink-0" /> : <span className="w-3.5 h-3.5 shrink-0 rounded-full border border-current opacity-50" />}
      <span className="flex-1 truncate">{label}</span>
      {at && <span className={`text-[10px] ${state === 'current' ? 'text-brand-100' : 'text-slate-400'}`}>{fmtTime(at)}</span>}
    </button>
  );
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500 leading-relaxed">{t('hist.panelHint')}</p>
      <div className="space-y-0.5">
        {row(t('hist.initial'), -1, past.length === 0 ? 'current' : 'done')}
        {all.map((e, i) => row(e.label, i, i < past.length - 1 ? 'done' : i === past.length - 1 ? 'current' : 'undone', e.at))}
      </div>
      {all.length === 0 && <p className="text-xs text-slate-400 italic">{t('hist.panelEmpty')}</p>}
      <p className="text-[10px] text-slate-400 flex items-center gap-1 pt-2">
        <Undo2 className="w-3 h-3" /> {t('hist.count', { n: past.length, m: future.length })}
      </p>
    </div>
  );
}

function fmtTime(at: number) {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
export function PagePanel({
  doc,
  page,
  pageIndex,
  editingMaster,
  setDocField,
  patchPage,
  toggleMaster
}: {
  doc: PubDocument;
  page: PageData;
  pageIndex: number;
  editingMaster: boolean;
  setDocField: (p: Partial<PubDocument>, label: string, key?: string) => void;
  patchPage: (p: Partial<PageData>, label: string, key?: string) => void;
  toggleMaster: () => void;
}) {
  const { t } = useI18n();
  const field = 'w-full mt-0.5 px-2 py-1 text-xs border border-slate-300 rounded';
  return (
    <div className="space-y-4 text-xs">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-brand-700">{editingMaster ? t('pg.master') : t('pg.pageN', { n: pageIndex + 1 })}</div>
        <div className="text-slate-400">{t('panel.noSelection')}</div>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-slate-600">{t('pg.size')}</div>
        <select
          value={doc.pageSize}
          onChange={(e) => {
            const v = e.target.value as PageSizePreset;
            if (v === 'Custom') setDocField({ pageSize: v }, t('act.pageSize'));
            else setDocField({ pageSize: v, widthMm: PAGE_PRESETS[v][0], heightMm: PAGE_PRESETS[v][1] }, t('act.pageSize'));
          }}
          className={field}
        >
          <option value="A4">A4 (210 × 297 mm)</option>
          <option value="A5">A5 (148 × 210 mm)</option>
          <option value="A3">A3 (297 × 420 mm)</option>
          <option value="Letter">Letter (216 × 279 mm)</option>
          <option value="Custom">{t('pg.custom')}</option>
        </select>
        {doc.pageSize === 'Custom' && (
          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500">
            <label>
              {t('insp.width')} (mm)
              <input type="number" value={doc.widthMm} onChange={(e) => setDocField({ widthMm: Math.max(50, Number(e.target.value)) }, t('act.pageSize'), 'pw')} className={field} />
            </label>
            <label>
              {t('insp.height')} (mm)
              <input type="number" value={doc.heightMm} onChange={(e) => setDocField({ heightMm: Math.max(50, Number(e.target.value)) }, t('act.pageSize'), 'ph')} className={field} />
            </label>
          </div>
        )}
        <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
          {(['portrait', 'landscape'] as const).map((o) => (
            <button
              key={o}
              onClick={() => doc.orientation !== o && setDocField({ orientation: o }, t('act.orientation'))}
              className={`flex-1 px-2 py-1 rounded-md ${doc.orientation === o ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              {o === 'portrait' ? t('common.portrait') : t('common.landscape')}
            </button>
          ))}
        </div>
        <label className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
          {t('pg.margins')}
          <input
            type="number"
            min={0}
            max={60}
            value={doc.marginMm}
            onChange={(e) => setDocField({ marginMm: Math.max(0, Number(e.target.value)) }, t('act.margins'), 'margin')}
            className="w-16 px-2 py-1 border border-slate-300 rounded"
          />
        </label>
      </div>

      {!editingMaster && (
        <div className="space-y-2 pt-3 border-t border-slate-200">
          <div className="text-[11px] font-semibold text-slate-600">{t('pg.background')}</div>
          <div className="grid grid-cols-5 gap-1.5">
            {BG_SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => patchPage({ background: c }, t('act.pageBg'))}
                className={`h-6 rounded border ${page.background === c ? 'ring-2 ring-brand-500' : 'border-slate-300'}`}
                style={{ background: c }}
              />
            ))}
            <input
              type="color"
              value={toHex(page.background || '#ffffff')}
              onChange={(e) => patchPage({ background: e.target.value }, t('act.pageBg'), 'pagebg')}
              className="h-6 w-full rounded cursor-pointer"
            />
          </div>
        </div>
      )}

      <div className="space-y-2 pt-3 border-t border-slate-200">
        <div className="text-[11px] font-semibold text-slate-600">{t('pg.master')}</div>
        <button
          onClick={toggleMaster}
          className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-semibold ${
            editingMaster ? 'bg-amber-100 text-amber-900' : 'bg-brand-50 text-brand-800 hover:bg-brand-100'
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> {editingMaster ? t('pg.exitMaster') : t('pg.editMaster')}
        </button>
        {!editingMaster && (
          <label className="flex items-center gap-2 text-slate-600">
            <input type="checkbox" checked={!!page.hideMaster} onChange={(e) => patchPage({ hideMaster: e.target.checked }, t('act.master'))} />
            {t('pg.hideMaster')}
          </label>
        )}
        <label className="flex items-center gap-2 text-slate-600">
          <input type="checkbox" checked={!!doc.printMarks} onChange={(e) => setDocField({ printMarks: e.target.checked }, t('act.marks'))} />
          {t('vw.marks')}
        </label>
      </div>

      <div className="rounded-lg bg-brand-50 border border-brand-100 p-3 text-brand-900 leading-relaxed space-y-1.5">
        <p>• {t('help.k9')}</p>
        <p>• {t('help.k7')}</p>
        <p>• {t('help.k3')}</p>
        <p>• {t('help.k10')}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function MultiPanel({
  els,
  align,
  patch
}: {
  els: CanvasElementData[];
  align: (op: AlignOp) => void;
  patch: PatchFn;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="text-xs font-bold text-brand-900">{t('insp.multi', { n: els.length })}</div>
      <div className="grid grid-cols-4 gap-1">
        {(
          [
            ['left', AlignStartVertical, 'ar.alignLeft'],
            ['hcenter', AlignCenterVertical, 'ar.alignHCenter'],
            ['right', AlignEndVertical, 'ar.alignRight'],
            ['distH', AlignHorizontalSpaceAround, 'ar.distH'],
            ['top', AlignStartHorizontal, 'ar.alignTop'],
            ['vcenter', AlignCenterHorizontal, 'ar.alignVCenter'],
            ['bottom', AlignEndHorizontal, 'ar.alignBottom'],
            ['distV', AlignVerticalSpaceAround, 'ar.distV']
          ] as const
        ).map(([op, Icon, k]) => (
          <button
            key={op}
            title={t(k)}
            disabled={(op === 'distH' || op === 'distV') && els.length < 3}
            onClick={() => align(op)}
            className="p-2 rounded-lg border border-slate-200 hover:bg-brand-50 text-brand-800 disabled:opacity-30 flex justify-center"
          >
            <Icon className="w-4 h-4" />
          </button>
        ))}
      </div>
      <label className="block text-[11px] text-slate-500">
        {t('insp.opacity')}
        <input type="range" min={0.1} max={1} step={0.05} value={els[0].opacity ?? 1} onChange={(e) => patch({ opacity: Number(e.target.value) }, t('act.opacity'), 'op')} className="w-full" />
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function ElementPanel({
  doc,
  el,
  flow,
  patch,
  onReplaceImage,
  onDeselect
}: {
  doc: PubDocument;
  el: CanvasElementData;
  flow?: FrameFlow;
  patch: PatchFn;
  onReplaceImage: () => void;
  onDeselect: () => void;
}) {
  const { t } = useI18n();
  const num = 'w-full mt-0.5 px-2 py-1 text-xs border border-slate-300 rounded';
  const isContinuation = el.type === 'text' && flow && flow.chainIndex > 0;
  const nextPage = el.nextFrameId ? pageOfElement(doc, el.nextFrameId) : null;
  const geo = t('act.geometry');
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-brand-700">{t('insp.title')}</div>
          <div className="text-xs font-bold text-slate-900">{t(`kind.${el.type}`)}</div>
        </div>
        <button onClick={onDeselect} title="Esc" className="text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-slate-600">{t('insp.position')}</div>
        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500">
          <label>
            X
            <input type="number" value={Math.round(el.x)} onChange={(e) => patch({ x: Number(e.target.value) }, geo, 'x')} className={num} />
          </label>
          <label>
            Y
            <input type="number" value={Math.round(el.y)} onChange={(e) => patch({ y: Number(e.target.value) }, geo, 'y')} className={num} />
          </label>
          <label>
            {t('insp.width')}
            <input type="number" value={Math.round(el.width)} onChange={(e) => patch({ width: Math.max(8, Number(e.target.value)) }, geo, 'w')} className={num} />
          </label>
          <label>
            {t('insp.height')}
            <input type="number" value={Math.round(el.height)} onChange={(e) => patch({ height: Math.max(8, Number(e.target.value)) }, geo, 'h')} className={num} />
          </label>
          <label className="col-span-2">
            {t('insp.rotation')}
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={359} value={Math.round(el.rotation || 0)} onChange={(e) => patch({ rotation: Number(e.target.value) }, t('act.rotate'), 'rot')} className="flex-1" />
              <input
                type="number"
                value={Math.round(el.rotation || 0)}
                onChange={(e) => patch({ rotation: ((Number(e.target.value) % 360) + 360) % 360 }, t('act.rotate'), 'rot')}
                className="w-14 px-1.5 py-1 text-xs border border-slate-300 rounded"
              />
            </div>
          </label>
        </div>
      </div>

      {el.type !== 'image' && el.type !== 'border' && el.shapeVariant !== 'line' && (
        <div className="flex items-center justify-between text-[11px] text-slate-600 pt-2 border-t border-slate-200">
          {t('rb.fill')}
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={toHex(el.fillColor && el.fillColor !== 'transparent' ? el.fillColor : '#ffffff')}
              onChange={(e) => patch({ fillColor: e.target.value }, t('act.fill'), 'fill')}
              className="w-8 h-8 rounded border border-slate-300"
            />
            <button onClick={() => patch({ fillColor: 'transparent' }, t('act.fill'))} className="px-1.5 py-1 rounded border border-slate-200 text-[10px]">
              ∅
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2 pt-2 border-t border-slate-200">
        <div className="text-[11px] font-semibold text-slate-600">{t('insp.stroke')}</div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={toHex(el.strokeColor && el.strokeColor !== 'transparent' ? el.strokeColor : '#127a80')}
            onChange={(e) => patch({ strokeColor: e.target.value, strokeWidth: el.strokeWidth || 1 }, t('act.stroke'), 'stroke')}
            className="w-8 h-8 rounded border border-slate-300"
          />
          <input
            type="number"
            min={0}
            max={30}
            value={el.strokeWidth ?? 0}
            onChange={(e) => patch({ strokeWidth: Math.max(0, Number(e.target.value)) }, t('act.stroke'), 'sw')}
            className="w-16 px-2 py-1 text-xs border border-slate-300 rounded"
          />
          <span className="text-xs text-slate-400">px</span>
        </div>
        {el.type === 'shape' && el.shapeVariant === 'rectangle' && (
          <label className="block text-[11px] text-slate-500">
            {t('insp.radius')}
            <input type="range" min={0} max={100} value={el.borderRadius || 0} onChange={(e) => patch({ borderRadius: Number(e.target.value) }, t('act.radius'), 'rad')} className="w-full" />
          </label>
        )}
        <label className="block text-[11px] text-slate-500">
          {t('insp.opacity')}
          <input type="range" min={0.1} max={1} step={0.05} value={el.opacity ?? 1} onChange={(e) => patch({ opacity: Number(e.target.value) }, t('act.opacity'), 'op')} className="w-full" />
        </label>
      </div>

      {el.type === 'text' && (
        <div className="space-y-2 pt-2 border-t border-slate-200">
          <div className="text-[11px] font-semibold text-slate-600">{t('insp.textContent')}</div>
          {isContinuation ? (
            <p className="text-[11px] text-brand-800 bg-brand-50 rounded p-2">{t('insp.storyHint')}</p>
          ) : (
            <textarea
              rows={6}
              dir="auto"
              value={el.text || ''}
              onChange={(e) => patch({ text: e.target.value }, t('act.typing'), `type:${el.id}`)}
              className="w-full p-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          )}
          {flow?.overflow && <p className="text-[11px] text-rose-700 bg-rose-50 rounded p-2">{t('insp.overflow')}</p>}
          {el.nextFrameId && nextPage !== null && (
            <p className="text-[11px] text-brand-800 flex items-center gap-1">
              <Link2 className="w-3 h-3" /> {t('insp.linkedTo', { p: nextPage + 1 })}
            </p>
          )}
          {isContinuation && (
            <p className="text-[11px] text-brand-800 flex items-center gap-1">
              <Link2 className="w-3 h-3" /> {t('insp.linkedFrom')}
            </p>
          )}
        </div>
      )}

      {el.type === 'image' && (
        <button onClick={onReplaceImage} className="w-full px-3 py-2 text-xs font-semibold rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-800 inline-flex items-center justify-center gap-1.5">
          <ImagePlus className="w-4 h-4" /> {t('insp.replaceImage')}
        </button>
      )}

      {el.type === 'table' && el.tableData && (
        <div className="space-y-2 pt-2 border-t border-slate-200">
          <div className="text-[11px] font-semibold text-slate-600">{t('insp.table', { r: el.tableData.length, c: el.tableData[0]?.length || 1 })}</div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <button
              onClick={() => patch({ tableData: [...el.tableData!, Array(el.tableData![0]?.length || 1).fill('')] }, t('act.table'))}
              className="px-2 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-800 rounded"
            >
              {t('insp.addRow')}
            </button>
            <button
              disabled={el.tableData.length <= 1}
              onClick={() => patch({ tableData: el.tableData!.slice(0, -1) }, t('act.table'))}
              className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 rounded disabled:opacity-40"
            >
              {t('insp.delRow')}
            </button>
            <button onClick={() => patch({ tableData: el.tableData!.map((r) => [...r, '']) }, t('act.table'))} className="px-2 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-800 rounded">
              {t('insp.addCol')}
            </button>
            <button
              disabled={(el.tableData[0]?.length || 1) <= 1}
              onClick={() => patch({ tableData: el.tableData!.map((r) => r.slice(0, -1)) }, t('act.table'))}
              className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 rounded disabled:opacity-40"
            >
              {t('insp.delCol')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
