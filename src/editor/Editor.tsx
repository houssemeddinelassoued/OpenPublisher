import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  Undo2,
  Redo2,
  Check,
  History,
  HelpCircle,
  Info,
  Download,
  Printer,
  Image as ImageIcon,
  Copy,
  Clipboard,
  CopyPlus,
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
  Eye
} from 'lucide-react';
import { useI18n } from '../i18n';
import { AppLogo, LanguageSwitcher } from '../components/Brand';
import type { CanvasElementData, PageData, PageSizePreset, PubDocument } from '../core/model';
import { BLEED_MM, MARK_ZONE_MM, MM_TO_PX, PAGE_PRESETS, cloneDoc, elementBounds, getCanvasPixelDimensions, uid } from '../core/model';
import { computeDocumentFlows, findEl, pageOfElement, unlinkReferences, type FrameFlow } from '../core/textflow';
import { exportPagePng, exportPrintPdf, pageNumberLabel } from '../core/render';
import { downloadBlob } from '../core/db';
import { ElementContent, PagePreview, TableView, elementStyle } from './ElementView';
import {
  HANDLES,
  HANDLE_CURSOR,
  alignElements,
  readImageFile,
  rectsIntersect,
  resizeElement,
  smartSnap,
  unionBounds,
  type AlignOp,
  type Box,
  type Handle
} from './geometry';

export interface EditorProps {
  doc: PubDocument;
  onChange: (doc: PubDocument) => void;
  onClose: () => void;
  onImportFile: () => void;
  onShowVersions: () => void;
  notify: (msg: string) => void;
  openHelp: () => void;
  openAbout: () => void;
}

type Tab = 'home' | 'insert' | 'arrange' | 'page' | 'view' | 'help';

type DragState =
  | null
  | {
      mode: 'move';
      startX: number;
      startY: number;
      orig: Map<string, CanvasElementData>;
      box: Box;
      recorded: boolean;
    }
  | { mode: 'resize'; handle: Handle; startX: number; startY: number; orig: CanvasElementData; recorded: boolean }
  | { mode: 'rotate'; orig: CanvasElementData; recorded: boolean }
  | { mode: 'marquee'; startX: number; startY: number; additive: string[] };

const FONTS: { v: string; l: string }[] = [
  { v: 'Inter, sans-serif', l: 'Inter' },
  { v: 'Arial, sans-serif', l: 'Arial' },
  { v: '"Segoe UI", sans-serif', l: 'Segoe UI' },
  { v: 'Tahoma, sans-serif', l: 'Tahoma (عربي)' },
  { v: 'Verdana, sans-serif', l: 'Verdana' },
  { v: '"Trebuchet MS", sans-serif', l: 'Trebuchet' },
  { v: 'Georgia, serif', l: 'Georgia' },
  { v: '"Times New Roman", serif', l: 'Times New Roman' },
  { v: '"Comic Sans MS", "Comic Neue", cursive', l: 'Comic Sans' },
  { v: '"Courier New", monospace', l: 'Courier' }
];

const BG_SWATCHES = ['#ffffff', '#fffbeb', '#fff7ed', '#fdf2f8', '#f5f3ff', '#ecfeff', '#ecfbfb', '#f0fdf4', '#f8fafc'];

