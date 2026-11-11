import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  Undo2,
  Redo2,
  Check,
  Save,
  History,
  HelpCircle,
  Info,
  Download,
  Printer,
  Image as ImageIcon,
  Copy,
  Clipboard,
  CopyPlus,
  Scissors,
  Trash2,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  BringToFront,
  SendToBack,
  ArrowUp,
  ArrowDown,
  Type,
  ImagePlus,
  Square,
  Circle,
  Minus,
  Table,
  Hash,
  Frame,
  FolderOpen,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  RotateCcw,
  RotateCw,
  Link2,
  Unlink2,
  MousePointer2,
  Plus,
  ChevronUp,
  ChevronDown,
  Layers,
  EyeOff,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Ruler,
  Grid3x3,
  Magnet,
  Sparkles,
  PanelLeft,
  Crop,
  X,
  Eye,
  Pencil,
  SlidersHorizontal,
  Rows3,
  Columns3
} from 'lucide-react';
import { useI18n } from '../i18n';
import { AppLogo, LanguageSwitcher } from '../components/Brand';
import type { CanvasElementData, PageData, PageSizePreset, PubDocument } from '../core/model';
import { BLEED_MM, MARK_ZONE_MM, MM_TO_PX, PAGE_PRESETS, cloneDoc, elementBounds, getCanvasPixelDimensions, uid } from '../core/model';
import { computeDocumentFlows, findEl, unlinkReferences } from '../core/textflow';
import { exportPagePng, exportPrintPdf, pageNumberLabel } from '../core/render';
import { downloadBlob } from '../core/db';
import { ElementContent, PagePreview, elementStyle } from './ElementView';
import { alignElements, readImageFile, rectsIntersect, resizeElement, smartSnap, unionBounds, type AlignOp, type Box, type Handle } from './geometry';
import { COALESCE_MS, HISTORY_LIMIT, type HistoryStore } from './history';
import { ContextMenu, SEP, type MenuItem } from './ContextMenu';
import { EditableElement, FlowArrows, HRuler, PrintMarksOverlay, SelectionBox, VRuler } from './CanvasParts';
import { ElementPanel, HistoryPanel, MultiPanel, PagePanel, SidePanel, type PanelTab } from './Panels';
import { BG_SWATCHES, ColorPick, FONTS, Group, MiniBtn, RBtn, Sep, Toggle, TopIcon } from './ui';

export interface EditorProps {
  doc: PubDocument;
  history: HistoryStore;
  dirty: boolean;
  onChange: (doc: PubDocument) => void;
  onSave: () => void;
  onClose: () => void;
  onImportFile: () => void;
  onShowVersions: () => void;
  notify: (msg: string) => void;
  openHelp: () => void;
  openAbout: () => void;
}

type Tab = 'home' | 'insert' | 'arrange' | 'page' | 'view' | 'help';
/** false = no undo step; string = label; object = label + coalescing key. */
type Rec = false | string | { label: string; key?: string };

type DragState =
  | null
  | { mode: 'move'; startX: number; startY: number; orig: Map<string, CanvasElementData>; box: Box; recorded: boolean }
  | { mode: 'resize'; handle: Handle; startX: number; startY: number; orig: CanvasElementData; recorded: boolean }
  | { mode: 'rotate'; orig: CanvasElementData; recorded: boolean }
  | { mode: 'marquee'; startX: number; startY: number; additive: string[] };

type MenuState = null | { x: number; y: number; kind: 'element' | 'page'; at?: { x: number; y: number } };

const PANEL_KEY = 'op.panelCollapsed';

