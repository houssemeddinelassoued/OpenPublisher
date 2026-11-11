import { useEffect, useState } from 'react';
import type { CanvasElementData, PubDocument } from '../core/model';
import { MM_TO_PX, elementBounds } from '../core/model';
import { findEl, pageOfElement, type FrameFlow } from '../core/textflow';
import { ElementContent, TableView, elementStyle } from './ElementView';
import { HANDLES, HANDLE_CURSOR, type Handle } from './geometry';

export function EditableElement({
  el,
  flow,
  pageText,
  editing,
  linkTarget,
  onMouseDown,
  onDoubleClick,
  onContextMenu,
  onText,
  onCell
}: {
  el: CanvasElementData;
  flow?: FrameFlow;
  pageText: string;
  editing: boolean;
  linkTarget?: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onText: (v: string) => void;
  onCell: (r: number, c: number, v: string) => void;
}) {
  const fs = el.fontSize || 16;
  return (
    <div
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
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
          onContextMenu={(e) => e.stopPropagation()}
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
        <ElementContent el={el} flow={flow} pageText={pageText} />
      )}
    </div>
  );
}

export function SelectionBox({
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

export function FlowArrows({ els, doc, selected, zoom }: { els: CanvasElementData[]; doc: PubDocument; selected: string[]; zoom: number }) {
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

export function PrintMarksOverlay({ w, h, off, bleed, zoom, bg }: { w: number; h: number; off: number; bleed: number; zoom: number; bg: string }) {
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
      if (p) setO((prev) => (prev.x === p.left - s.left && prev.y === p.top - s.top ? prev : { x: p.left - s.left, y: p.top - s.top }));
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

type RulerProps = {
  zoom: number;
  sizePx: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  pageRef: React.RefObject<HTMLDivElement | null>;
};

export function HRuler({ zoom, sizePx, scrollRef, pageRef }: RulerProps) {
  const o = useScrollOffset(scrollRef, pageRef);
  const mm = sizePx / MM_TO_PX;
  const ticks = [];
  for (let m = 0; m <= mm; m += 5) {
    const x = o.x + 20 + m * MM_TO_PX * zoom;
    ticks.push(<line key={m} x1={x} x2={x} y1={m % 10 === 0 ? 8 : 13} y2={20} stroke="#64748b" strokeWidth={0.7} />);
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

export function VRuler({ zoom, sizePx, scrollRef, pageRef }: RulerProps) {
  const o = useScrollOffset(scrollRef, pageRef);
  const mm = sizePx / MM_TO_PX;
  const ticks = [];
  for (let m = 0; m <= mm; m += 5) {
    const y = o.y + m * MM_TO_PX * zoom;
    ticks.push(<line key={m} y1={y} y2={y} x1={m % 10 === 0 ? 8 : 13} x2={20} stroke="#64748b" strokeWidth={0.7} />);
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