export function Editor(props: EditorProps) {
  const { doc, onChange, notify } = props;
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
  const [past, setPast] = useState<PubDocument[]>([]);
  const [future, setFuture] = useState<PubDocument[]>([]);

  const docRef = useRef(doc);
  docRef.current = doc;
  const dragRef = useRef<DragState>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const replaceImageRef = useRef<HTMLInputElement | null>(null);
  const lastRecord = useRef<{ key: string; at: number }>({ key: '', at: 0 });

  const safePageIndex = Math.min(pageIndex, doc.pages.length - 1);
  const page: PageData = doc.pages[safePageIndex];
  const dims = getCanvasPixelDimensions(doc);
  const marginPx = doc.marginMm * MM_TO_PX;
  const pageLabelTpl = t('ed.pageLabel');
  const flows = useMemo(() => computeDocumentFlows(doc), [doc]);

  const layerEls: CanvasElementData[] = editingMaster ? doc.master?.elements ?? [] : page.elements;
  const selectedEls = layerEls.filter((e) => selected.includes(e.id));
  const single = selectedEls.length === 1 ? selectedEls[0] : null;

  // ---------------------------------------------------------------- history / commit
  /**
   * Applies a change. `record`: false = no undo step, string = coalescing key
   * (successive changes with the same key within 1 s form one undo step).
   */
  const commit = useCallback(
    (next: PubDocument, record: boolean | string = true) => {
      const prev = docRef.current;
      if (record !== false) {
        const key = typeof record === 'string' ? record : '';
        const now = Date.now();
        const coalesce = key && lastRecord.current.key === key && now - lastRecord.current.at < 1000;
        lastRecord.current = { key, at: now };
        if (!coalesce) {
          setPast((p) => [...p.slice(-60), prev]);
          setFuture([]);
        }
      }
      const updated = { ...next, updatedAt: new Date().toISOString() };
      docRef.current = updated;
      onChange(updated);
    },
    [onChange]
  );

  const pushUndo = useCallback(() => {
    setPast((p) => [...p.slice(-60), docRef.current]);
    setFuture([]);
    lastRecord.current = { key: '', at: 0 };
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [docRef.current, ...f]);
      docRef.current = prev;
      onChange(prev);
      return p.slice(0, -1);
    });
    lastRecord.current = { key: '', at: 0 };
  }, [onChange]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setPast((p) => [...p, docRef.current]);
      docRef.current = next;
      onChange(next);
      return f.slice(1);
    });
  }, [onChange]);

  /** Updates the element list of the layer being edited (page or master). */
  const setLayer = useCallback(
    (fn: (els: CanvasElementData[]) => CanvasElementData[], record: boolean | string = true) => {
      const d = docRef.current;
      if (editingMaster) {
        commit({ ...d, master: { elements: fn(d.master?.elements ?? []) } }, record);
      } else {
        commit(
          { ...d, pages: d.pages.map((p, i) => (i === safePageIndex ? { ...p, elements: fn(p.elements) } : p)) },
          record
        );
      }
    },
    [commit, editingMaster, safePageIndex]
  );

  const patchEls = useCallback(
    (ids: string[], patch: Partial<CanvasElementData> | ((e: CanvasElementData) => Partial<CanvasElementData>), record: boolean | string = true) => {
      setLayer((els) => els.map((e) => (ids.includes(e.id) ? { ...e, ...(typeof patch === 'function' ? patch(e) : patch) } : e)), record);
    },
    [setLayer]
  );

  const patchPage = (patch: Partial<PageData>) => {
    const d = docRef.current;
    commit({ ...d, pages: d.pages.map((p, i) => (i === safePageIndex ? { ...p, ...patch } : p)) });
  };

  // Reset selection when switching page / layer.
  useEffect(() => {
    setSelected([]);
    setEditingTextId(null);
  }, [safePageIndex, editingMaster]);

  // ---------------------------------------------------------------- element ops
  const addElement = (partial: Omit<CanvasElementData, 'id' | 'zIndex' | 'x' | 'y'> & { x?: number; y?: number }) => {
    const maxZ = layerEls.reduce((a, e) => Math.max(a, e.zIndex), 0);
    const el: CanvasElementData = {
      ...partial,
      x: partial.x ?? Math.round((dims.width - partial.width) / 2),
      y: partial.y ?? Math.round((dims.height - partial.height) / 3),
      id: uid(),
      zIndex: maxZ + 1
    };
    setLayer((els) => [...els, el]);
    setSelected([el.id]);
    return el;
  };

  const deleteSelection = useCallback(() => {
    if (!selected.length) return;
    const ids = new Set(selected);
    const d = docRef.current;
    let next: PubDocument = editingMaster
      ? { ...d, master: { elements: (d.master?.elements ?? []).filter((e) => !ids.has(e.id)) } }
      : { ...d, pages: d.pages.map((p, i) => (i === safePageIndex ? { ...p, elements: p.elements.filter((e) => !ids.has(e.id)) } : p)) };
    next = unlinkReferences(next, ids);
    commit(next);
    setSelected([]);
    setEditingTextId(null);
    notify(t('n.deleted'));
  }, [commit, editingMaster, notify, safePageIndex, selected, t]);

  const copySelection = useCallback(() => {
    if (!selectedEls.length) return;
    setClipboard(cloneDoc(selectedEls));
    notify(t('n.copied'));
  }, [notify, selectedEls, t]);

  const pasteClipboard = useCallback(
    (source?: CanvasElementData[]) => {
      const src = source ?? clipboard;
      if (!src.length) return;
      const maxZ = layerEls.reduce((a, e) => Math.max(a, e.zIndex), 0);
      const created = src.map((e, i) => ({
        ...cloneDoc(e),
        id: uid(),
        x: e.x + 16,
        y: e.y + 16,
        zIndex: maxZ + 1 + i,
        nextFrameId: undefined
      }));
      setLayer((els) => [...els, ...created]);
      setSelected(created.map((c) => c.id));
      if (!source) {
        setClipboard(created);
        notify(t('n.pasted'));
      }
    },
    [clipboard, layerEls, notify, setLayer, t]
  );

  const reorder = (dir: 'front' | 'back') => {
    if (!selected.length) return;
    const zs = layerEls.map((e) => e.zIndex);
    const max = Math.max(0, ...zs);
    const min = Math.min(0, ...zs);
    patchEls(selected, (e) => ({ zIndex: dir === 'front' ? max + 1 + selected.indexOf(e.id) : min - 1 - selected.indexOf(e.id) }));
  };

  const align = (op: AlignOp) => {
    const map = alignElements(selectedEls, op, { w: dims.width, h: dims.height });
    if (map.size) patchEls([...map.keys()], (e) => map.get(e.id)!);
  };

  const rotateBy = (deg: number) => patchEls(selected, (e) => ({ rotation: (((e.rotation || 0) + deg) % 360 + 360) % 360 }));

  // ---------------------------------------------------------------- linked frames
  const tryLink = (fromId: string, toId: string) => {
    if (fromId === toId) return notify(t('ar.linkSame'));
    const d = docRef.current;
    // Reject cycles: walking from the target must never reach the source.
    let cur = findEl(d, toId);
    const seen = new Set<string>();
    while (cur?.nextFrameId && !seen.has(cur.id)) {
      if (cur.nextFrameId === fromId) return notify(t('ar.linkCycle'));
      seen.add(cur.id);
      cur = findEl(d, cur.nextFrameId);
    }
    // A frame can only be the continuation of one frame: detach previous source.
    const fix = (els: CanvasElementData[]) =>
      els.map((e) =>
        e.id === fromId ? { ...e, nextFrameId: toId } : e.nextFrameId === toId ? { ...e, nextFrameId: undefined } : e
      );
    commit({
      ...d,
      pages: d.pages.map((p) => ({ ...p, elements: fix(p.elements) })),
      master: d.master ? { elements: fix(d.master.elements) } : d.master
    });
    setLinkFrom(null);
    setSelected([toId]);
    notify(t('ar.linked'));
  };

  const unlink = () => {
    if (!single) return;
    patchEls([single.id], { nextFrameId: undefined });
    notify(t('ar.unlinked'));
  };

  // ---------------------------------------------------------------- pages
  const addPage = () => {
    const d = docRef.current;
    const np: PageData = { id: uid('page'), name: '', background: '#ffffff', backgroundPattern: 'none', elements: [] };
    const pages = [...d.pages];
    pages.splice(safePageIndex + 1, 0, np);
    commit({ ...d, pages });
    setPageIndex(safePageIndex + 1);
    setEditingMaster(false);
    notify(t('n.pageAdded'));
  };

  const duplicatePage = () => {
    const d = docRef.current;
    const src = d.pages[safePageIndex];
    const idMap = new Map<string, string>();
    for (const e of src.elements) idMap.set(e.id, uid());
    const np: PageData = {
      ...cloneDoc(src),
      id: uid('page'),
      elements: src.elements.map((e) => ({
        ...cloneDoc(e),
        id: idMap.get(e.id)!,
        nextFrameId: e.nextFrameId ? idMap.get(e.nextFrameId) : undefined
      }))
    };
    const pages = [...d.pages];
    pages.splice(safePageIndex + 1, 0, np);
    commit({ ...d, pages });
    setPageIndex(safePageIndex + 1);
    notify(t('n.pageDup'));
  };

  const deletePage = (idx = safePageIndex) => {
    const d = docRef.current;
    if (d.pages.length <= 1) return notify(t('pg.lastPage'));
    const removed = new Set(d.pages[idx].elements.map((e) => e.id));
    const next = unlinkReferences({ ...d, pages: d.pages.filter((_, i) => i !== idx) }, removed);
    commit(next);
    setPageIndex(Math.max(0, Math.min(idx, next.pages.length - 1)));
    notify(t('n.pageDeleted'));
  };

  const movePage = (idx: number, dir: -1 | 1) => {
    const d = docRef.current;
    const j = idx + dir;
    if (j < 0 || j >= d.pages.length) return;
    const pages = [...d.pages];
    [pages[idx], pages[j]] = [pages[j], pages[idx]];
    commit({ ...d, pages });
    setPageIndex(j);
  };

  // ---------------------------------------------------------------- pointer handling
  const toPage = (clientX: number, clientY: number) => {
    const r = pageRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / zoom, y: (clientY - r.top) / zoom };
  };

  const startMove = (e: React.MouseEvent, ids: string[]) => {
    const orig = new Map(layerEls.filter((x) => ids.includes(x.id)).map((x) => [x.id, x]));
    dragRef.current = {
      mode: 'move',
      startX: e.clientX,
      startY: e.clientY,
      orig,
      box: unionBounds([...orig.values()]) ?? { x: 0, y: 0, w: 0, h: 0 },
      recorded: false
    };
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
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = { mode: 'resize', handle, startX: e.clientX, startY: e.clientY, orig: el, recorded: false };
  };

  const startRotate = (e: React.MouseEvent, el: CanvasElementData) => {
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
        const box = {
          x: Math.min(st.startX, p.x),
          y: Math.min(st.startY, p.y),
          w: Math.abs(p.x - st.startX),
          h: Math.abs(p.y - st.startY)
        };
        setMarquee(box);
        if (box.w > 3 || box.h > 3) {
          const hits = layerEls.filter((x) => rectsIntersect(box, elementBounds(x))).map((x) => x.id);
          setSelected([...new Set([...st.additive, ...hits])]);
        }
        return;
      }
      if (!st.recorded) {
        pushUndo();
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
          const snappedX = res.guidesX.length > 0;
          const snappedY = res.guidesY.length > 0;
          dx = snappedX ? res.dx : Math.round((st.box.x + dx) / grid) * grid - st.box.x;
          dy = snappedY ? res.dy : Math.round((st.box.y + dy) / grid) * grid - st.box.y;
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
      const tg = e.target as HTMLElement | null;
      const tag = tg?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || tg?.isContentEditable) return;
      if (document.querySelector('[data-modal-open]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
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
      } else if (mod && k === 'v') {
        if (clipboard.length) {
          e.preventDefault();
          pasteClipboard();
        }
      } else if (mod && k === 'd') {
        e.preventDefault();
        if (selectedEls.length) pasteClipboard(selectedEls);
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
        patchEls(selected, (x) => ({ x: x.x + dx, y: x.y + dy }), 'nudge');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clipboard.length, copySelection, deleteSelection, layerEls, pasteClipboard, patchEls, redo, selected, selectedEls, single, undo]);

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
      await exportPrintPdf(docRef.current, {
        title: t('ed.exporting'),
        printBtn: t('ed.printBtn'),
        pageLabel: pageLabelTpl,
        popupBlocked: t('ed.popupBlocked')
      });
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
        patchEls([replaceId], { imageUrl: img.url });
      } else {
        const s = Math.min(1, 360 / Math.max(img.w, img.h));
        addElement({ type: 'image', width: Math.round(img.w * s), height: Math.round(img.h * s), imageUrl: img.url, strokeWidth: 0 });
      }
    } catch {
      notify(t('n.importFail'));
    }
  };

  // ---------------------------------------------------------------- render helpers
  const pageText = pageNumberLabel(safePageIndex, doc.pages.length, pageLabelTpl);
  const off = doc.printMarks ? (BLEED_MM + MARK_ZONE_MM) * MM_TO_PX : 0;
  const bleedPx = BLEED_MM * MM_TO_PX;
  const masterEls = doc.master && !page.hideMaster ? doc.master.elements : [];
  const textStyle = single && (single.type === 'text' || single.type === 'pagenum' || single.type === 'table');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'home', label: t('tab.home') },
    { id: 'insert', label: t('tab.insert') },
    { id: 'arrange', label: t('tab.arrange') },
    { id: 'page', label: t('tab.page') },
    { id: 'view', label: t('tab.view') },
    { id: 'help', label: t('tab.help') }
  ];

  const setDocField = (patch: Partial<PubDocument>) => commit({ ...docRef.current, ...patch });

  return (
    <div className="h-full flex flex-col bg-slate-100 text-slate-900 select-none">
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onImagePicked(e)} />
      <input
        ref={replaceImageRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => single && onImagePicked(e, single.id)}
      />

      {/* ============ TOP BAR ============ */}
      <header className="bg-brand-900 text-white px-3 py-2 flex items-center gap-2 z-30">
        <button
          onClick={props.onClose}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold"
        >
          <ChevronLeft className="w-4 h-4 rtl:rotate-180" /> {t('ed.back')}
        </button>
        <AppLogo size={28} className="rounded-md ms-1" />
        <input
          value={doc.title}
          onChange={(e) => commit({ ...docRef.current, title: e.target.value }, 'title')}
          className="bg-transparent hover:bg-white/10 focus:bg-white/10 px-2 py-1 rounded text-sm font-semibold focus:outline-none border border-transparent focus:border-aqua min-w-0 w-64"
          dir="auto"
        />
        <span className="hidden lg:inline-flex items-center gap-1 text-[11px] text-aqua">
          <Check className="w-3 h-3" /> {t('ed.saved')}
        </span>
        <div className="flex items-center gap-1 ms-1">
          <TopIcon title={t('ed.undo')} disabled={!past.length} onClick={undo}>
            <Undo2 className="w-4 h-4 rtl:-scale-x-100" />
          </TopIcon>
          <TopIcon title={t('ed.redo')} disabled={!future.length} onClick={redo}>
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
        <button
          disabled={busy}
          onClick={doPdf}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-xs font-bold disabled:opacity-50"
        >
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
                <RBtn icon={Clipboard} label={t('rb.paste')} disabled={!clipboard.length} onClick={() => pasteClipboard()} />
                <RBtn icon={Copy} label={t('rb.copy')} disabled={!selected.length} onClick={copySelection} />
                <RBtn icon={CopyPlus} label={t('rb.duplicate')} disabled={!selected.length} onClick={() => pasteClipboard(selectedEls)} />
                <RBtn icon={Trash2} label={t('rb.delete')} disabled={!selected.length} onClick={deleteSelection} danger />
              </Group>
              <Group label={t('rb.text')}>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <select
                      disabled={!textStyle}
                      value={single?.fontFamily || 'Inter, sans-serif'}
                      onChange={(e) => patchEls(selected, { fontFamily: e.target.value })}
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
                      onChange={(e) => patchEls(selected, { fontSize: Math.max(6, Number(e.target.value)) }, 'fs')}
                      className="w-14 px-1.5 py-1 text-xs border border-slate-300 rounded disabled:opacity-40"
                      title={t('rb.size')}
                    />
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Toggle on={!!single?.bold} disabled={!textStyle} title={t('rb.bold')} onClick={() => patchEls(selected, { bold: !single?.bold })}>
                      <Bold className="w-3.5 h-3.5" />
                    </Toggle>
                    <Toggle on={!!single?.italic} disabled={!textStyle} title={t('rb.italic')} onClick={() => patchEls(selected, { italic: !single?.italic })}>
                      <Italic className="w-3.5 h-3.5" />
                    </Toggle>
                    <Toggle on={!!single?.underline} disabled={!textStyle} title={t('rb.underline')} onClick={() => patchEls(selected, { underline: !single?.underline })}>
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
                      <Toggle key={a} on={single?.textAlign === a} disabled={!textStyle} title={t(k)} onClick={() => patchEls(selected, { textAlign: a })}>
                        <Icon className="w-3.5 h-3.5" />
                      </Toggle>
                    ))}
                  </div>
                </div>
                <ColorPick
                  label={t('rb.textColor')}
                  disabled={!textStyle}
                  value={single?.fontColor || '#0f172a'}
                  onChange={(v) => patchEls(selected, { fontColor: v }, 'color')}
                />
              </Group>
              <Group label={t('rb.fill')}>
                <ColorPick
                  label={t('rb.fill')}
                  disabled={!selected.length}
                  value={single?.fillColor && single.fillColor !== 'transparent' ? single.fillColor : '#ffffff'}
                  onChange={(v) => patchEls(selected, { fillColor: v }, 'fill')}
                />
                <button
                  disabled={!selected.length}
                  onClick={() => patchEls(selected, { fillColor: 'transparent' })}
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
              <RBtn
                icon={Type}
                label={t('ins.text')}
                onClick={() =>
                  addElement({
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
                  })
                }
              />
              <RBtn icon={ImagePlus} label={t('ins.image')} onClick={() => imageInputRef.current?.click()} />
              <Sep />
              <RBtn
                icon={Square}
                label={t('ins.rect')}
                onClick={() =>
                  addElement({ type: 'shape', shapeVariant: 'rectangle', width: 220, height: 130, fillColor: '#d0f4f4', strokeColor: '#127a80', strokeWidth: 2, borderRadius: 8 })
                }
              />
              <RBtn
                icon={Circle}
                label={t('ins.circle')}
                onClick={() =>
                  addElement({ type: 'shape', shapeVariant: 'circle', width: 150, height: 150, fillColor: '#fef3c7', strokeColor: '#d97706', strokeWidth: 2 })
                }
              />
              <RBtn
                icon={Minus}
                label={t('ins.line')}
                onClick={() => addElement({ type: 'shape', shapeVariant: 'line', width: 400, height: 16, strokeColor: '#127a80', strokeWidth: 3 })}
              />
              <RBtn
                icon={Table}
                label={t('ins.table')}
                onClick={() =>
                  addElement({
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
                    tableData: [
                      [t('ins.header'), t('ins.header'), t('ins.header')],
                      ['', '', ''],
                      ['', '', ''],
                      ['', '', '']
                    ]
                  })
                }
              />
              <Sep />
              <RBtn
                icon={Hash}
                label={t('ins.pagenum')}
                onClick={() =>
                  addElement({
                    type: 'pagenum',
                    width: 160,
                    height: 30,
                    y: dims.height - 56,
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 12,
                    fontColor: '#475569',
                    textAlign: 'center'
                  })
                }
              />
              <RBtn
                icon={Frame}
                label={t('ins.border')}
                onClick={() =>
                  addElement({
                    type: 'border',
                    x: 24,
                    y: 24,
                    width: dims.width - 48,
                    height: dims.height - 48,
                    strokeColor: '#127a80',
                    strokeWidth: 3,
                    borderPreset: 'double'
                  })
                }
              />
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
                    onChange={(e) => single && patchEls([single.id], { rotation: ((Number(e.target.value) % 360) + 360) % 360 }, 'rot')}
                    className="w-16 px-1.5 py-1 text-xs border border-slate-300 rounded disabled:opacity-40"
                  />
                  <button
                    disabled={!selected.length}
                    onClick={() => patchEls(selected, { rotation: 0 })}
                    className="text-[10px] text-brand-700 hover:underline disabled:opacity-40"
                  >
                    {t('ar.rotReset')}
                  </button>
                </div>
              </Group>
              <Group label={t('ar.links')}>
                <RBtn
                  icon={Link2}
                  label={t('ar.link')}
                  disabled={single?.type !== 'text'}
                  active={!!linkFrom}
                  onClick={() => {
                    if (single?.type === 'text') {
                      setLinkFrom(single.id);
                      notify(t('ar.linkPick'));
                    }
                  }}
                />
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
                    if (v === 'Custom') setDocField({ pageSize: v });
                    else setDocField({ pageSize: v, widthMm: PAGE_PRESETS[v][0], heightMm: PAGE_PRESETS[v][1] });
                  }}
                  className="px-2 py-1 text-xs border border-slate-300 rounded"
                >
                  <option value="A4">A4</option>
                  <option value="A5">A5</option>
                  <option value="A3">A3</option>
                  <option value="Letter">Letter</option>
                  <option value="Custom">{t('pg.custom')}</option>
                </select>
                {doc.pageSize === 'Custom' && (
                  <>
                    <input
                      type="number"
                      value={doc.widthMm}
                      onChange={(e) => setDocField({ widthMm: Math.max(50, Number(e.target.value)) })}
                      className="w-16 px-1.5 py-1 text-xs border border-slate-300 rounded"
                    />
                    ×
                    <input
                      type="number"
                      value={doc.heightMm}
                      onChange={(e) => setDocField({ heightMm: Math.max(50, Number(e.target.value)) })}
                      className="w-16 px-1.5 py-1 text-xs border border-slate-300 rounded"
                    />
                  </>
                )}
                <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                  {(['portrait', 'landscape'] as const).map((o) => (
                    <button
                      key={o}
                      onClick={() => setDocField({ orientation: o })}
                      className={`px-2.5 py-1 text-xs rounded-md ${doc.orientation === o ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
                    >
                      {o === 'portrait' ? t('common.portrait') : t('common.landscape')}
                    </button>
                  ))}
                </div>
              </Group>
              <Group label={t('pg.margins')}>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={doc.marginMm}
                  onChange={(e) => setDocField({ marginMm: Math.max(0, Number(e.target.value)) })}
                  className="w-14 px-1.5 py-1 text-xs border border-slate-300 rounded"
                />
              </Group>
              <Group label={t('pg.background')}>
                <div className="grid grid-cols-5 gap-1">
                  {BG_SWATCHES.map((c) => (
                    <button
                      key={c}
                      onClick={() => patchPage({ background: c })}
                      className={`w-5 h-5 rounded border ${page.background === c ? 'ring-2 ring-brand-500' : 'border-slate-300'}`}
                      style={{ background: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={page.background || '#ffffff'}
                    onChange={(e) => patchPage({ background: e.target.value })}
                    className="w-5 h-5 rounded cursor-pointer"
                  />
                </div>
              </Group>
              <Group label={t('pg.pages')}>
                <RBtn icon={Plus} label={t('pg.add')} onClick={addPage} />
                <RBtn icon={CopyPlus} label={t('pg.duplicate')} onClick={duplicatePage} />
                <RBtn icon={Trash2} label={t('pg.delete')} onClick={() => deletePage()} danger disabled={doc.pages.length <= 1} />
              </Group>
              <Group label={t('pg.master')}>
                <RBtn
                  icon={Layers}
                  label={editingMaster ? t('pg.exitMaster') : t('pg.editMaster')}
                  active={editingMaster}
                  onClick={() => setEditingMaster(!editingMaster)}
                />
                <RBtn
                  icon={page.hideMaster ? Eye : EyeOff}
                  label={t('pg.hideMaster')}
                  active={!!page.hideMaster}
                  onClick={() => patchPage({ hideMaster: !page.hideMaster })}
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
              <Sep />
              <RBtn icon={Crop} label={t('vw.marks')} title={t('vw.marksTip')} active={!!doc.printMarks} onClick={() => setDocField({ printMarks: !doc.printMarks })} />
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
          <button
            onClick={() => (linkFrom ? setLinkFrom(null) : setEditingMaster(false))}
            className="ms-auto inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/70 hover:bg-white"
          >
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
              <button onClick={addPage} title={t('pg.add')} className="p-1 rounded-md bg-brand-50 text-brand-700 hover:bg-brand-100">
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
                <div key={pg.id} className="group relative">
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
          {showRulers && <HRuler zoom={zoom} widthPx={dims.width} scrollRef={scrollRef} pageRef={pageRef} />}
          <div className="flex-1 flex min-h-0">
            {showRulers && <VRuler zoom={zoom} heightPx={dims.height} scrollRef={scrollRef} pageRef={pageRef} />}
            <div ref={scrollRef} className="flex-1 overflow-auto op-scroll bg-slate-200/80" onMouseDown={onPageMouseDown}>
              <div className="min-w-full min-h-full flex items-start justify-center p-10 w-max">
                <div
                  className="relative shrink-0"
                  style={{ width: (dims.width + off * 2) * zoom, height: (dims.height + off * 2) * zoom }}
                >
                  {/* Print marks layer (outside the page) */}
                  {doc.printMarks && (
                    <PrintMarksOverlay w={dims.width} h={dims.height} off={off} bleed={bleedPx} zoom={zoom} bg={page.background} />
                  )}
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
                      <div className="absolute inset-0" style={{ zIndex: 0, opacity: editingMaster ? 1 : 1 }}>
                        {(editingMaster ? doc.master?.elements ?? [] : masterEls).map((el) =>
                          editingMaster ? (
                            <EditableElement
                              key={el.id}
                              el={el}
                              flowLines={flows.get(el.id)}
                              pageText={pageText}
                              editing={editingTextId === el.id}
                              onMouseDown={(e) => onElementMouseDown(e, el)}
                              onDoubleClick={() => el.type === 'text' && setEditingTextId(el.id)}
                              onText={(v) => patchEls([el.id], { text: v }, 'type')}
                              onCell={(r, c, v) =>
                                patchEls([el.id], { tableData: el.tableData!.map((row, ri) => (ri === r ? row.map((x, ci) => (ci === c ? v : x)) : row)) }, 'cell')
                              }
                            />
                          ) : (
                            <div key={el.id} style={{ ...elementStyle(el), pointerEvents: 'none' }}>
                              <ElementContent el={el} flow={flows.get(el.id)} pageText={pageText} />
                            </div>
                          )
                        )}
                      </div>
                      {/* Page layer */}
                      <div
                        className="absolute inset-0"
                        style={{ zIndex: 1, opacity: editingMaster ? 0.25 : 1, pointerEvents: editingMaster ? 'none' : undefined }}
                      >
                        {page.elements.map((el) => (
                          <EditableElement
                            key={el.id}
                            el={el}
                            flowLines={flows.get(el.id)}
                            pageText={pageText}
                            editing={editingTextId === el.id}
                            linkTarget={!!linkFrom && el.type === 'text' && el.id !== linkFrom}
                            onMouseDown={(e) => onElementMouseDown(e, el)}
                            onDoubleClick={() => {
                              if (el.type !== 'text') return;
                              const f = flows.get(el.id);
                              if (f && f.chainIndex > 0) {
                                // Continuation frame: edit the story from its first frame when visible.
                                if (page.elements.some((x) => x.id === f.storyHeadId)) {
                                  setSelected([f.storyHeadId]);
                                  setEditingTextId(f.storyHeadId);
                                } else notify(t('insp.storyHint'));
                                return;
                              }
                              setEditingTextId(el.id);
                            }}
                            onText={(v) => patchEls([el.id], { text: v }, 'type')}
                            onCell={(r, c, v) =>
                              patchEls([el.id], { tableData: el.tableData!.map((row, ri) => (ri === r ? row.map((x, ci) => (ci === c ? v : x)) : row)) }, 'cell')
                            }
                          />
                        ))}
                      </div>

                      {/* Overlays */}
                      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
                        {showMargins && marginPx > 0 && (
                          <div
                            className="absolute border border-dashed border-brand-400/60"
                            style={{ left: marginPx, top: marginPx, right: marginPx, bottom: marginPx }}
                          />
                        )}
                        <FlowArrows els={layerEls} doc={doc} selected={selected} zoom={zoom} />
                        {layerEls.map((el) => {
                          const f = flows.get(el.id);
                          return f?.overflow ? (
                            <div key={`of-${el.id}`} style={{ ...elementStyle(el), zIndex: undefined, opacity: 1 }}>
                              <div
                                className="absolute -bottom-2.5 -right-2.5 w-5 h-5 rounded bg-rose-600 text-white flex items-center justify-center font-bold shadow"
                                style={{ fontSize: 14 / zoom > 14 ? 14 : 14, transform: `scale(${1 / zoom})` }}
                                title={t('insp.overflow')}
                              >
                                +
                              </div>
                            </div>
                          ) : null;
                        })}
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
            <span className="ms-auto">{t('insp.keyboardHint')}</span>
          </div>
        </div>

        {/* ============ INSPECTOR ============ */}
        <Inspector
          doc={doc}
          single={single}
          selectedEls={selectedEls}
          flows={flows}
          page={page}
          editingMaster={editingMaster}
          patch={(p, rec) => patchEls(selected, p, rec)}
          align={align}
          onReplaceImage={() => replaceImageRef.current?.click()}
          onClose={() => setSelected([])}
          onPatchPage={patchPage}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================
function clampZoom(z: number) {
  return Math.min(4, Math.max(0.15, z));
}

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 80) || 'document';
}

function TopIcon({ children, onClick, title, disabled }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-stretch pe-3 me-2 border-e border-slate-200 shrink-0">
      <div className="flex items-center gap-1.5 flex-1">{children}</div>
      <div className="text-[9px] uppercase tracking-wider text-slate-400 text-center mt-0.5">{label}</div>
    </div>
  );
}

function Sep() {
  return <span className="w-px self-stretch bg-slate-200 mx-1.5 shrink-0" />;
}

function RBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
  danger,
  title
}: {
  icon: typeof Type;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg min-w-[52px] text-[10px] leading-tight shrink-0 disabled:opacity-35 ${
        active ? 'bg-brand-100 text-brand-900 ring-1 ring-brand-300' : danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      <Icon className={`w-[18px] h-[18px] ${danger ? '' : 'text-brand-700'}`} />
      <span className="max-w-[84px] text-center">{label}</span>
    </button>
  );
}

function Toggle({ children, on, onClick, disabled, title }: { children: React.ReactNode; on?: boolean; onClick: () => void; disabled?: boolean; title: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`p-1.5 rounded disabled:opacity-35 ${on ? 'bg-brand-700 text-white' : 'text-slate-700 hover:bg-slate-200'}`}
    >
      {children}
    </button>
  );
}

function ColorPick({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className={`flex flex-col items-center gap-0.5 text-[10px] text-slate-600 ${disabled ? 'opacity-35 pointer-events-none' : 'cursor-pointer'}`}>
      <input type="color" value={toHex(value)} onChange={(e) => onChange(e.target.value)} className="w-7 h-7 rounded border border-slate-300 cursor-pointer" />
      {label}
    </label>
  );
}

function toHex(c: string) {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map((x) => x + x).join('');
  return '#ffffff';
}

function MiniBtn({ children, onClick, title, disabled }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      title={title}
      className="p-0.5 rounded bg-white/95 border border-slate-200 text-slate-600 hover:text-brand-700 disabled:opacity-30 shadow-sm"
    >
      {children}
    </button>
  );
}

function EditableElement({
  el,
  flowLines,
  pageText,
  editing,
  linkTarget,
  onMouseDown,
  onDoubleClick,
  onText,
  onCell
}: {
  el: CanvasElementData;
  flowLines?: FrameFlow;
  pageText: string;
  editing: boolean;
  linkTarget?: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onText: (v: string) => void;
  onCell: (r: number, c: number, v: string) => void;
}) {
  const fs = el.fontSize || 16;
  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
      style={{ ...elementStyle(el), cursor: linkTarget ? 'copy' : editing ? 'text' : 'move' }}
      className={`${linkTarget ? 'outline-2 outline-dashed outline-brand-500' : 'hover:outline hover:outline-1 hover:outline-brand-300'}`}
    >
      {editing && el.type === 'text' ? (
        <textarea
          autoFocus
          value={el.text || ''}
          dir="auto"
          onChange={(e) => onText(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-full h-full resize-none bg-white/90 focus:outline-none box-border"
          style={{
            fontFamily: el.fontFamily || 'Inter, sans-serif',
            fontSize: fs,
            color: el.fontColor || '#0f172a',
            fontWeight: el.bold ? 700 : 400,
            fontStyle: el.italic ? 'italic' : 'normal',
            textAlign: el.textAlign === 'justify' ? 'justify' : el.textAlign || 'left',
            lineHeight: 1.32,
            padding: 6
          }}
        />
      ) : el.type === 'table' ? (
        <TableView el={el} onCellChange={onCell} />
      ) : (
        <ElementContent el={el} flow={flowLines} pageText={pageText} />
      )}
    </div>
  );
}

function SelectionBox({
  el,
  zoom,
  showHandles,
  onResize,
  onRotate
}: {
  el: CanvasElementData;
  zoom: number;
  showHandles: boolean;
  onResize: (e: React.MouseEvent, h: Handle) => void;
  onRotate: (e: React.MouseEvent) => void;
}) {
  const hs = 10 / zoom;
  const pos: Record<Handle, React.CSSProperties> = {
    nw: { left: 0, top: 0 },
    n: { left: '50%', top: 0 },
    ne: { left: '100%', top: 0 },
    e: { left: '100%', top: '50%' },
    se: { left: '100%', top: '100%' },
    s: { left: '50%', top: '100%' },
    sw: { left: 0, top: '100%' },
    w: { left: 0, top: '50%' }
  };
  const isLine = el.type === 'shape' && el.shapeVariant === 'line';
  return (
    <div style={{ ...elementStyle(el), zIndex: undefined, opacity: 1 }}>
      <div className="absolute inset-0" style={{ outline: `${1.5 / zoom}px solid #127a80` }} />
      {showHandles && (
        <>
          {/* rotation handle */}
          <div className="absolute left-1/2" style={{ top: -28 / zoom, width: 1 / zoom, height: 28 / zoom, background: '#127a80' }} />
          <div
            onMouseDown={onRotate}
            title="Rotation (Shift = 15°)"
            className="absolute rounded-full bg-white pointer-events-auto cursor-grab"
            style={{
              left: '50%',
              top: -28 / zoom,
              width: 14 / zoom,
              height: 14 / zoom,
              transform: 'translate(-50%, -50%)',
              border: `${2 / zoom}px solid #127a80`
            }}
          />
          {HANDLES.filter((h) => !isLine || h === 'e' || h === 'w').map((h) => (
            <div
              key={h}
              onMouseDown={(e) => onResize(e, h)}
              className="absolute bg-white pointer-events-auto"
              style={{
                ...pos[h],
                width: hs,
                height: hs,
                transform: 'translate(-50%, -50%)',
                border: `${1.5 / zoom}px solid #127a80`,
                borderRadius: h.length === 2 ? 2 / zoom : '50%',
                cursor: HANDLE_CURSOR[h]
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}

function FlowArrows({ els, doc, selected, zoom }: { els: CanvasElementData[]; doc: PubDocument; selected: string[]; zoom: number }) {
  const ids = new Set(els.map((e) => e.id));
  const arrows: React.ReactNode[] = [];
  const badges: React.ReactNode[] = [];
  for (const src of els) {
    if (src.type !== 'text' || !src.nextFrameId) continue;
    const dst = findEl(doc, src.nextFrameId);
    if (!dst) continue;
    const strong = selected.includes(src.id) || selected.includes(dst.id);
    const sb = elementBounds(src);
    if (ids.has(dst.id)) {
      const db = elementBounds(dst);
      const x1 = sb.x + sb.w;
      const y1 = sb.y + sb.h;
      const x2 = db.x;
      const y2 = db.y;
      const mx = (x1 + x2) / 2;
      arrows.push(
        <path
          key={src.id}
          d={`M ${x1} ${y1} C ${mx + 60} ${y1}, ${mx - 60} ${y2}, ${x2} ${y2}`}
          fill="none"
          stroke="#127a80"
          strokeWidth={(strong ? 2 : 1.2) / zoom}
          strokeDasharray={`${6 / zoom} ${4 / zoom}`}
          opacity={strong ? 1 : 0.45}
          markerEnd="url(#op-arrow)"
        />
      );
    } else {
      const p = pageOfElement(doc, dst.id);
      badges.push(
        <div
          key={src.id}
          className="absolute rounded bg-brand-700 text-white font-bold px-1"
          style={{ left: sb.x + sb.w, top: sb.y + sb.h, fontSize: 11 / zoom, transform: 'translate(-100%, 4px)' }}
        >
          → p.{p + 1}
        </div>
      );
    }
  }
  return (
    <>
      <svg className="absolute inset-0 overflow-visible" width="100%" height="100%">
        <defs>
          <marker id="op-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#127a80" />
          </marker>
        </defs>
        {arrows}
      </svg>
      {badges}
    </>
  );
}

function PrintMarksOverlay({ w, h, off, bleed, zoom, bg }: { w: number; h: number; off: number; bleed: number; zoom: number; bg: string }) {
  const len = 7 * MM_TO_PX;
  const gap = bleed + 1;
  const lines: string[] = [];
  const corners: [number, number, number, number][] = [
    [0, 0, -1, -1],
    [w, 0, 1, -1],
    [0, h, -1, 1],
    [w, h, 1, 1]
  ];
  for (const [cx, cy, sx, sy] of corners) {
    lines.push(`M ${cx + sx * gap} ${cy} L ${cx + sx * (gap + len)} ${cy}`);
    lines.push(`M ${cx} ${cy + sy * gap} L ${cx} ${cy + sy * (gap + len)}`);
  }
  const d = gap + len / 2 + 2;
  const regs = [
    [w / 2, -d],
    [w / 2, h + d],
    [-d, h / 2],
    [w + d, h / 2]
  ];
  const r = 2.2 * MM_TO_PX;
  return (
    <svg className="absolute inset-0 pointer-events-none" width={(w + off * 2) * zoom} height={(h + off * 2) * zoom}>
      <g transform={`scale(${zoom}) translate(${off} ${off})`}>
        <rect x={-bleed} y={-bleed} width={w + bleed * 2} height={h + bleed * 2} fill={bg || '#fff'} />
        <rect
          x={-bleed}
          y={-bleed}
          width={w + bleed * 2}
          height={h + bleed * 2}
          fill="none"
          stroke="#e11d48"
          strokeWidth={1 / zoom}
          strokeDasharray={`${4 / zoom} ${3 / zoom}`}
        />
        <path d={lines.join(' ')} stroke="#000" strokeWidth={0.8 / zoom} />
        {regs.map(([x, y], i) => (
          <g key={i} stroke="#000" strokeWidth={0.8 / zoom} fill="none">
            <circle cx={x} cy={y} r={r} />
            <path d={`M ${x - r * 1.6} ${y} L ${x + r * 1.6} ${y} M ${x} ${y - r * 1.6} L ${x} ${y + r * 1.6}`} />
          </g>
        ))}
      </g>
    </svg>
  );
}

function useScrollOffset(scrollRef: React.RefObject<HTMLDivElement | null>, pageRef: React.RefObject<HTMLDivElement | null>) {
  const [o, setO] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const update = () => {
      const p = pageRef.current?.getBoundingClientRect();
      const s = sc.getBoundingClientRect();
      if (p) setO({ x: p.left - s.left, y: p.top - s.top });
    };
    update();
    sc.addEventListener('scroll', update);
    const ro = new ResizeObserver(update);
    ro.observe(sc);
    const id = window.setInterval(update, 400);
    return () => {
      sc.removeEventListener('scroll', update);
      ro.disconnect();
      window.clearInterval(id);
    };
  }, [scrollRef, pageRef]);
  return o;
}

function HRuler({
  zoom,
  widthPx,
  scrollRef,
  pageRef
}: {
  zoom: number;
  widthPx: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  pageRef: React.RefObject<HTMLDivElement | null>;
}) {
  const o = useScrollOffset(scrollRef, pageRef);
  const mm = widthPx / MM_TO_PX;
  const ticks = [];
  for (let m = 0; m <= mm; m += 5) {
    const x = o.x + 20 + m * MM_TO_PX * zoom;
    const major = m % 10 === 0;
    ticks.push(<line key={m} x1={x} x2={x} y1={major ? 8 : 13} y2={20} stroke="#64748b" strokeWidth={0.7} />);
    if (m % 50 === 0)
      ticks.push(
        <text key={`t${m}`} x={x + 2} y={9} fontSize={9} fill="#475569">
          {m}
        </text>
      );
  }
  return (
    <div className="h-5 bg-white border-b border-slate-200 overflow-hidden shrink-0">
      <svg width="100%" height="20">
        {ticks}
      </svg>
    </div>
  );
}

function VRuler({
  zoom,
  heightPx,
  scrollRef,
  pageRef
}: {
  zoom: number;
  heightPx: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  pageRef: React.RefObject<HTMLDivElement | null>;
}) {
  const o = useScrollOffset(scrollRef, pageRef);
  const mm = heightPx / MM_TO_PX;
  const ticks = [];
  for (let m = 0; m <= mm; m += 5) {
    const y = o.y + m * MM_TO_PX * zoom;
    const major = m % 10 === 0;
    ticks.push(<line key={m} y1={y} y2={y} x1={major ? 8 : 13} x2={20} stroke="#64748b" strokeWidth={0.7} />);
    if (m % 50 === 0)
      ticks.push(
        <text key={`t${m}`} x={2} y={y + 10} fontSize={9} fill="#475569">
          {m}
        </text>
      );
  }
  return (
    <div className="w-5 bg-white border-e border-slate-200 overflow-hidden shrink-0">
      <svg width="20" height="100%">
        {ticks}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Inspector({
  doc,
  single,
  selectedEls,
  flows,
  page,
  editingMaster,
  patch,
  align,
  onReplaceImage,
  onClose,
  onPatchPage
}: {
  doc: PubDocument;
  single: CanvasElementData | null;
  selectedEls: CanvasElementData[];
  flows: ReturnType<typeof computeDocumentFlows>;
  page: PageData;
  editingMaster: boolean;
  patch: (p: Partial<CanvasElementData>, record?: boolean | string) => void;
  align: (op: AlignOp) => void;
  onReplaceImage: () => void;
  onClose: () => void;
  onPatchPage: (p: Partial<PageData>) => void;
}) {
  const { t } = useI18n();
  const num = 'w-full mt-0.5 px-2 py-1 text-xs border border-slate-300 rounded';
  if (!selectedEls.length) {
    return (
      <aside className="w-60 bg-white border-s border-slate-200 p-4 space-y-4 overflow-y-auto op-scroll shrink-0 hidden lg:block text-xs">
        <div className="text-[10px] font-bold uppercase tracking-wider text-brand-700">{editingMaster ? t('pg.master') : t('tab.page')}</div>
        {!editingMaster && (
          <>
            <label className="flex items-center justify-between gap-2">
              {t('pg.background')}
              <input type="color" value={toHex(page.background || '#ffffff')} onChange={(e) => onPatchPage({ background: e.target.value })} className="w-8 h-8 rounded" />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!page.hideMaster} onChange={(e) => onPatchPage({ hideMaster: e.target.checked })} />
              {t('pg.hideMaster')}
            </label>
          </>
        )}
        <div className="rounded-lg bg-brand-50 border border-brand-100 p-3 text-brand-900 leading-relaxed space-y-1.5">
          <p>• {t('help.k7')}</p>
          <p>• {t('help.k3')}</p>
          <p>• {t('help.k5')}</p>
          <p>• {t('help.k2')}</p>
        </div>
        <div className="text-slate-400">
          {doc.widthMm} × {doc.heightMm} mm
        </div>
      </aside>
    );
  }
  if (!single) {
    return (
      <aside className="w-60 bg-white border-s border-slate-200 p-4 space-y-4 overflow-y-auto op-scroll shrink-0 hidden lg:block">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-brand-900">{t('insp.multi', { n: selectedEls.length })}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
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
              disabled={(op === 'distH' || op === 'distV') && selectedEls.length < 3}
              onClick={() => align(op)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-brand-50 text-brand-800 disabled:opacity-30 flex justify-center"
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
        <label className="block text-[11px] text-slate-500">
          {t('insp.opacity')}
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={selectedEls[0].opacity ?? 1}
            onChange={(e) => patch({ opacity: Number(e.target.value) }, 'op')}
            className="w-full"
          />
        </label>
      </aside>
    );
  }
  const el = single;
  const flow = flows.get(el.id);
  const isContinuation = el.type === 'text' && flow && flow.chainIndex > 0;
  const nextPage = el.nextFrameId ? pageOfElement(doc, el.nextFrameId) : null;
  return (
    <aside className="w-60 bg-white border-s border-slate-200 p-4 space-y-4 overflow-y-auto op-scroll shrink-0 hidden lg:block">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-brand-700">{t('insp.title')}</div>
          <div className="text-xs font-bold text-slate-900">{t(`kind.${el.type}`)}</div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-slate-600">{t('insp.position')}</div>
        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500">
          <label>
            X
            <input type="number" value={Math.round(el.x)} onChange={(e) => patch({ x: Number(e.target.value) }, 'x')} className={num} />
          </label>
          <label>
            Y
            <input type="number" value={Math.round(el.y)} onChange={(e) => patch({ y: Number(e.target.value) }, 'y')} className={num} />
          </label>
          <label>
            {t('insp.width')}
            <input type="number" value={Math.round(el.width)} onChange={(e) => patch({ width: Math.max(8, Number(e.target.value)) }, 'w')} className={num} />
          </label>
          <label>
            {t('insp.height')}
            <input type="number" value={Math.round(el.height)} onChange={(e) => patch({ height: Math.max(8, Number(e.target.value)) }, 'h')} className={num} />
          </label>
          <label className="col-span-2">
            {t('insp.rotation')}
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={359}
                value={Math.round(el.rotation || 0)}
                onChange={(e) => patch({ rotation: Number(e.target.value) }, 'rot')}
                className="flex-1"
              />
              <input
                type="number"
                value={Math.round(el.rotation || 0)}
                onChange={(e) => patch({ rotation: ((Number(e.target.value) % 360) + 360) % 360 }, 'rot')}
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
              onChange={(e) => patch({ fillColor: e.target.value }, 'fill')}
              className="w-8 h-8 rounded border border-slate-300"
            />
            <button onClick={() => patch({ fillColor: 'transparent' })} className="px-1.5 py-1 rounded border border-slate-200 text-[10px]">
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
            onChange={(e) => patch({ strokeColor: e.target.value, strokeWidth: el.strokeWidth || 1 }, 'stroke')}
            className="w-8 h-8 rounded border border-slate-300"
          />
          <input
            type="number"
            min={0}
            max={30}
            value={el.strokeWidth ?? 0}
            onChange={(e) => patch({ strokeWidth: Math.max(0, Number(e.target.value)) }, 'sw')}
            className="w-16 px-2 py-1 text-xs border border-slate-300 rounded"
          />
          <span className="text-xs text-slate-400">px</span>
        </div>
        {el.type === 'shape' && el.shapeVariant === 'rectangle' && (
          <label className="block text-[11px] text-slate-500">
            {t('insp.radius')}
            <input type="range" min={0} max={100} value={el.borderRadius || 0} onChange={(e) => patch({ borderRadius: Number(e.target.value) }, 'rad')} className="w-full" />
          </label>
        )}
        <label className="block text-[11px] text-slate-500">
          {t('insp.opacity')}
          <input type="range" min={0.1} max={1} step={0.05} value={el.opacity ?? 1} onChange={(e) => patch({ opacity: Number(e.target.value) }, 'op')} className="w-full" />
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
              onChange={(e) => patch({ text: e.target.value }, 'type')}
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
          <div className="text-[11px] font-semibold text-slate-600">
            {t('insp.table', { r: el.tableData.length, c: el.tableData[0]?.length || 1 })}
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <button
              onClick={() => patch({ tableData: [...el.tableData!, Array(el.tableData![0]?.length || 1).fill('')] })}
              className="px-2 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-800 rounded"
            >
              {t('insp.addRow')}
            </button>
            <button
              disabled={el.tableData.length <= 1}
              onClick={() => patch({ tableData: el.tableData!.slice(0, -1) })}
              className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 rounded disabled:opacity-40"
            >
              {t('insp.delRow')}
            </button>
            <button
              onClick={() => patch({ tableData: el.tableData!.map((r) => [...r, '']) })}
              className="px-2 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-800 rounded"
            >
              {t('insp.addCol')}
            </button>
            <button
              disabled={(el.tableData[0]?.length || 1) <= 1}
              onClick={() => patch({ tableData: el.tableData!.map((r) => r.slice(0, -1)) })}
              className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 rounded disabled:opacity-40"
            >
              {t('insp.delCol')}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
