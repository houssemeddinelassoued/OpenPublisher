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
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
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
  Columns3,
  Shapes,
  ChevronsUp,
  ChevronsDown,
  RectangleHorizontal,
  RectangleVertical,
  LayoutTemplate,
  CheckSquare
} from 'lucide-react';
import { useI18n } from '../i18n';
import { AppLogo, LanguageSwitcher } from '../components/Brand';
import type { CanvasElementData, Orientation, PageData, PageSizePreset, PubDocument } from '../core/model';
import { BLEED_MM, MARK_ZONE_MM, MM_TO_PX, PAGE_PRESETS, cloneDoc, elementBounds, getPageDims, masterElementsFor, pageOrientation, uid } from '../core/model';
import { getShape } from '../core/shapes';
import { ShapeGallery } from './ShapeGallery';
import { SaveTemplateModal, type TemplateScope } from '../components/TemplateModal';
import { computeDocumentFlows, findEl, unlinkReferences } from '../core/textflow';
import { applyElementPatch } from '../core/richtext';
import { primaryFamily } from '../core/fontmetrics';
import { exportPagePng, exportPrintPdf, pageNumberLabel } from '../core/render';
import { downloadBlob } from '../core/db';
import { ElementContent, LazyMount, PagePreview, elementStyle } from './ElementView';
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
  onSaveTemplate: (doc: PubDocument, name: string, description: string) => void;
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

type MenuState = null | { x: number; y: number; kind: 'element' | 'page'; at?: { x: number; y: number }; fromThumb?: boolean };

const PANEL_KEY = 'op.panelCollapsed';
const RIBBON_KEY = 'op.ribbonCollapsed';
/** Text placed on the system clipboard when objects are copied inside the editor. */
const CLIP_MARKER = `openpublisher-clipboard:${Math.random().toString(36).slice(2)}`;