export function Editor(props: EditorProps) {
  const { doc, onChange, notify, history: H } = props;
  const { t } = useI18n();

  // ---------------------------------------------------------------- state
  const [tab, setTab] = useState<Tab>('home');
  const [pageIndex, setPageIndex] = useState(0);
  const [editingMaster, setEditingMaster] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<CanvasElementData[]>([]);
  const [zoom, setZoom] = useState(0.8);
  const [showRulers, setShowRulers] = useState(true);
  const [showMargins, setShowMargins] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [snap, setSnap] = useState(true);
  const [smart, setSmart] = useState(true);
  const [showThumbs, setShowThumbs] = useState(true);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>('props');
  const [panelCollapsed, setPanelCollapsedState] = useState(() => {
    try {
      return localStorage.getItem(PANEL_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [, setTick] = useState(0);
  const bump = () => setTick((x) => x + 1);

  const setPanelCollapsed = (v: boolean) => {
    setPanelCollapsedState(v);
    try {
      localStorage.setItem(PANEL_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const docRef = useRef(doc);
  docRef.current = doc;
  const dragRef = useRef<DragState>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const replaceImageRef = useRef<HTMLInputElement | null>(null);
  const insertAtRef = useRef<{ x: number; y: number } | null>(null);
  const nudgeKey = useRef('');

  const safePageIndex = Math.min(pageIndex, doc.pages.length - 1);
  const page: PageData = doc.pages[safePageIndex];
  const dims = getCanvasPixelDimensions(doc);
  const marginPx = doc.marginMm * MM_TO_PX;
  const pageLabelTpl = t('ed.pageLabel');
  const flows = useMemo(() => computeDocumentFlows(doc), [doc]);

  const layerEls: CanvasElementData[] = editingMaster ? doc.master?.elements ?? [] : page.elements;
  const selectedEls = layerEls.filter((e) => selected.includes(e.id));
  const single = selectedEls.length === 1 ? selectedEls[0] : null;

  // ---------------------------------------------------------------- undo / redo
  const record = useCallback(
    (label: string, key?: string) => {
      const now = Date.now();
      if (key && H.lastKey === key && now - H.lastAt < COALESCE_MS) {
        H.lastAt = now;
        return;
      }
      H.past.push({ doc: docRef.current, label, at: now });
      if (H.past.length > HISTORY_LIMIT) H.past.splice(0, H.past.length - HISTORY_LIMIT);
      H.future = [];
      H.lastKey = key || '';
      H.lastAt = now;
      bump();
    },
    [H]
  );

  const apply = useCallback(
    (d: PubDocument) => {
      const updated = { ...d, updatedAt: new Date().toISOString() };
      docRef.current = updated;
      onChange(updated);
    },
    [onChange]
  );

  const commit = useCallback(
    (next: PubDocument, rec: Rec) => {
      if (rec) {
        if (typeof rec === 'string') record(rec);
        else record(rec.label, rec.key);
      }
      apply(next);
    },
    [apply, record]
  );

  const undo = useCallback(() => {
    const e = H.past.pop();
    if (!e) return;
    H.future.unshift({ doc: docRef.current, label: e.label, at: e.at });
    H.lastKey = '';
    apply(e.doc);
    bump();
  }, [H, apply]);

  const redo = useCallback(() => {
    const e = H.future.shift();
    if (!e) return;
    H.past.push({ doc: docRef.current, label: e.label, at: e.at });
    H.lastKey = '';
    apply(e.doc);
    bump();
  }, [H, apply]);

  /** Jump to the state right after action `index` (-1 = initial state). */
  const jumpTo = (index: number) => {
    const target = index + 1; // number of actions that should remain applied
    while (H.past.length > target) undo();
    while (H.past.length < target && H.future.length) redo();
  };

  const rec = (label: string, key?: string): Rec => ({ label, key });

  /** Updates the element list of the layer being edited (page or master). */
  const setLayer = useCallback(
    (fn: (els: CanvasElementData[]) => CanvasElementData[], r: Rec) => {
      const d = docRef.current;
      if (editingMaster) commit({ ...d, master: { elements: fn(d.master?.elements ?? []) } }, r);
      else commit({ ...d, pages: d.pages.map((p, i) => (i === safePageIndex ? { ...p, elements: fn(p.elements) } : p)) }, r);
    },
    [commit, editingMaster, safePageIndex]
  );

  const patchEls = useCallback(
    (ids: string[], patch: Partial<CanvasElementData> | ((e: CanvasElementData) => Partial<CanvasElementData>), r: Rec) => {
      setLayer((els) => els.map((e) => (ids.includes(e.id) ? { ...e, ...(typeof patch === 'function' ? patch(e) : patch) } : e)), r);
    },
    [setLayer]
  );

  const patchSel = (patch: Partial<CanvasElementData>, label: string, key?: string) => patchEls(selected, patch, rec(label, key));

  const patchPage = (patch: Partial<PageData>, label: string, key?: string) => {
    const d = docRef.current;
    commit({ ...d, pages: d.pages.map((p, i) => (i === safePageIndex ? { ...p, ...patch } : p)) }, rec(label, key));
  };

  const setDocField = (patch: Partial<PubDocument>, label: string, key?: string) => commit({ ...docRef.current, ...patch }, rec(label, key));

  // Reset selection when switching page / layer.
  useEffect(() => {
    setSelected([]);
    setEditingTextId(null);
  }, [safePageIndex, editingMaster]);

  // ---------------------------------------------------------------- element ops
  const addElement = (partial: Omit<CanvasElementData, 'id' | 'zIndex' | 'x' | 'y'> & { x?: number; y?: number }, kindLabel: string) => {
    const maxZ = layerEls.reduce((a, e) => Math.max(a, e.zIndex), 0);
    const at = insertAtRef.current;
    insertAtRef.current = null;
    const el: CanvasElementData = {
      ...partial,
      x: partial.x ?? (at ? Math.round(at.x) : Math.round((dims.width - partial.width) / 2)),
      y: partial.y ?? (at ? Math.round(at.y) : Math.round((dims.height - partial.height) / 3)),
      id: uid(),
      zIndex: maxZ + 1
    };
    setLayer((els) => [...els, el], t('act.insert', { k: kindLabel }));
    setSelected([el.id]);
    return el;
  };

  const deleteSelection = useCallback(
    (label?: string) => {
      if (!selected.length) return;
      const ids = new Set(selected);
      const d = docRef.current;
      let next: PubDocument = editingMaster
        ? { ...d, master: { elements: (d.master?.elements ?? []).filter((e) => !ids.has(e.id)) } }
        : { ...d, pages: d.pages.map((p, i) => (i === safePageIndex ? { ...p, elements: p.elements.filter((e) => !ids.has(e.id)) } : p)) };
      next = unlinkReferences(next, ids);
      commit(next, label ?? t('act.delete'));
      setSelected([]);
      setEditingTextId(null);
      if (!label) notify(t('n.deleted'));
    },
    [commit, editingMaster, notify, safePageIndex, selected, t]
  );

  const copySelection = useCallback(() => {
    if (!selectedEls.length) return;
    setClipboard(cloneDoc(selectedEls));
    notify(t('n.copied'));
  }, [notify, selectedEls, t]);

  const cutSelection = useCallback(() => {
    if (!selectedEls.length) return;
    setClipboard(cloneDoc(selectedEls));
    deleteSelection(t('act.cut'));
  }, [deleteSelection, selectedEls, t]);

  /** Pastes `source` (or the clipboard). `at` = top-left position for the pasted group. */
  const pasteElements = useCallback(
    (source: CanvasElementData[] | undefined, label: string, at?: { x: number; y: number }) => {
      const src = source ?? clipboard;
      if (!src.length) return;
      const maxZ = layerEls.reduce((a, e) => Math.max(a, e.zIndex), 0);
      const box = unionBounds(src)!;
      const dx = at ? at.x - box.x : 16;
      const dy = at ? at.y - box.y : 16;
      const created = src.map((e, i) => ({ ...cloneDoc(e), id: uid(), x: Math.round(e.x + dx), y: Math.round(e.y + dy), zIndex: maxZ + 1 + i, nextFrameId: undefined }));
      setLayer((els) => [...els, ...created], label);
      setSelected(created.map((c) => c.id));
      if (!source) setClipboard(created);
    },
    [clipboard, layerEls, setLayer]
  );

  const reorder = (dir: 'front' | 'back' | 'forward' | 'backward') => {
    if (!selected.length) return;
    const sorted = [...layerEls].sort((a, b) => a.zIndex - b.zIndex);
    let order = sorted.map((e) => e.id);
    if (dir === 'front') order = [...order.filter((id) => !selected.includes(id)), ...order.filter((id) => selected.includes(id))];
    else if (dir === 'back') order = [...order.filter((id) => selected.includes(id)), ...order.filter((id) => !selected.includes(id))];
    else if (dir === 'forward') {
      for (let i = order.length - 2; i >= 0; i--)
        if (selected.includes(order[i]) && !selected.includes(order[i + 1])) [order[i], order[i + 1]] = [order[i + 1], order[i]];
    } else {
      for (let i = 1; i < order.length; i++)
        if (selected.includes(order[i]) && !selected.includes(order[i - 1])) [order[i], order[i - 1]] = [order[i - 1], order[i]];
    }
    const z = new Map(order.map((id, i) => [id, i + 1]));
    setLayer((els) => els.map((e) => ({ ...e, zIndex: z.get(e.id) ?? e.zIndex })), t('act.order'));
  };

  const align = (op: AlignOp, ids: string[] = selected) => {
    const els = layerEls.filter((e) => ids.includes(e.id));
    const map = alignElements(els, op, { w: dims.width, h: dims.height });
    if (map.size) patchEls([...map.keys()], (e) => map.get(e.id)!, op.startsWith('dist') ? t('act.distribute') : t('act.align'));
  };

  const rotateBy = (deg: number) => patchEls(selected, (e) => ({ rotation: ((((e.rotation || 0) + deg) % 360) + 360) % 360 }), t('act.rotate'));

  // ---------------------------------------------------------------- linked frames
  const tryLink = (fromId: string, toId: string) => {
    if (fromId === toId) return notify(t('ar.linkSame'));
    const d = docRef.current;
    let cur = findEl(d, toId);
    const seen = new Set<string>();
    while (cur?.nextFrameId && !seen.has(cur.id)) {
      if (cur.nextFrameId === fromId) return notify(t('ar.linkCycle'));
      seen.add(cur.id);
      cur = findEl(d, cur.nextFrameId);
    }
    const fix = (els: CanvasElementData[]) =>
      els.map((e) => (e.id === fromId ? { ...e, nextFrameId: toId } : e.nextFrameId === toId ? { ...e, nextFrameId: undefined } : e));
    commit(
      { ...d, pages: d.pages.map((p) => ({ ...p, elements: fix(p.elements) })), master: d.master ? { elements: fix(d.master.elements) } : d.master },
      t('act.link')
    );
    setLinkFrom(null);
    setSelected([toId]);
    notify(t('ar.linked'));
  };

  const startLink = () => {
    if (single?.type === 'text') {
      setLinkFrom(single.id);
      notify(t('ar.linkPick'));
    }
  };

  const unlink = () => {
    if (!single) return;
    patchEls([single.id], { nextFrameId: undefined }, t('act.unlink'));
    notify(t('ar.unlinked'));
  };

  // ---------------------------------------------------------------- pages
  const addPage = (after = safePageIndex) => {
    const d = docRef.current;
    const np: PageData = { id: uid('page'), name: '', background: '#ffffff', backgroundPattern: 'none', elements: [] };
    const pages = [...d.pages];
    pages.splice(after + 1, 0, np);
    commit({ ...d, pages }, t('act.pageAdd'));
    setPageIndex(after + 1);
    setEditingMaster(false);
    notify(t('n.pageAdded'));
  };

  const duplicatePage = (idx = safePageIndex) => {
    const d = docRef.current;
    const src = d.pages[idx];
    const idMap = new Map<string, string>();
    for (const e of src.elements) idMap.set(e.id, uid());
    const np: PageData = {
      ...cloneDoc(src),
      id: uid('page'),
      elements: src.elements.map((e) => ({ ...cloneDoc(e), id: idMap.get(e.id)!, nextFrameId: e.nextFrameId ? idMap.get(e.nextFrameId) : undefined }))
    };
    const pages = [...d.pages];
    pages.splice(idx + 1, 0, np);
    commit({ ...d, pages }, t('act.pageDup'));
    setPageIndex(idx + 1);
    notify(t('n.pageDup'));
  };

  const deletePage = (idx = safePageIndex) => {
    const d = docRef.current;
    if (d.pages.length <= 1) return notify(t('pg.lastPage'));
    const removed = new Set(d.pages[idx].elements.map((e) => e.id));
    const next = unlinkReferences({ ...d, pages: d.pages.filter((_, i) => i !== idx) }, removed);
    commit(next, t('act.pageDel'));
    setPageIndex(Math.max(0, Math.min(idx, next.pages.length - 1)));
    notify(t('n.pageDeleted'));
  };

  const movePage = (idx: number, dir: -1 | 1) => {
    const d = docRef.current;
    const j = idx + dir;
    if (j < 0 || j >= d.pages.length) return;
    const pages = [...d.pages];
    [pages[idx], pages[j]] = [pages[j], pages[idx]];
    commit({ ...d, pages }, t('act.pageMove'));
    setPageIndex(j);
  };

  // ---------------------------------------------------------------- inserts
  const insertText = () =>
    addElement(
      {
        type: 'text',
        width: 320,
        height: 110,
        text: t('ins.defaultText'),
        fontFamily: 'Inter, sans-serif',
        fontSize: 18,
        fontColor: '#0f172a',
        textAlign: 'left',
        fillColor: 'transparent',
        strokeColor: 'transparent',
        strokeWidth: 0
      },
      t('kind.text')
    );
  const insertRect = () =>
    addElement({ type: 'shape', shapeVariant: 'rectangle', width: 220, height: 130, fillColor: '#d0f4f4', strokeColor: '#127a80', strokeWidth: 2, borderRadius: 8 }, t('ins.rect'));
  const insertCircle = () =>
    addElement({ type: 'shape', shapeVariant: 'circle', width: 150, height: 150, fillColor: '#fef3c7', strokeColor: '#d97706', strokeWidth: 2 }, t('ins.circle'));
  const insertLine = () => addElement({ type: 'shape', shapeVariant: 'line', width: 400, height: 16, strokeColor: '#127a80', strokeWidth: 3 }, t('ins.line'));
  const insertTable = () =>
    addElement(
      {
        type: 'table',
        width: 480,
        height: 160,
        rows: 4,
        cols: 3,
        fontSize: 14,
        fontColor: '#0f172a',
        fillColor: '#ffffff',
        strokeColor: '#4cc3cc',
        strokeWidth: 1,
        tableData: [[t('ins.header'), t('ins.header'), t('ins.header')], ['', '', ''], ['', '', ''], ['', '', '']]
      },
      t('ins.table')
    );
  const insertPageNum = () =>
    addElement(
      { type: 'pagenum', width: 160, height: 30, y: insertAtRef.current ? undefined : dims.height - 56, fontFamily: 'Inter, sans-serif', fontSize: 12, fontColor: '#475569', textAlign: 'center' },
      t('ins.pagenum')
    );
  const insertBorder = () =>
    addElement(
      { type: 'border', x: 24, y: 24, width: dims.width - 48, height: dims.height - 48, strokeColor: '#127a80', strokeWidth: 3, borderPreset: 'double' },
      t('ins.border')
    );

  // ---------------------------------------------------------------- pointer handling
  const toPage = (clientX: number, clientY: number) => {
    const r = pageRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / zoom, y: (clientY - r.top) / zoom };
  };

  const startMove = (e: React.MouseEvent, ids: string[]) => {
    const orig = new Map(layerEls.filter((x) => ids.includes(x.id)).map((x) => [x.id, x]));
    dragRef.current = { mode: 'move', startX: e.clientX, startY: e.clientY, orig, box: unionBounds([...orig.values()]) ?? { x: 0, y: 0, w: 0, h: 0 }, recorded: false };
  };

  const onElementMouseDown = (e: React.MouseEvent, el: CanvasElementData) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (linkFrom) {
      if (el.type === 'text') tryLink(linkFrom, el.id);
      else notify(t('ar.linkSame'));
      return;
    }
    if (editingTextId === el.id) return;
    setEditingTextId(null);
    if (e.shiftKey) {
      const next = selected.includes(el.id) ? selected.filter((x) => x !== el.id) : [...selected, el.id];
      setSelected(next);
      if (next.includes(el.id)) startMove(e, next);
      return;
    }
    const ids = selected.includes(el.id) ? selected : [el.id];
    if (!selected.includes(el.id)) setSelected([el.id]);
    startMove(e, ids);
  };

  const onElementContextMenu = (e: React.MouseEvent, el: CanvasElementData) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selected.includes(el.id)) setSelected([el.id]);
    setEditingTextId(null);
    setLinkFrom(null);
    setMenu({ x: e.clientX, y: e.clientY, kind: 'element' });
  };

  const onPageContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setSelected([]);
    setEditingTextId(null);
    setLinkFrom(null);
    const p = pageRef.current ? toPage(e.clientX, e.clientY) : null;
    const inside = p && p.x >= 0 && p.y >= 0 && p.x <= dims.width && p.y <= dims.height;
    setMenu({ x: e.clientX, y: e.clientY, kind: 'page', at: inside ? p! : undefined });
  };

  const onPageMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (linkFrom) {
      setLinkFrom(null);
      return;
    }
    setEditingTextId(null);
    const p = toPage(e.clientX, e.clientY);
    dragRef.current = { mode: 'marquee', startX: p.x, startY: p.y, additive: e.shiftKey ? selected : [] };
    if (!e.shiftKey) setSelected([]);
  };

  const startResize = (e: React.MouseEvent, el: CanvasElementData, handle: Handle) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = { mode: 'resize', handle, startX: e.clientX, startY: e.clientY, orig: el, recorded: false };
  };

  const startRotate = (e: React.MouseEvent, el: CanvasElementData) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = { mode: 'rotate', orig: el, recorded: false };
  };

  useEffect(() => {
    const onMove = (ev: MouseEvent) => {
      const st = dragRef.current;
      if (!st || !pageRef.current) return;
      const grid = snap ? 8 : 1;
      if (st.mode === 'marquee') {
        const p = toPage(ev.clientX, ev.clientY);
        const box = { x: Math.min(st.startX, p.x), y: Math.min(st.startY, p.y), w: Math.abs(p.x - st.startX), h: Math.abs(p.y - st.startY) };
        setMarquee(box);
        if (box.w > 3 || box.h > 3) {
          const hits = layerEls.filter((x) => rectsIntersect(box, elementBounds(x))).map((x) => x.id);
          setSelected([...new Set([...st.additive, ...hits])]);
        }
        return;
      }
      if (!st.recorded) {
        // One undo step per drag gesture, recorded on the first real movement.
        record(st.mode === 'move' ? t('act.move') : st.mode === 'resize' ? t('act.resize') : t('act.rotate'));
        st.recorded = true;
      }
      if (st.mode === 'move') {
        let dx = (ev.clientX - st.startX) / zoom;
        let dy = (ev.clientY - st.startY) / zoom;
        if (ev.altKey) {
          setGuides({ x: [], y: [] });
        } else if (smart) {
          const others = layerEls.filter((x) => !st.orig.has(x.id));
          const res = smartSnap(st.box, dx, dy, others, { w: dims.width, h: dims.height, margin: marginPx }, 6 / zoom);
          dx = res.guidesX.length ? res.dx : Math.round((st.box.x + dx) / grid) * grid - st.box.x;
          dy = res.guidesY.length ? res.dy : Math.round((st.box.y + dy) / grid) * grid - st.box.y;
          setGuides({ x: res.guidesX, y: res.guidesY });
        } else {
          dx = Math.round((st.box.x + dx) / grid) * grid - st.box.x;
          dy = Math.round((st.box.y + dy) / grid) * grid - st.box.y;
        }
        patchEls([...st.orig.keys()], (x) => ({ x: Math.round(st.orig.get(x.id)!.x + dx), y: Math.round(st.orig.get(x.id)!.y + dy) }), false);
      } else if (st.mode === 'resize') {
        const dx = (ev.clientX - st.startX) / zoom;
        const dy = (ev.clientY - st.startY) / zoom;
        const keep = ev.shiftKey || st.orig.type === 'image';
        patchEls([st.orig.id], resizeElement(st.orig, st.handle, dx, dy, keep && st.handle.length === 2, grid), false);
      } else if (st.mode === 'rotate') {
        const p = toPage(ev.clientX, ev.clientY);
        const cx = st.orig.x + st.orig.width / 2;
        const cy = st.orig.y + st.orig.height / 2;
        let a = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
        a = ev.shiftKey ? Math.round(a / 15) * 15 : Math.round(a);
        a = ((a % 360) + 360) % 360;
        patchEls([st.orig.id], { rotation: a }, false);
      }
    };
    const onUp = () => {
      dragRef.current = null;
      setGuides({ x: [], y: [] });
      setMarquee(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  });

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 's') {
        // Works everywhere, even while typing.
        e.preventDefault();
        props.onSave();
        return;
      }
      const tg = e.target as HTMLElement | null;
      const tag = tg?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || tg?.isContentEditable) return;
      if (document.querySelector('[data-modal-open]')) return;
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && k === 'c') {
        if (selected.length) {
          e.preventDefault();
          copySelection();
        }
      } else if (mod && k === 'x') {
        if (selected.length) {
          e.preventDefault();
          cutSelection();
        }
      } else if (mod && k === 'v') {
        if (clipboard.length) {
          e.preventDefault();
          pasteElements(undefined, t('act.paste'));
          notify(t('n.pasted'));
        }
      } else if (mod && k === 'd') {
        e.preventDefault();
        if (selectedEls.length) pasteElements(selectedEls, t('act.duplicate'));
      } else if (mod && k === 'a') {
        e.preventDefault();
        setSelected(layerEls.map((x) => x.id));
      } else if (k === 'delete' || k === 'backspace') {
        if (selected.length) {
          e.preventDefault();
          deleteSelection();
        }
      } else if (k === 'escape') {
        setSelected([]);
        setLinkFrom(null);
        setEditingTextId(null);
      } else if (k === 'enter' && single?.type === 'text') {
        e.preventDefault();
        setEditingTextId(single.id);
      } else if (k.startsWith('arrow') && selected.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0;
        const dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
        // Each key press is one undo step; holding the key down is a single step.
        if (!e.repeat) nudgeKey.current = `nudge:${Date.now()}`;
        patchEls(selected, (x) => ({ x: x.x + dx, y: x.y + dy }), rec(t('act.nudge'), nudgeKey.current));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Ctrl + wheel zoom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => clampZoom(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const fitZoom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const extra = doc.printMarks ? 2 * (BLEED_MM + MARK_ZONE_MM) * MM_TO_PX : 0;
    const z = Math.min((el.clientWidth - 80) / (dims.width + extra), (el.clientHeight - 80) / (dims.height + extra));
    setZoom(clampZoom(z));
  }, [dims.width, dims.height, doc.printMarks]);

  useEffect(() => {
    fitZoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, doc.orientation, doc.widthMm, doc.heightMm]);

  // ---------------------------------------------------------------- exports
  const [busy, setBusy] = useState(false);
  const doPng = async () => {
    setBusy(true);
    try {
      const blob = await exportPagePng(docRef.current, safePageIndex, pageLabelTpl);
      downloadBlob(blob, `${safeName(doc.title)}_p${safePageIndex + 1}.png`, 'image/png');
      notify(t('n.pngDone'));
    } finally {
      setBusy(false);
    }
  };
  const doPdf = async () => {
    setBusy(true);
    try {
      await exportPrintPdf(docRef.current, { title: t('ed.exporting'), printBtn: t('ed.printBtn'), pageLabel: pageLabelTpl, popupBlocked: t('ed.popupBlocked') });
    } finally {
      setBusy(false);
    }
  };

  const onImagePicked = async (e: React.ChangeEvent<HTMLInputElement>, replaceId?: string) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const img = await readImageFile(file);
      if (replaceId) {
        patchEls([replaceId], { imageUrl: img.url }, t('act.image'));
      } else {
        const s = Math.min(1, 360 / Math.max(img.w, img.h));
        addElement({ type: 'image', width: Math.round(img.w * s), height: Math.round(img.h * s), imageUrl: img.url, strokeWidth: 0 }, t('kind.image'));
      }
    } catch {
      notify(t('n.importFail'));
    }
  };

  // ---------------------------------------------------------------- context menu
  const openProps = () => {
    setPanelTab('props');
    setPanelCollapsed(false);
  };

  const buildMenu = (): MenuItem[] => {
    if (!menu) return [];
    if (menu.kind === 'element' && selectedEls.length) {
      const multi = selectedEls.length > 1;
      const items: MenuItem[] = [
        { label: t('ctx.cut'), icon: Scissors, shortcut: 'Ctrl+X', onClick: cutSelection },
        { label: t('rb.copy'), icon: Copy, shortcut: 'Ctrl+C', onClick: copySelection },
        { label: t('rb.paste'), icon: Clipboard, shortcut: 'Ctrl+V', disabled: !clipboard.length, onClick: () => pasteElements(undefined, t('act.paste')) },
        { label: t('rb.duplicate'), icon: CopyPlus, shortcut: 'Ctrl+D', onClick: () => pasteElements(selectedEls, t('act.duplicate')) },
        { label: t('rb.delete'), icon: Trash2, shortcut: 'Suppr', danger: true, onClick: () => deleteSelection() },
        SEP
      ];
      if (single?.type === 'text') {
        const f = flows.get(single.id);
        items.push(
          { label: t('ctx.editText'), icon: Pencil, shortcut: 'Entrée', disabled: !!f && f.chainIndex > 0, onClick: () => setEditingTextId(single.id) },
          { label: t('ar.link'), icon: Link2, onClick: startLink },
          { label: t('ar.unlink'), icon: Unlink2, disabled: !single.nextFrameId, onClick: unlink },
          SEP
        );
      }
      if (single?.type === 'image') items.push({ label: t('insp.replaceImage'), icon: ImagePlus, onClick: () => replaceImageRef.current?.click() }, SEP);
      if (single?.type === 'table' && single.tableData) {
        const td = single.tableData;
        items.push(
          { label: t('insp.addRow'), icon: Rows3, onClick: () => patchEls([single.id], { tableData: [...td, Array(td[0]?.length || 1).fill('')] }, t('act.table')) },
          { label: t('insp.addCol'), icon: Columns3, onClick: () => patchEls([single.id], { tableData: td.map((r) => [...r, '']) }, t('act.table')) },
          SEP
        );
      }
      items.push(
        { kind: 'header', label: t('rb.order') },
        { label: t('rb.front'), icon: BringToFront, onClick: () => reorder('front') },
        { label: t('ctx.forward'), icon: ArrowUp, onClick: () => reorder('forward') },
        { label: t('ctx.backward'), icon: ArrowDown, onClick: () => reorder('backward') },
        { label: t('rb.back'), icon: SendToBack, onClick: () => reorder('back') },
        { kind: 'header', label: t('ar.rotate') },
        { label: t('ar.rotL'), icon: RotateCcw, onClick: () => rotateBy(-90) },
        { label: t('ar.rotR'), icon: RotateCw, onClick: () => rotateBy(90) },
        { label: t('ar.rotReset'), icon: RotateCcw, disabled: !selectedEls.some((e) => e.rotation), onClick: () => patchEls(selected, { rotation: 0 }, t('act.rotate')) },
        { kind: 'header', label: multi ? t('ar.align') : t('ctx.onPage') }
      );
      if (multi) {
        items.push(
          { label: t('ar.alignLeft'), icon: AlignStartVertical, onClick: () => align('left') },
          { label: t('ar.alignHCenter'), icon: AlignCenterVertical, onClick: () => align('hcenter') },
          { label: t('ar.alignRight'), icon: AlignEndVertical, onClick: () => align('right') },
          { label: t('ar.alignTop'), icon: AlignStartHorizontal, onClick: () => align('top') },
          { label: t('ar.alignVCenter'), icon: AlignCenterHorizontal, onClick: () => align('vcenter') },
          { label: t('ar.alignBottom'), icon: AlignEndHorizontal, onClick: () => align('bottom') },
          { label: t('ar.distH'), icon: AlignHorizontalSpaceAround, disabled: selectedEls.length < 3, onClick: () => align('distH') },
          { label: t('ar.distV'), icon: AlignVerticalSpaceAround, disabled: selectedEls.length < 3, onClick: () => align('distV') }
        );
      } else {
        items.push(
          { label: t('ar.alignHCenter'), icon: AlignCenterVertical, onClick: () => align('hcenter') },
          { label: t('ar.alignVCenter'), icon: AlignCenterHorizontal, onClick: () => align('vcenter') }
        );
      }
      items.push(SEP, { label: t('ctx.properties'), icon: SlidersHorizontal, onClick: openProps });
      return items;
    }
    // Page / background menu
    const at = menu.at;
    const insertHere = (fn: () => void) => () => {
      insertAtRef.current = at ?? null;
      fn();
    };
    return [
      { label: at ? t('ctx.pasteHere') : t('rb.paste'), icon: Clipboard, shortcut: 'Ctrl+V', disabled: !clipboard.length, onClick: () => pasteElements(undefined, t('act.paste'), at) },
      { label: t('ar.selectAll'), icon: MousePointer2, shortcut: 'Ctrl+A', disabled: !layerEls.length, onClick: () => setSelected(layerEls.map((x) => x.id)) },
      { kind: 'header', label: at ? t('ctx.insertHere') : t('tab.insert') },
      { label: t('ins.text'), icon: Type, onClick: insertHere(insertText) },
      {
        label: t('ins.image'),
        icon: ImagePlus,
        onClick: () => {
          insertAtRef.current = at ?? null;
          imageInputRef.current?.click();
        }
      },
      { label: t('ins.rect'), icon: Square, onClick: insertHere(insertRect) },
      { label: t('ins.circle'), icon: Circle, onClick: insertHere(insertCircle) },
      { label: t('ins.table'), icon: Table, onClick: insertHere(insertTable) },
      { label: t('ins.pagenum'), icon: Hash, onClick: insertHere(insertPageNum) },
      { kind: 'header', label: editingMaster ? t('pg.master') : t('pg.pageN', { n: safePageIndex + 1 }) },
      ...(editingMaster
        ? [{ label: t('pg.exitMaster'), icon: Layers, onClick: () => setEditingMaster(false) } as MenuItem]
        : ([
            { label: t('pg.add'), icon: Plus, onClick: () => addPage() },
            { label: t('pg.duplicate'), icon: CopyPlus, onClick: () => duplicatePage() },
            { label: t('pg.delete'), icon: Trash2, danger: true, disabled: doc.pages.length <= 1, onClick: () => deletePage() },
            { label: t('pg.editMaster'), icon: Layers, onClick: () => setEditingMaster(true) },
            {
              label: t('pg.hideMaster'),
              icon: EyeOff,
              checked: !!page.hideMaster,
              onClick: () => patchPage({ hideMaster: !page.hideMaster }, t('act.master'))
            },
            { label: t('ctx.pageSettings'), icon: SlidersHorizontal, onClick: openProps }
          ] as MenuItem[])),
      { kind: 'header', label: t('tab.view') },
      { label: t('vw.grid'), icon: Grid3x3, checked: showGrid, onClick: () => setShowGrid(!showGrid) },
      { label: t('vw.smart'), icon: Sparkles, checked: smart, onClick: () => setSmart(!smart) },
      { label: t('vw.marks'), icon: Crop, checked: !!doc.printMarks, onClick: () => setDocField({ printMarks: !doc.printMarks }, t('act.marks')) },
      { label: t('vw.fit'), icon: Maximize2, onClick: fitZoom }
    ];
  };

  // ---------------------------------------------------------------- render helpers
  const pageText = pageNumberLabel(safePageIndex, doc.pages.length, pageLabelTpl);
  const off = doc.printMarks ? (BLEED_MM + MARK_ZONE_MM) * MM_TO_PX : 0;
  const bleedPx = BLEED_MM * MM_TO_PX;
  const masterEls = doc.master && !page.hideMaster ? doc.master.elements : [];
  const textStyle = !!single && (single.type === 'text' || single.type === 'pagenum' || single.type === 'table');
  const fmt = t('act.format');
  const cellEdit = (el: CanvasElementData) => (r: number, c: number, v: string) =>
    patchEls([el.id], { tableData: el.tableData!.map((row, ri) => (ri === r ? row.map((x, ci) => (ci === c ? v : x)) : row)) }, rec(t('act.cell'), `cell:${el.id}:${r}:${c}`));

  const tabs: { id: Tab; label: string }[] = [
    { id: 'home', label: t('tab.home') },
    { id: 'insert', label: t('tab.insert') },
    { id: 'arrange', label: t('tab.arrange') },
    { id: 'page', label: t('tab.page') },
    { id: 'view', label: t('tab.view') },
    { id: 'help', label: t('tab.help') }
  ];

  const lastPast = H.past[H.past.length - 1];
  const nextFuture = H.future[0];

  return (
    <div
      className="h-full flex flex-col bg-slate-100 text-slate-900 select-none"
      onContextMenu={(e) => {
        // No browser menu in the editor, except inside text fields (spell-check, paste…).
        const tag = (e.target as HTMLElement).tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') e.preventDefault();
      }}
    >
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onImagePicked(e)} />
      <input ref={replaceImageRef} type="file" accept="image/*" className="hidden" onChange={(e) => single && onImagePicked(e, single.id)} />

      {/* ============ TOP BAR ============ */}
      <header className="bg-brand-900 text-white px-3 py-2 flex items-center gap-2 z-30">
        <button onClick={props.onClose} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold">
          <ChevronLeft className="w-4 h-4 rtl:rotate-180" /> {t('ed.back')}
        </button>
        <AppLogo size={28} className="rounded-md ms-1" />
        <input
          value={doc.title}
          onChange={(e) => commit({ ...docRef.current, title: e.target.value }, rec(t('act.title'), 'title'))}
          className="bg-transparent hover:bg-white/10 focus:bg-white/10 px-2 py-1 rounded text-sm font-semibold focus:outline-none border border-transparent focus:border-aqua min-w-0 w-60"
          dir="auto"
        />
        <button
          onClick={props.onSave}
          title={t('ed.saveNow')}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
            props.dirty ? 'bg-amber-400 text-amber-950 hover:bg-amber-300' : 'bg-white/10 text-aqua hover:bg-white/20'
          }`}
        >
          {props.dirty ? <Save className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
          <span className="hidden md:inline">{props.dirty ? t('ed.unsaved') : t('ed.saved')}</span>
        </button>
        <div className="flex items-center gap-1 ms-1">
          <TopIcon title={`${t('ed.undo')}${lastPast ? ` — ${lastPast.label}` : ''}`} disabled={!H.past.length} onClick={undo}>
            <Undo2 className="w-4 h-4 rtl:-scale-x-100" />
          </TopIcon>
          <TopIcon title={`${t('ed.redo')}${nextFuture ? ` — ${nextFuture.label}` : ''}`} disabled={!H.future.length} onClick={redo}>
            <Redo2 className="w-4 h-4 rtl:-scale-x-100" />
          </TopIcon>
        </div>
        <div className="flex-1" />
        <TopIcon title={t('ed.versions')} onClick={props.onShowVersions}>
          <History className="w-4 h-4" />
        </TopIcon>
        <TopIcon title={t('common.help')} onClick={props.openHelp}>
          <HelpCircle className="w-4 h-4" />
        </TopIcon>
        <TopIcon title={t('ed.saveCopy')} onClick={() => downloadBlob(JSON.stringify(doc, null, 2), `${safeName(doc.title)}.opub.json`, 'application/json')}>
          <Download className="w-4 h-4" />
        </TopIcon>
        <button
          disabled={busy}
          onClick={doPng}
          title={t('ed.exportPngTip')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold disabled:opacity-50"
        >
          <ImageIcon className="w-4 h-4 text-aqua" /> {t('ed.exportPng')}
        </button>
        <button disabled={busy} onClick={doPdf} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-xs font-bold disabled:opacity-50">
          <Printer className="w-4 h-4" /> {t('ed.exportPdf')}
        </button>
      </header>

      {/* ============ RIBBON ============ */}
      <div className="bg-white border-b border-slate-200 z-20">
        <div className="flex items-center px-3 border-b border-slate-200 bg-brand-50/50 overflow-x-auto">
          {tabs.map((x) => (
            <button
              key={x.id}
              onClick={() => setTab(x.id)}
              className={`px-4 py-2 text-xs font-semibold border-b-2 whitespace-nowrap ${
                tab === x.id ? 'border-brand-700 text-brand-800 bg-white' : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {x.label}
            </button>
          ))}
          {editingMaster && (
            <span className="ms-auto my-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
              <Layers className="w-3.5 h-3.5" /> {t('pg.master')}
            </span>
          )}
        </div>
        <div className="px-3 py-2 flex items-center gap-1 overflow-x-auto min-h-[66px]">
          {tab === 'home' && (
            <>
              <Group label={t('rb.clipboard')}>
                <RBtn icon={Clipboard} label={t('rb.paste')} disabled={!clipboard.length} onClick={() => pasteElements(undefined, t('act.paste'))} />
                <RBtn icon={Scissors} label={t('ctx.cut')} disabled={!selected.length} onClick={cutSelection} />
                <RBtn icon={Copy} label={t('rb.copy')} disabled={!selected.length} onClick={copySelection} />
                <RBtn icon={CopyPlus} label={t('rb.duplicate')} disabled={!selected.length} onClick={() => pasteElements(selectedEls, t('act.duplicate'))} />
                <RBtn icon={Trash2} label={t('rb.delete')} disabled={!selected.length} onClick={() => deleteSelection()} danger />
              </Group>
              <Group label={t('rb.text')}>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <select
                      disabled={!textStyle}
                      value={single?.fontFamily || 'Inter, sans-serif'}
                      onChange={(e) => patchSel({ fontFamily: e.target.value }, fmt)}
                      className="w-36 px-2 py-1 text-xs border border-slate-300 rounded disabled:opacity-40"
                      title={t('rb.font')}
                    >
                      {FONTS.map((f) => (
                        <option key={f.v} value={f.v}>
                          {f.l}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={6}
                      max={300}
                      disabled={!textStyle}
                      value={single?.fontSize || 16}
                      onChange={(e) => patchSel({ fontSize: Math.max(6, Number(e.target.value)) }, t('act.fontSize'), 'fs')}
                      className="w-14 px-1.5 py-1 text-xs border border-slate-300 rounded disabled:opacity-40"
                      title={t('rb.size')}
                    />
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Toggle on={!!single?.bold} disabled={!textStyle} title={t('rb.bold')} onClick={() => patchSel({ bold: !single?.bold }, fmt)}>
                      <Bold className="w-3.5 h-3.5" />
                    </Toggle>
                    <Toggle on={!!single?.italic} disabled={!textStyle} title={t('rb.italic')} onClick={() => patchSel({ italic: !single?.italic }, fmt)}>
                      <Italic className="w-3.5 h-3.5" />
                    </Toggle>
                    <Toggle on={!!single?.underline} disabled={!textStyle} title={t('rb.underline')} onClick={() => patchSel({ underline: !single?.underline }, fmt)}>
                      <Underline className="w-3.5 h-3.5" />
                    </Toggle>
                    <span className="w-px h-4 bg-slate-200 mx-1" />
                    {(
                      [
                        ['left', AlignLeft, 'rb.alignLeft'],
                        ['center', AlignCenter, 'rb.alignCenter'],
                        ['right', AlignRight, 'rb.alignRight'],
                        ['justify', AlignJustify, 'rb.justify']
                      ] as const
                    ).map(([a, Icon, k]) => (
                      <Toggle key={a} on={single?.textAlign === a} disabled={!textStyle} title={t(k)} onClick={() => patchSel({ textAlign: a }, fmt)}>
                        <Icon className="w-3.5 h-3.5" />
                      </Toggle>
                    ))}
                  </div>
                </div>
                <ColorPick label={t('rb.textColor')} disabled={!textStyle} value={single?.fontColor || '#0f172a'} onChange={(v) => patchSel({ fontColor: v }, t('act.color'), 'color')} />
              </Group>
              <Group label={t('rb.fill')}>
                <ColorPick
                  label={t('rb.fill')}
                  disabled={!selected.length}
                  value={single?.fillColor && single.fillColor !== 'transparent' ? single.fillColor : '#ffffff'}
                  onChange={(v) => patchSel({ fillColor: v }, t('act.fill'), 'fill')}
                />
                <button
                  disabled={!selected.length}
                  onClick={() => patchSel({ fillColor: 'transparent' }, t('act.fill'))}
                  className="text-[10px] px-1.5 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                  title="transparent"
                >
                  ∅
                </button>
              </Group>
              <Group label={t('rb.order')}>
                <RBtn icon={BringToFront} label={t('rb.front')} disabled={!selected.length} onClick={() => reorder('front')} />
                <RBtn icon={SendToBack} label={t('rb.back')} disabled={!selected.length} onClick={() => reorder('back')} />
              </Group>
            </>
          )}

          {tab === 'insert' && (
            <>
              <RBtn icon={Type} label={t('ins.text')} onClick={insertText} />
              <RBtn icon={ImagePlus} label={t('ins.image')} onClick={() => imageInputRef.current?.click()} />
              <Sep />
              <RBtn icon={Square} label={t('ins.rect')} onClick={insertRect} />
              <RBtn icon={Circle} label={t('ins.circle')} onClick={insertCircle} />
              <RBtn icon={Minus} label={t('ins.line')} onClick={insertLine} />
              <RBtn icon={Table} label={t('ins.table')} onClick={insertTable} />
              <Sep />
              <RBtn icon={Hash} label={t('ins.pagenum')} onClick={insertPageNum} />
              <RBtn icon={Frame} label={t('ins.border')} onClick={insertBorder} />
              <Sep />
              <RBtn icon={FolderOpen} label={t('ins.import')} onClick={props.onImportFile} />
            </>
          )}

          {tab === 'arrange' && (
            <>
              <Group label={t('ar.align')}>
                <div className="grid grid-cols-4 gap-0.5">
                  <Toggle title={t('ar.alignLeft')} disabled={!selected.length} onClick={() => align('left')}>
                    <AlignStartVertical className="w-4 h-4" />
                  </Toggle>
                  <Toggle title={t('ar.alignHCenter')} disabled={!selected.length} onClick={() => align('hcenter')}>
                    <AlignCenterVertical className="w-4 h-4" />
                  </Toggle>
                  <Toggle title={t('ar.alignRight')} disabled={!selected.length} onClick={() => align('right')}>
                    <AlignEndVertical className="w-4 h-4" />
                  </Toggle>
                  <Toggle title={t('ar.distH')} disabled={selected.length < 3} onClick={() => align('distH')}>
                    <AlignHorizontalSpaceAround className="w-4 h-4" />
                  </Toggle>
                  <Toggle title={t('ar.alignTop')} disabled={!selected.length} onClick={() => align('top')}>
                    <AlignStartHorizontal className="w-4 h-4" />
                  </Toggle>
                  <Toggle title={t('ar.alignVCenter')} disabled={!selected.length} onClick={() => align('vcenter')}>
                    <AlignCenterHorizontal className="w-4 h-4" />
                  </Toggle>
                  <Toggle title={t('ar.alignBottom')} disabled={!selected.length} onClick={() => align('bottom')}>
                    <AlignEndHorizontal className="w-4 h-4" />
                  </Toggle>
                  <Toggle title={t('ar.distV')} disabled={selected.length < 3} onClick={() => align('distV')}>
                    <AlignVerticalSpaceAround className="w-4 h-4" />
                  </Toggle>
                </div>
                <span className="text-[10px] text-slate-400 max-w-28 leading-tight">{t('ar.relHint')}</span>
              </Group>
              <Group label={t('ar.rotate')}>
                <RBtn icon={RotateCcw} label="-90°" title={t('ar.rotL')} disabled={!selected.length} onClick={() => rotateBy(-90)} />
                <RBtn icon={RotateCw} label="+90°" title={t('ar.rotR')} disabled={!selected.length} onClick={() => rotateBy(90)} />
                <div className="flex flex-col items-center gap-1">
                  <input
                    type="number"
                    disabled={!single}
                    value={Math.round(single?.rotation || 0)}
                    onChange={(e) => single && patchEls([single.id], { rotation: ((Number(e.target.value) % 360) + 360) % 360 }, rec(t('act.rotate'), 'rot'))}
                    className="w-16 px-1.5 py-1 text-xs border border-slate-300 rounded disabled:opacity-40"
                  />
                  <button
                    disabled={!selected.length}
                    onClick={() => patchSel({ rotation: 0 }, t('act.rotate'))}
                    className="text-[10px] text-brand-700 hover:underline disabled:opacity-40"
                  >
                    {t('ar.rotReset')}
                  </button>
                </div>
              </Group>
              <Group label={t('ar.links')}>
                <RBtn icon={Link2} label={t('ar.link')} disabled={single?.type !== 'text'} active={!!linkFrom} onClick={startLink} />
                <RBtn icon={Unlink2} label={t('ar.unlink')} disabled={!single?.nextFrameId} onClick={unlink} />
                <span className="text-[10px] text-slate-400 max-w-36 leading-tight">{t('ar.linkHelp')}</span>
              </Group>
              <RBtn icon={MousePointer2} label={t('ar.selectAll')} onClick={() => setSelected(layerEls.map((x) => x.id))} />
            </>
          )}

          {tab === 'page' && (
            <>
              <Group label={t('pg.size')}>
                <select
                  value={doc.pageSize}
                  onChange={(e) => {
                    const v = e.target.value as PageSizePreset;
                    if (v === 'Custom') setDocField({ pageSize: v }, t('act.pageSize'));
                    else setDocField({ pageSize: v, widthMm: PAGE_PRESETS[v][0], heightMm: PAGE_PRESETS[v][1] }, t('act.pageSize'));
                  }}
                  className="px-2 py-1 text-xs border border-slate-300 rounded"
                >
                  <option value="A4">A4</option>
                  <option value="A5">A5</option>
                  <option value="A3">A3</option>
                  <option value="Letter">Letter</option>
                  <option value="Custom">{t('pg.custom')}</option>
                </select>
                <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                  {(['portrait', 'landscape'] as const).map((o) => (
                    <button
                      key={o}
                      onClick={() => doc.orientation !== o && setDocField({ orientation: o }, t('act.orientation'))}
                      className={`px-2.5 py-1 text-xs rounded-md ${doc.orientation === o ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
                    >
                      {o === 'portrait' ? t('common.portrait') : t('common.landscape')}
                    </button>
                  ))}
                </div>
              </Group>
              <Group label={t('pg.background')}>
                <div className="grid grid-cols-5 gap-1">
                  {BG_SWATCHES.map((c) => (
                    <button
                      key={c}
                      onClick={() => patchPage({ background: c }, t('act.pageBg'))}
                      className={`w-5 h-5 rounded border ${page.background === c ? 'ring-2 ring-brand-500' : 'border-slate-300'}`}
                      style={{ background: c }}
                    />
                  ))}
                  <input type="color" value={page.background || '#ffffff'} onChange={(e) => patchPage({ background: e.target.value }, t('act.pageBg'), 'pagebg')} className="w-5 h-5 rounded cursor-pointer" />
                </div>
              </Group>
              <Group label={t('pg.pages')}>
                <RBtn icon={Plus} label={t('pg.add')} onClick={() => addPage()} />
                <RBtn icon={CopyPlus} label={t('pg.duplicate')} onClick={() => duplicatePage()} />
                <RBtn icon={Trash2} label={t('pg.delete')} onClick={() => deletePage()} danger disabled={doc.pages.length <= 1} />
              </Group>
              <Group label={t('pg.master')}>
                <RBtn icon={Layers} label={editingMaster ? t('pg.exitMaster') : t('pg.editMaster')} active={editingMaster} onClick={() => setEditingMaster(!editingMaster)} />
                <RBtn
                  icon={page.hideMaster ? Eye : EyeOff}
                  label={t('pg.hideMaster')}
                  active={!!page.hideMaster}
                  onClick={() => patchPage({ hideMaster: !page.hideMaster }, t('act.master'))}
                />
              </Group>
            </>
          )}

          {tab === 'view' && (
            <>
              <Group label="Zoom">
                <RBtn icon={ZoomOut} label={t('vw.zoomOut')} onClick={() => setZoom((z) => clampZoom(z / 1.15))} />
                <span className="text-xs font-semibold w-12 text-center">{Math.round(zoom * 100)} %</span>
                <RBtn icon={ZoomIn} label={t('vw.zoomIn')} onClick={() => setZoom((z) => clampZoom(z * 1.15))} />
                <RBtn icon={Maximize2} label={t('vw.fit')} onClick={fitZoom} />
              </Group>
              <RBtn icon={Ruler} label={t('vw.rulers')} active={showRulers} onClick={() => setShowRulers(!showRulers)} />
              <RBtn icon={Eye} label={t('vw.margins')} active={showMargins} onClick={() => setShowMargins(!showMargins)} />
              <RBtn icon={Grid3x3} label={t('vw.grid')} active={showGrid} onClick={() => setShowGrid(!showGrid)} />
              <RBtn icon={Magnet} label={t('vw.snap')} active={snap} onClick={() => setSnap(!snap)} />
              <RBtn icon={Sparkles} label={t('vw.smart')} active={smart} onClick={() => setSmart(!smart)} />
              <RBtn icon={PanelLeft} label={t('vw.thumbs')} active={showThumbs} onClick={() => setShowThumbs(!showThumbs)} />
              <RBtn icon={SlidersHorizontal} label={t('panel.props')} active={!panelCollapsed} onClick={() => setPanelCollapsed(!panelCollapsed)} />
              <Sep />
              <RBtn icon={Crop} label={t('vw.marks')} title={t('vw.marksTip')} active={!!doc.printMarks} onClick={() => setDocField({ printMarks: !doc.printMarks }, t('act.marks'))} />
            </>
          )}

          {tab === 'help' && (
            <>
              <RBtn icon={HelpCircle} label={t('common.help')} onClick={props.openHelp} />
              <RBtn icon={History} label={t('ed.versions')} onClick={props.onShowVersions} />
              <RBtn icon={Info} label={t('common.about')} onClick={props.openAbout} />
              <Sep />
              <LanguageSwitcher />
            </>
          )}
        </div>
      </div>

      {(linkFrom || editingMaster) && (
        <div className={`px-4 py-1.5 text-xs font-medium flex items-center gap-2 ${linkFrom ? 'bg-brand-100 text-brand-900' : 'bg-amber-50 text-amber-900'}`}>
          {linkFrom ? <Link2 className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
          {linkFrom ? t('ar.linkPick') : t('pg.masterBanner')}
          <button onClick={() => (linkFrom ? setLinkFrom(null) : setEditingMaster(false))} className="ms-auto inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/70 hover:bg-white">
            {linkFrom ? <X className="w-3 h-3" /> : null}
            {linkFrom ? t('common.cancel') : t('pg.exitMaster')}
          </button>
        </div>
      )}

      {/* ============ BODY ============ */}
      <div className="flex-1 flex overflow-hidden">
        {showThumbs && (
          <aside className="w-48 bg-white border-e border-slate-200 flex flex-col shrink-0">
            <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {t('pg.pages')} ({doc.pages.length})
              </span>
              <button onClick={() => addPage()} title={t('pg.add')} className="p-1 rounded-md bg-brand-50 text-brand-700 hover:bg-brand-100">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto op-scroll p-3 space-y-3">
              <button
                onClick={() => setEditingMaster(!editingMaster)}
                className={`w-full rounded-lg border px-2 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${
                  editingMaster ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-dashed border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> {t('pg.master')}
                {!!doc.master?.elements.length && <span className="ms-auto text-[10px] opacity-70">{doc.master.elements.length}</span>}
              </button>
              {doc.pages.map((pg, i) => (
                <div
                  key={pg.id}
                  className="group relative"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setPageIndex(i);
                    setEditingMaster(false);
                    setSelected([]);
                    setMenu({ x: e.clientX, y: e.clientY, kind: 'page' });
                  }}
                >
                  <button
                    onClick={() => {
                      setPageIndex(i);
                      setEditingMaster(false);
                    }}
                    className={`w-full rounded-lg p-1.5 border-2 transition ${
                      i === safePageIndex && !editingMaster ? 'border-brand-600 bg-brand-50' : 'border-transparent hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-center">
                      <PagePreview doc={doc} pageIndex={i} width={doc.orientation === 'landscape' ? 150 : 110} flows={flows} pageLabel={pageLabelTpl} />
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1 font-medium">{i + 1}</div>
                  </button>
                  <div className="absolute top-2 end-2 hidden group-hover:flex flex-col gap-0.5">
                    <MiniBtn title={t('pg.moveUp')} disabled={i === 0} onClick={() => movePage(i, -1)}>
                      <ChevronUp className="w-3 h-3" />
                    </MiniBtn>
                    <MiniBtn title={t('pg.moveDown')} disabled={i === doc.pages.length - 1} onClick={() => movePage(i, 1)}>
                      <ChevronDown className="w-3 h-3" />
                    </MiniBtn>
                    <MiniBtn title={t('pg.delete')} disabled={doc.pages.length <= 1} onClick={() => deletePage(i)}>
                      <Trash2 className="w-3 h-3" />
                    </MiniBtn>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* ============ CANVAS ============ */}
        <div className="flex-1 flex flex-col min-w-0" dir="ltr">
          {showRulers && <HRuler zoom={zoom} sizePx={dims.width} scrollRef={scrollRef} pageRef={pageRef} />}
          <div className="flex-1 flex min-h-0">
            {showRulers && <VRuler zoom={zoom} sizePx={dims.height} scrollRef={scrollRef} pageRef={pageRef} />}
            <div ref={scrollRef} className="flex-1 overflow-auto op-scroll bg-slate-200/80" onMouseDown={onPageMouseDown} onContextMenu={onPageContextMenu}>
              <div className="min-w-full min-h-full flex items-start justify-center p-10 w-max">
                <div className="relative shrink-0" style={{ width: (dims.width + off * 2) * zoom, height: (dims.height + off * 2) * zoom }}>
                  {doc.printMarks && <PrintMarksOverlay w={dims.width} h={dims.height} off={off} bleed={bleedPx} zoom={zoom} bg={page.background} />}
                  <div
                    ref={pageRef}
                    className="absolute shadow-[0_6px_24px_rgba(15,23,42,0.18)]"
                    style={{ left: off * zoom, top: off * zoom, width: dims.width * zoom, height: dims.height * zoom }}
                  >
                    <div
                      style={{
                        width: dims.width,
                        height: dims.height,
                        transform: `scale(${zoom})`,
                        transformOrigin: 'top left',
                        position: 'absolute',
                        background: page.background || '#ffffff',
                        backgroundImage: showGrid
                          ? 'linear-gradient(rgba(18,122,128,.10) 1px, transparent 1px), linear-gradient(90deg, rgba(18,122,128,.10) 1px, transparent 1px)'
                          : undefined,
                        backgroundSize: showGrid ? '16px 16px' : undefined,
                        overflow: 'hidden'
                      }}
                    >
                      {/* Master layer */}
                      <div className="absolute inset-0" style={{ zIndex: 0 }}>
                        {(editingMaster ? doc.master?.elements ?? [] : masterEls).map((el) =>
                          editingMaster ? (
                            <EditableElement
                              key={el.id}
                              el={el}
                              flow={flows.get(el.id)}
                              pageText={pageText}
                              editing={editingTextId === el.id}
                              onMouseDown={(e) => onElementMouseDown(e, el)}
                              onContextMenu={(e) => onElementContextMenu(e, el)}
                              onDoubleClick={() => el.type === 'text' && setEditingTextId(el.id)}
                              onText={(v) => patchEls([el.id], { text: v }, rec(t('act.typing'), `type:${el.id}`))}
                              onCell={cellEdit(el)}
                            />
                          ) : (
                            <div key={el.id} style={{ ...elementStyle(el), pointerEvents: 'none' }}>
                              <ElementContent el={el} flow={flows.get(el.id)} pageText={pageText} />
                            </div>
                          )
                        )}
                      </div>
                      {/* Page layer */}
                      <div className="absolute inset-0" style={{ zIndex: 1, opacity: editingMaster ? 0.25 : 1, pointerEvents: editingMaster ? 'none' : undefined }}>
                        {page.elements.map((el) => (
                          <EditableElement
                            key={el.id}
                            el={el}
                            flow={flows.get(el.id)}
                            pageText={pageText}
                            editing={editingTextId === el.id}
                            linkTarget={!!linkFrom && el.type === 'text' && el.id !== linkFrom}
                            onMouseDown={(e) => onElementMouseDown(e, el)}
                            onContextMenu={(e) => onElementContextMenu(e, el)}
                            onDoubleClick={() => {
                              if (el.type !== 'text') return;
                              const f = flows.get(el.id);
                              if (f && f.chainIndex > 0) {
                                if (page.elements.some((x) => x.id === f.storyHeadId)) {
                                  setSelected([f.storyHeadId]);
                                  setEditingTextId(f.storyHeadId);
                                } else notify(t('insp.storyHint'));
                                return;
                              }
                              setEditingTextId(el.id);
                            }}
                            onText={(v) => patchEls([el.id], { text: v }, rec(t('act.typing'), `type:${el.id}`))}
                            onCell={cellEdit(el)}
                          />
                        ))}
                      </div>

                      {/* Overlays */}
                      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
                        {showMargins && marginPx > 0 && (
                          <div className="absolute border border-dashed border-brand-400/60" style={{ left: marginPx, top: marginPx, right: marginPx, bottom: marginPx }} />
                        )}
                        <FlowArrows els={layerEls} doc={doc} selected={selected} zoom={zoom} />
                        {layerEls.map((el) =>
                          flows.get(el.id)?.overflow ? (
                            <div key={`of-${el.id}`} style={{ ...elementStyle(el), zIndex: undefined, opacity: 1 }}>
                              <div
                                className="absolute -bottom-2.5 -right-2.5 w-5 h-5 rounded bg-rose-600 text-white flex items-center justify-center font-bold shadow"
                                style={{ transform: `scale(${1 / zoom})` }}
                                title={t('insp.overflow')}
                              >
                                +
                              </div>
                            </div>
                          ) : null
                        )}
                        {selectedEls.map((el) => (
                          <SelectionBox
                            key={`sel-${el.id}`}
                            el={el}
                            zoom={zoom}
                            showHandles={selectedEls.length === 1 && editingTextId !== el.id}
                            onResize={(e, h) => startResize(e, el, h)}
                            onRotate={(e) => startRotate(e, el)}
                          />
                        ))}
                        {guides.x.map((x) => (
                          <div key={`gx${x}`} className="absolute top-0 bottom-0" style={{ left: x, width: 1 / zoom, background: '#ec4899' }} />
                        ))}
                        {guides.y.map((y) => (
                          <div key={`gy${y}`} className="absolute left-0 right-0" style={{ top: y, height: 1 / zoom, background: '#ec4899' }} />
                        ))}
                        {marquee && (
                          <div
                            className="absolute border border-brand-500 bg-brand-400/10"
                            style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h, borderWidth: 1 / zoom }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Status bar */}
          <div className="h-7 bg-white border-t border-slate-200 px-3 flex items-center gap-4 text-[11px] text-slate-500" dir="auto">
            <span>
              {editingMaster ? t('pg.master') : t('pg.pageN', { n: safePageIndex + 1 })} / {doc.pages.length}
            </span>
            <span>{Math.round(zoom * 100)} %</span>
            {selected.length > 0 && <span>{selected.length > 1 ? t('insp.multi', { n: selected.length }) : t(`kind.${single?.type}`)}</span>}
            {lastPast && (
              <span className="truncate">
                {t('hist.last')} : {lastPast.label}
              </span>
            )}
            <span className="ms-auto">{t('help.k9')}</span>
          </div>
        </div>

        {/* ============ RIGHT PANEL (always present, collapsible) ============ */}
        <SidePanel
          collapsed={panelCollapsed}
          setCollapsed={setPanelCollapsed}
          tab={panelTab}
          setTab={setPanelTab}
          history={<HistoryPanel history={H} onJump={jumpTo} />}
        >
          {single ? (
            <ElementPanel
              doc={doc}
              el={single}
              flow={flows.get(single.id)}
              patch={(p, label, key) => patchEls([single.id], p, rec(label, key))}
              onReplaceImage={() => replaceImageRef.current?.click()}
              onDeselect={() => setSelected([])}
            />
          ) : selectedEls.length > 1 ? (
            <MultiPanel els={selectedEls} align={align} patch={(p, label, key) => patchSel(p, label, key)} />
          ) : (
            <PagePanel
              doc={doc}
              page={page}
              pageIndex={safePageIndex}
              editingMaster={editingMaster}
              setDocField={setDocField}
              patchPage={patchPage}
              toggleMaster={() => setEditingMaster(!editingMaster)}
            />
          )}
        </SidePanel>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={buildMenu()} onClose={() => setMenu(null)} />}
    </div>
  );
}

function clampZoom(z: number) {
  return Math.min(4, Math.max(0.15, z));
}

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 80) || 'document';
}