function isTextField(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  const tag = el?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el?.isContentEditable;
}

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
  /** Zoom follows the available space (until the user zooms manually). */
  const autoFitRef = useRef(true);
  const [autoFit, setAutoFitState] = useState(true);
  const setAutoFit = (v: boolean) => {
    autoFitRef.current = v;
    setAutoFitState(v);
  };
  const zoomBy = (factor: number) => {
    setAutoFit(false);
    setZoom((z) => clampZoom(z * factor));
  };
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
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  /** Insertion point between two page thumbnails (index of the new page). */
  const [insertGap, setInsertGapState] = useState<number | null>(null);
  const insertGapRef = useRef<number | null>(null);
  const setInsertGap = (v: number | null) => {
    insertGapRef.current = v;
    setInsertGapState(v);
  };
  const [lastPageClick, setLastPageClick] = useState<number | null>(null);
  const [ribbonCollapsed, setRibbonCollapsedState] = useState(() => {
    try {
      return localStorage.getItem(RIBBON_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [ribbonPeek, setRibbonPeek] = useState(false);
  const ribbonRef = useRef<HTMLDivElement | null>(null);
  const [shapeGallery, setShapeGallery] = useState<null | { x: number; y: number; at?: { x: number; y: number } }>(null);
  const [templateDialog, setTemplateDialog] = useState<null | TemplateScope>(null);
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

  const setRibbonCollapsed = (v: boolean) => {
    setRibbonCollapsedState(v);
    setRibbonPeek(false);
    try {
      localStorage.setItem(RIBBON_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  // Close the temporarily shown ribbon when clicking elsewhere.
  useEffect(() => {
    if (!ribbonPeek) return;
    const onDown = (e: MouseEvent) => {
      const tg = e.target as HTMLElement;
      if (ribbonRef.current?.contains(tg) || tg.closest?.('[data-ribbon-tabs]')) return;
      setRibbonPeek(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [ribbonPeek]);

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
  const dims = editingMaster ? getPageDims(doc) : getPageDims(doc, page);
  const pageOrient = pageOrientation(doc, page);
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
      setLayer((els) => els.map((e) => (ids.includes(e.id) ? applyElementPatch(e, typeof patch === 'function' ? patch(e) : patch) : e)), r);
    },
    [setLayer]
  );

  const patchSel = (patch: Partial<CanvasElementData>, label: string, key?: string) => patchEls(selected, patch, rec(label, key));

  const patchPage = (patch: Partial<PageData>, label: string, key?: string) => {
    const d = docRef.current;
    commit({ ...d, pages: d.pages.map((p, i) => (i === safePageIndex ? { ...p, ...patch } : p)) }, rec(label, key));
  };

  const setDocField = (patch: Partial<PubDocument>, label: string, key?: string) => commit({ ...docRef.current, ...patch }, rec(label, key));

  useEffect(() => {
    const ids = new Set(doc.pages.map((p) => p.id));
    setSelectedPages((sp) => (sp.every((id) => ids.has(id)) ? sp : sp.filter((id) => ids.has(id))));
  }, [doc.pages]);

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
    navigator.clipboard?.writeText(CLIP_MARKER).catch(() => {});
    notify(t('n.copied'));
  }, [notify, selectedEls, t]);

  const cutSelection = useCallback(() => {
    if (!selectedEls.length) return;
    setClipboard(cloneDoc(selectedEls));
    navigator.clipboard?.writeText(CLIP_MARKER).catch(() => {});
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
    const ref = d.pages[Math.max(0, after)];
    if (ref?.orientation) np.orientation = ref.orientation;
    const pages = [...d.pages];
    pages.splice(after + 1, 0, np);
    commit({ ...d, pages }, t('act.pageAdd'));
    setPageIndex(after + 1);
    setEditingMaster(false);
    notify(t('n.pageAdded'));
  };

  const addPageRef = useRef(addPage);
  addPageRef.current = addPage;

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
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
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
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    dragRef.current = { mode: 'marquee', startX: p.x, startY: p.y, additive: additive ? selected : [] };
    if (!additive) setSelected([]);
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
      if (insertGapRef.current !== null && (k === 'enter' || k === 'escape')) {
        e.preventDefault();
        const gap = insertGapRef.current;
        setInsertGap(null);
        if (k === 'enter') addPageRef.current(gap - 1);
        return;
      }
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        redo();
      } else if (k === 'f1' && mod) {
        e.preventDefault();
        setRibbonCollapsed(!ribbonCollapsed);
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

  useEffect(() => {
    const blocked = (e: Event) => isTextField(e.target) || !!document.querySelector('[data-modal-open]');
    const onCopy = (e: ClipboardEvent) => {
      if (blocked(e) || !selectedEls.length) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', CLIP_MARKER);
      copySelection();
    };
    const onCut = (e: ClipboardEvent) => {
      if (blocked(e) || !selectedEls.length) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', CLIP_MARKER);
      cutSelection();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (blocked(e) || !e.clipboardData) return;
      e.preventDefault();
      pasteFromData(e.clipboardData);
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  });

  // Ctrl + wheel zoom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      autoFitRef.current = false;
      setAutoFitState(false);
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
  }, [doc.id, doc.widthMm, doc.heightMm, pageOrient]);

  // Hiding / showing the ribbon changes the available height: fit the page
  // to the screen again, then keep following the window size.
  const fitRef = useRef(fitZoom);
  fitRef.current = fitZoom;
  useEffect(() => {
    setAutoFit(true);
    const id = requestAnimationFrame(() => fitRef.current());
    return () => cancelAnimationFrame(id);
  }, [ribbonCollapsed]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    let last = { w: el.clientWidth, h: el.clientHeight };
    const ro = new ResizeObserver(() => {
      const now = { w: el.clientWidth, h: el.clientHeight };
      if (Math.abs(now.w - last.w) < 2 && Math.abs(now.h - last.h) < 2) return;
      last = now;
      if (!autoFitRef.current) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => fitRef.current());
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

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

  // ---------------------------------------------------------------- system clipboard & dropped files
  const insertImageFiles = async (files: File[], at?: { x: number; y: number }) => {
    let i = 0;
    for (const file of files) {
      try {
        const img = await readImageFile(file);
        const s = Math.min(1, 420 / Math.max(img.w, img.h));
        insertAtRef.current = at ? { x: at.x + i * 20, y: at.y + i * 20 } : null;
        addElement({ type: 'image', width: Math.round(img.w * s), height: Math.round(img.h * s), imageUrl: img.url, strokeWidth: 0 }, t('kind.image'));
        i++;
      } catch {
        notify(t('n.importFail'));
      }
    }
    if (i) notify(t('n.imagePasted'));
  };

  const insertImageUrl = async (url: string, at?: { x: number; y: number }) => {
    try {
      const blob = await (await fetch(url)).blob();
      if (!blob.type.startsWith('image/')) throw new Error('type');
      await insertImageFiles([new File([blob], 'image', { type: blob.type })], at);
    } catch {
      // Cross-origin image: keep the link (it may not print offline).
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 420 / Math.max(img.width, img.height));
        insertAtRef.current = at ?? null;
        addElement({ type: 'image', width: Math.round(img.width * s), height: Math.round(img.height * s), imageUrl: url, strokeWidth: 0 }, t('kind.image'));
      };
      img.onerror = () => notify(t('n.importFail'));
      img.src = url;
    }
  };

  const insertPlainText = (text: string, at?: { x: number; y: number }) => {
    insertAtRef.current = at ?? null;
    const lines = text.split('\n').length;
    addElement(
      {
        type: 'text',
        width: 360,
        height: Math.min(600, Math.max(60, lines * 26 + 16)),
        text: text.replace(/\r\n/g, '\n'),
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
  };

  /** Paste from a ClipboardEvent / DataTransfer: our objects, images, HTML <img> or plain text. */
  const pasteFromData = (dt: DataTransfer, at?: { x: number; y: number }) => {
    const text = dt.getData('text/plain');
    if (text === CLIP_MARKER && clipboard.length) {
      pasteElements(undefined, t('act.paste'), at);
      notify(t('n.pasted'));
      return;
    }
    const files: File[] = [];
    for (const f of Array.from(dt.files || [])) if (f.type.startsWith('image/')) files.push(f);
    if (!files.length)
      for (const it of Array.from(dt.items || [])) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
    if (files.length) return void insertImageFiles(files, at);
    const html = dt.getData('text/html');
    const m = html && html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m && /^(https?:|data:image)/.test(m[1])) return void insertImageUrl(m[1], at);
    if (text && text.trim()) return insertPlainText(text, at);
    if (clipboard.length) {
      pasteElements(undefined, t('act.paste'), at);
      notify(t('n.pasted'));
    }
  };

  /** Paste button / menu: reads the system clipboard when allowed, else our own clipboard. */
  const pasteFromSystem = async (at?: { x: number; y: number }) => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((ty) => ty.startsWith('image/'));
        if (imgType) {
          const blob = await item.getType(imgType);
          return void insertImageFiles([new File([blob], 'image', { type: imgType })], at);
        }
      }
      for (const item of items) {
        if (item.types.includes('text/plain')) {
          const text = await (await item.getType('text/plain')).text();
          if (text === CLIP_MARKER || !text.trim()) break;
          return insertPlainText(text, at);
        }
      }
    } catch {
      /* permission refused: fall back to the internal clipboard */
    }
    if (clipboard.length) {
      pasteElements(undefined, t('act.paste'), at);
      notify(t('n.pasted'));
    }
  };

  // ---------------------------------------------------------------- shapes
  const insertShape = (id: string) => {
    if (id === 'rectangle') return insertRect();
    if (id === 'circle') return insertCircle();
    if (id === 'line') return insertLine();
    if (id === 'rounded')
      return addElement(
        { type: 'shape', shapeVariant: 'rectangle', width: 220, height: 130, fillColor: '#d0f4f4', strokeColor: '#127a80', strokeWidth: 2, borderRadius: 18 },
        t('shape.rounded')
      );
    const def = getShape(id);
    const wide = def?.group === 'arrows' || def?.group === 'callouts' || id === 'parallelogram' || id === 'trapezoid';
    addElement(
      { type: 'shape', shapeVariant: id, width: wide ? 240 : 180, height: wide ? 150 : 180, fillColor: '#d0f4f4', strokeColor: '#127a80', strokeWidth: 2 },
      t(`shape.${id}`)
    );
  };

  // ---------------------------------------------------------------- pages: selection, orientation, templates
  const pageTargets = () => (selectedPages.length ? selectedPages : [page.id]);

  const setPagesOrientation = (o: Orientation, ids: string[] = pageTargets()) => {
    const d = docRef.current;
    commit({ ...d, pages: d.pages.map((p) => (ids.includes(p.id) ? { ...p, orientation: o } : p)) }, t('act.orientation'));
  };

  const setAllOrientation = (o: Orientation) => {
    const d = docRef.current;
    commit({ ...d, orientation: o, pages: d.pages.map((p) => ({ ...p, orientation: undefined })) }, t('act.orientation'));
  };

  const duplicatePages = (ids: string[]) => {
    const d = docRef.current;
    const pages: PageData[] = [];
    for (const p of d.pages) {
      pages.push(p);
      if (!ids.includes(p.id)) continue;
      const idMap = new Map<string, string>();
      for (const e of p.elements) idMap.set(e.id, uid());
      pages.push({
        ...cloneDoc(p),
        id: uid('page'),
        elements: p.elements.map((e) => ({ ...cloneDoc(e), id: idMap.get(e.id)!, nextFrameId: e.nextFrameId ? idMap.get(e.nextFrameId) : undefined }))
      });
    }
    commit({ ...d, pages }, t('act.pageDup'));
    setSelectedPages([]);
    notify(t('n.pageDup'));
  };

  const deletePages = (ids: string[]) => {
    const d = docRef.current;
    if (ids.length >= d.pages.length) return notify(t('pg.lastPage'));
    const removed = new Set(d.pages.filter((p) => ids.includes(p.id)).flatMap((p) => p.elements.map((e) => e.id)));
    const next = unlinkReferences({ ...d, pages: d.pages.filter((p) => !ids.includes(p.id)) }, removed);
    commit(next, t('act.pageDel'));
    setSelectedPages([]);
    setPageIndex(Math.min(safePageIndex, next.pages.length - 1));
    notify(t('n.pageDeleted'));
  };

  const onThumbClick = (e: React.MouseEvent, i: number) => {
    const id = doc.pages[i].id;
    if (e.ctrlKey || e.metaKey) {
      setSelectedPages((sp) => (sp.includes(id) ? sp.filter((x) => x !== id) : [...sp, id]));
      setLastPageClick(i);
      return;
    }
    if (e.shiftKey && lastPageClick !== null) {
      const [a, b] = [Math.min(lastPageClick, i), Math.max(lastPageClick, i)];
      setSelectedPages(doc.pages.slice(a, b + 1).map((p) => p.id));
      return;
    }
    setSelectedPages([]);
    setLastPageClick(i);
    setPageIndex(i);
    setEditingMaster(false);
  };

  const togglePageCheck = (id: string) => setSelectedPages((sp) => (sp.includes(id) ? sp.filter((x) => x !== id) : [...sp, id]));

  const exportSelectedPdf = async () => {
    const idx = doc.pages.map((p, i) => (selectedPages.includes(p.id) ? i : -1)).filter((i) => i >= 0);
    setBusy(true);
    try {
      await exportPrintPdf(docRef.current, { title: t('ed.exporting'), printBtn: t('ed.printBtn'), pageLabel: pageLabelTpl, popupBlocked: t('ed.popupBlocked') }, idx);
    } finally {
      setBusy(false);
    }
  };

  /** Builds a standalone document from some pages (links to missing frames removed). */
  const subsetDoc = (ids: string[] | null): PubDocument => {
    const d = cloneDoc(docRef.current);
    if (!ids) return d;
    const keep = d.pages.filter((p) => ids.includes(p.id));
    const removed = new Set(d.pages.filter((p) => !ids.includes(p.id)).flatMap((p) => p.elements.map((e) => e.id)));
    return unlinkReferences({ ...d, pages: keep }, removed);
  };

  const saveTemplate = (name: string, desc: string, scope: TemplateScope) => {
    const ids = scope === 'document' ? null : scope === 'page' ? [page.id] : selectedPages;
    props.onSaveTemplate(subsetDoc(ids), name, desc);
    setTemplateDialog(null);
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
        { label: t('rb.paste'), icon: Clipboard, shortcut: 'Ctrl+V', onClick: () => pasteFromSystem() },
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
    // Several pages selected in the thumbnails
    if (menu.fromThumb && selectedPages.length > 1) {
      return [
        { kind: 'header', label: t('pg.selectedN', { n: selectedPages.length }) },
        { label: t('pg.duplicate'), icon: CopyPlus, onClick: () => duplicatePages(selectedPages) },
        { label: t('pg.delete'), icon: Trash2, danger: true, onClick: () => deletePages(selectedPages) },
        SEP,
        { label: t('common.portrait'), icon: RectangleVertical, onClick: () => setPagesOrientation('portrait') },
        { label: t('common.landscape'), icon: RectangleHorizontal, onClick: () => setPagesOrientation('landscape') },
        SEP,
        { label: t('pg.exportSel'), icon: Printer, onClick: exportSelectedPdf },
        { label: t('tplm.fromSel'), icon: LayoutTemplate, onClick: () => setTemplateDialog('selection') },
        { label: t('pg.clearSel'), icon: X, onClick: () => setSelectedPages([]) }
      ];
    }
    // Page / background menu
    const at = menu.at;
    const insertHere = (fn: () => void) => () => {
      insertAtRef.current = at ?? null;
      fn();
    };
    return [
      { label: at ? t('ctx.pasteHere') : t('rb.paste'), icon: Clipboard, shortcut: 'Ctrl+V', onClick: () => pasteFromSystem(at) },
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
      { label: t('ins.shapes'), icon: Shapes, onClick: () => setShapeGallery({ x: menu.x, y: menu.y, at }) },
      { label: t('ins.table'), icon: Table, onClick: insertHere(insertTable) },
      { label: t('ins.pagenum'), icon: Hash, onClick: insertHere(insertPageNum) },
      { kind: 'header', label: editingMaster ? t('pg.master') : t('pg.pageN', { n: safePageIndex + 1 }) },
      ...(editingMaster
        ? [{ label: t('pg.exitMaster'), icon: Layers, onClick: () => setEditingMaster(false) } as MenuItem]
        : ([
            { label: t('pg.add'), icon: Plus, onClick: () => addPage() },
            { label: t('pg.duplicate'), icon: CopyPlus, onClick: () => duplicatePage() },
            { label: t('pg.delete'), icon: Trash2, danger: true, disabled: doc.pages.length <= 1, onClick: () => deletePage() },
            { label: t('common.portrait'), icon: RectangleVertical, checked: pageOrient === 'portrait', onClick: () => setPagesOrientation('portrait', [page.id]) },
            { label: t('common.landscape'), icon: RectangleHorizontal, checked: pageOrient === 'landscape', onClick: () => setPagesOrientation('landscape', [page.id]) },
            { label: t('tplm.fromPage'), icon: LayoutTemplate, onClick: () => setTemplateDialog('page') },
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
  const masterEls = masterElementsFor(doc, page);
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
      <div className="bg-white border-b border-slate-200 z-30 relative">
        <div data-ribbon-tabs className="flex items-center px-3 border-b border-slate-200 bg-brand-50/50 overflow-x-auto">
          {tabs.map((x) => (
            <button
              key={x.id}
              onDoubleClick={() => setRibbonCollapsed(!ribbonCollapsed)}
              onClick={() => {
                if (ribbonCollapsed) setRibbonPeek(!(ribbonPeek && tab === x.id));
                setTab(x.id);
              }}
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
          <button
            onClick={() => setRibbonCollapsed(!ribbonCollapsed)}
            title={ribbonCollapsed ? t('rb.expand') : t('rb.collapse')}
            className={`${editingMaster ? 'ms-2' : 'ms-auto'} my-1 p-1 rounded-md text-slate-500 hover:bg-white hover:text-brand-800`}
          >
            {ribbonCollapsed ? <ChevronsDown className="w-4 h-4" /> : <ChevronsUp className="w-4 h-4" />}
          </button>
        </div>
        {(!ribbonCollapsed || ribbonPeek) && (
        <div
          ref={ribbonRef}
          className={`px-3 py-2 flex items-center gap-1 overflow-x-auto min-h-[66px] bg-white ${ribbonCollapsed ? 'absolute left-0 right-0 top-full shadow-lg border-b border-slate-200' : ''}`}
        >
          {tab === 'home' && (
            <>
              <Group label={t('rb.clipboard')}>
                <RBtn icon={Clipboard} label={t('rb.paste')} onClick={() => pasteFromSystem()} />
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
                      {single?.fontFamily && !FONTS.some((f) => f.v === single.fontFamily) && (
                        <option value={single.fontFamily}>{primaryFamily(single.fontFamily)}</option>
                      )}
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
                    <span className="w-px h-4 bg-slate-200 mx-1" />
                    {(
                      [
                        ['top', AlignVerticalJustifyStart, 'rb.vTop'],
                        ['middle', AlignVerticalJustifyCenter, 'rb.vMiddle'],
                        ['bottom', AlignVerticalJustifyEnd, 'rb.vBottom']
                      ] as const
                    ).map(([a, Icon, k]) => (
                      <Toggle
                        key={a}
                        on={(single?.vAlign ?? 'top') === a && single?.type === 'text'}
                        disabled={!textStyle || single?.type !== 'text'}
                        title={t(k)}
                        onClick={() => patchSel({ vAlign: a === 'top' ? undefined : a }, fmt)}
                      >
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
              <RBtn
                icon={Shapes}
                label={t('ins.shapes')}
                active={!!shapeGallery}
                onClick={(e?: React.MouseEvent) => {
                  const r = (e?.currentTarget as HTMLElement | undefined)?.getBoundingClientRect();
                  setShapeGallery({ x: r ? r.left : 200, y: r ? r.bottom + 6 : 140 });
                }}
              />
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
              </Group>
              <Group label={selectedPages.length ? t('pg.orientSel', { n: selectedPages.length }) : t('pg.orientPage')}>
                <RBtn icon={RectangleVertical} label={t('common.portrait')} active={!selectedPages.length && pageOrient === 'portrait'} onClick={() => setPagesOrientation('portrait')} />
                <RBtn icon={RectangleHorizontal} label={t('common.landscape')} active={!selectedPages.length && pageOrient === 'landscape'} onClick={() => setPagesOrientation('landscape')} />
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
              <Group label={t('tplm.short')}>
                <RBtn icon={LayoutTemplate} label={t('tplm.create')} onClick={() => setTemplateDialog(selectedPages.length ? 'selection' : 'document')} />
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
                <RBtn icon={ZoomOut} label={t('vw.zoomOut')} onClick={() => zoomBy(1 / 1.15)} />
                <span className="text-xs font-semibold w-12 text-center">{Math.round(zoom * 100)} %</span>
                <RBtn icon={ZoomIn} label={t('vw.zoomIn')} onClick={() => zoomBy(1.15)} />
                <RBtn icon={Maximize2} label={t('vw.fit')} active={autoFit} onClick={() => {
                  setAutoFit(true);
                  fitZoom();
                }} />
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
        )}
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
            <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {t('pg.pages')} ({doc.pages.length})
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSelectedPages(selectedPages.length === doc.pages.length ? [] : doc.pages.map((p) => p.id))}
                  title={t('pg.selectAll')}
                  className={`p-1 rounded-md ${selectedPages.length ? 'bg-brand-100 text-brand-800' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  <CheckSquare className="w-4 h-4" />
                </button>
                <button onClick={() => addPage()} title={t('pg.add')} className="p-1 rounded-md bg-brand-50 text-brand-700 hover:bg-brand-100">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            {selectedPages.length > 0 && (
              <div className="px-2 py-2 border-b border-slate-200 bg-brand-50 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-brand-900 px-1">
                  {t('pg.selectedN', { n: selectedPages.length })}
                  <button onClick={() => setSelectedPages([])} title={t('pg.clearSel')} className="p-0.5 rounded hover:bg-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  <MiniAction title={t('pg.duplicate')} onClick={() => duplicatePages(selectedPages)} icon={CopyPlus} />
                  <MiniAction title={t('common.portrait')} onClick={() => setPagesOrientation('portrait')} icon={RectangleVertical} />
                  <MiniAction title={t('common.landscape')} onClick={() => setPagesOrientation('landscape')} icon={RectangleHorizontal} />
                  <MiniAction title={t('pg.exportSel')} onClick={exportSelectedPdf} icon={Printer} />
                  <MiniAction title={t('tplm.fromSel')} onClick={() => setTemplateDialog('selection')} icon={LayoutTemplate} />
                  <MiniAction title={t('pg.delete')} onClick={() => deletePages(selectedPages)} icon={Trash2} danger />
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto op-scroll p-3" onMouseDown={(e) => {
              if (!(e.target as HTMLElement).closest('[data-page-gap]')) setInsertGap(null);
            }}>
              <button
                onClick={() => setEditingMaster(!editingMaster)}
                className={`w-full rounded-lg border px-2 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${
                  editingMaster ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-dashed border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> {t('pg.master')}
                {!!doc.master?.elements.length && <span className="ms-auto text-[10px] opacity-70">{doc.master.elements.length}</span>}
              </button>
              <PageGap index={0} active={insertGap === 0} onSelect={setInsertGap} onInsert={(g) => { setInsertGap(null); addPage(g - 1); }} label={t('pg.gapTip')} enter={t('pg.gapEnter')} />
              {doc.pages.map((pg, i) => {
                const checked = selectedPages.includes(pg.id);
                const land = pageOrientation(doc, pg) === 'landscape';
                return (
                  <div
                    key={pg.id}
                    className="group relative"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (!selectedPages.includes(pg.id)) {
                        setSelectedPages([]);
                        setPageIndex(i);
                        setEditingMaster(false);
                      }
                      setSelected([]);
                      setMenu({ x: e.clientX, y: e.clientY, kind: 'page', fromThumb: true });
                    }}
                  >
                    <button
                      onClick={(e) => {
                        setInsertGap(null);
                        onThumbClick(e, i);
                      }}
                      className={`w-full rounded-lg p-1.5 border-2 transition ${
                        checked ? 'border-brand-500 bg-brand-100/60' : i === safePageIndex && !editingMaster ? 'border-brand-600 bg-brand-50' : 'border-transparent hover:border-slate-300'
                      }`}
                    >
                      <div className="flex justify-center">
                        <LazyMount width={land ? 150 : 106} height={land ? Math.round((150 * 210) / 297) : Math.round((106 * 297) / 210)}>
                          <PagePreview doc={doc} pageIndex={i} width={land ? 150 : 106} flows={flows} pageLabel={pageLabelTpl} />
                        </LazyMount>
                      </div>
                      <div className="text-[11px] text-slate-600 mt-1 font-medium flex items-center justify-center gap-1">
                        {i + 1}
                        {land && <RectangleHorizontal className="w-3 h-3 text-slate-400" />}
                      </div>
                    </button>
                    <label
                      className={`absolute top-2 start-2 w-5 h-5 rounded-md bg-white/95 border shadow-sm flex items-center justify-center cursor-pointer ${
                        checked || selectedPages.length ? 'flex' : 'hidden group-hover:flex'
                      } ${checked ? 'border-brand-600' : 'border-slate-300'}`}
                      title={t('pg.check')}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input type="checkbox" checked={checked} onChange={() => togglePageCheck(pg.id)} className="accent-[#127a80] w-3.5 h-3.5 cursor-pointer" />
                    </label>
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
                    <PageGap index={i + 1} active={insertGap === i + 1} onSelect={setInsertGap} onInsert={(g) => { setInsertGap(null); addPage(g - 1); }} label={t('pg.gapTip')} enter={t('pg.gapEnter')} />
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        {/* ============ CANVAS ============ */}
        <div className="flex-1 flex flex-col min-w-0" dir="ltr">
          {showRulers && <HRuler zoom={zoom} sizePx={dims.width} scrollRef={scrollRef} pageRef={pageRef} />}
          <div className="flex-1 flex min-h-0">
            {showRulers && <VRuler zoom={zoom} sizePx={dims.height} scrollRef={scrollRef} pageRef={pageRef} />}
            <div
              ref={scrollRef}
              className="flex-1 overflow-auto op-scroll bg-slate-200/80"
              onMouseDown={onPageMouseDown}
              onContextMenu={onPageContextMenu}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('Files')) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }
              }}
              onDrop={(e) => {
                const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
                if (!files.length) return;
                e.preventDefault();
                const p = toPage(e.clientX, e.clientY);
                insertImageFiles(files, p);
              }}
            >
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
            <span className="flex items-center gap-0.5">
              <button className="w-5 h-5 rounded hover:bg-slate-100 text-slate-600" title={t('vw.zoomOut')} onClick={() => zoomBy(1 / 1.15)}>
                −
              </button>
              <button
                className={`px-1.5 h-5 rounded hover:bg-slate-100 ${autoFit ? 'text-brand-700 font-semibold' : ''}`}
                title={t('vw.fitTip')}
                onClick={() => {
                  setAutoFit(true);
                  fitZoom();
                }}
              >
                {Math.round(zoom * 100)} %{autoFit ? ' · ' + t('vw.auto') : ''}
              </button>
              <button className="w-5 h-5 rounded hover:bg-slate-100 text-slate-600" title={t('vw.zoomIn')} onClick={() => zoomBy(1.15)}>
                +
              </button>
            </span>
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
              pageOrient={pageOrient}
              setPageOrient={(o) => setPagesOrientation(o, [page.id])}
              setAllOrient={setAllOrientation}
              toggleMaster={() => setEditingMaster(!editingMaster)}
            />
          )}
        </SidePanel>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={buildMenu()} onClose={() => setMenu(null)} />}
      {shapeGallery && (
        <ShapeGallery
          x={shapeGallery.x}
          y={shapeGallery.y}
          onClose={() => setShapeGallery(null)}
          onPick={(id) => {
            insertAtRef.current = shapeGallery.at ?? null;
            insertShape(id);
          }}
        />
      )}
      {templateDialog && (
        <SaveTemplateModal
          defaultName={doc.title}
          initialScope={templateDialog}
          scopes={[
            { scope: 'document', pages: doc.pages.length },
            { scope: 'page', pages: 1 },
            ...(selectedPages.length ? [{ scope: 'selection' as const, pages: selectedPages.length }] : [])
          ]}
          onClose={() => setTemplateDialog(null)}
          onSave={saveTemplate}
        />
      )}
    </div>
  );
}

function clampZoom(z: number) {
  return Math.min(4, Math.max(0.15, z));
}

/** Thin zone between two page thumbnails: hover shows a line, click selects it, Enter adds a page there. */
function PageGap({
  index,
  active,
  onSelect,
  onInsert,
  label,
  enter
}: {
  index: number;
  active: boolean;
  onSelect: (i: number) => void;
  onInsert: (i: number) => void;
  label: string;
  enter: string;
}) {
  return (
    <div
      data-page-gap
      role="button"
      tabIndex={-1}
      title={label}
      onClick={() => onSelect(index)}
      onDoubleClick={() => onInsert(index)}
      className="group/gap relative h-3 cursor-pointer"
    >
      <div
        className={`absolute inset-x-1 top-1/2 -translate-y-1/2 rounded-full transition-all ${
          active ? 'h-[3px] bg-brand-600' : 'h-[2px] bg-transparent group-hover/gap:bg-brand-300'
        }`}
      />
      {active && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center gap-1 pointer-events-none">
          <button
            className="pointer-events-auto w-5 h-5 rounded-full bg-brand-600 text-white text-xs leading-none shadow flex items-center justify-center hover:bg-brand-700"
            onClick={(e) => {
              e.stopPropagation();
              onInsert(index);
            }}
            title={label}
          >
            +
          </button>
          <span className="px-1.5 py-0.5 rounded bg-brand-600 text-white text-[10px] font-semibold shadow">↵ {enter}</span>
        </div>
      )}
    </div>
  );
}

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 80) || 'document';
}

function MiniAction({ icon: Icon, title, onClick, danger }: { icon: typeof Plus; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`p-1.5 rounded-md bg-white border border-brand-100 flex justify-center ${danger ? 'text-rose-600 hover:bg-rose-50' : 'text-brand-800 hover:bg-brand-100'}`}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}
