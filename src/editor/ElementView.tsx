import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CanvasElementData, PubDocument } from '../core/model';
import { getPageDims, masterElementsFor } from '../core/model';
import { getShape } from '../core/shapes';
import { computePageFlows, layoutText, type FrameFlow } from '../core/textflow';
import { pageNumberLabel } from '../core/render';

/** Text lines positioned exactly as computed by the layout engine. */
export function TextLines({ flow }: { flow: FrameFlow }) {
  const [pl, pt] = flow.pad;
  return (
    <>
      {flow.lines.map((line, li) =>
        line.segs.map((s, si) => (
          <span
            key={`${li}-${si}`}
            style={{
              position: 'absolute',
              left: pl + s.x,
              top: pt + flow.offsetY + line.y + line.baseline - s.asc + s.style.shift,
              font: s.style.font,
              lineHeight: `${s.asc + s.desc}px`,
              color: s.style.color,
              whiteSpace: 'pre',
              textDecoration: s.style.underline ? 'underline' : undefined,
              direction: line.rtl ? 'rtl' : 'ltr',
              unicodeBidi: 'isolate'
            }}
          >
            {s.text.replace(/\t/g, '    ')}
          </span>
        ))
      )}
    </>
  );
}

/** Visual content of one element, filling its (unrotated) box. */
export const ElementContent = memo(function ElementContent({
  el,
  flow,
  pageText
}: {
  el: CanvasElementData;
  flow?: FrameFlow;
  pageText?: string;
}) {
  const hasStroke = (el.strokeWidth ?? 0) > 0 && el.strokeColor && el.strokeColor !== 'transparent';
  if (el.type === 'text' || el.type === 'pagenum') {
    const f = el.type === 'pagenum' ? layoutText(el, pageText || '') : flow;
    return (
      <div
        className="w-full h-full overflow-hidden relative"
        dir="ltr"
        style={{ backgroundColor: el.fillColor && el.fillColor !== 'transparent' ? el.fillColor : 'transparent' }}
      >
        {f && <TextLines flow={f} />}
        {hasStroke && (
          <div className="absolute inset-0 pointer-events-none" style={{ border: `${el.strokeWidth}px solid ${el.strokeColor}` }} />
        )}
      </div>
    );
  }
  if (el.type === 'shape') {
    if (el.shapeVariant === 'line') {
      return (
        <div className="w-full h-full flex items-center">
          <div style={{ width: '100%', height: Math.max(2, el.strokeWidth || 3), backgroundColor: el.strokeColor || '#127a80' }} />
        </div>
      );
    }
    const def = getShape(el.shapeVariant);
    if (def?.path) return <ShapeSvg path={def.path} evenodd={def.evenodd} el={el} />;
    return (
      <div
        className="w-full h-full box-border"
        style={{
          backgroundColor: el.fillColor && el.fillColor !== 'transparent' ? el.fillColor : 'transparent',
          border: hasStroke ? `${el.strokeWidth}px solid ${el.strokeColor}` : 'none',
          borderRadius: el.shapeVariant === 'circle' ? '50%' : el.borderRadius || 0
        }}
      />
    );
  }
  if (el.type === 'border') {
    return (
      <div
        className="w-full h-full box-border"
        style={{
          border: `${el.strokeWidth || 3}px solid ${el.strokeColor || '#127a80'}`,
          outline: el.borderPreset === 'double' || el.borderPreset === 'ornate' ? `1px solid ${el.strokeColor || '#127a80'}` : undefined,
          outlineOffset: el.borderPreset === 'double' || el.borderPreset === 'ornate' ? `-${6 + (el.strokeWidth || 3) / 2}px` : undefined
        }}
      />
    );
  }
  if (el.type === 'image') {
    return (
      <img
        src={el.imageUrl}
        alt=""
        draggable={false}
        className="w-full h-full select-none pointer-events-none box-border"
        style={{ border: hasStroke ? `${el.strokeWidth}px solid ${el.strokeColor}` : 'none', objectFit: el.imageFit ?? 'cover', borderRadius: el.borderRadius || undefined }}
      />
    );
  }
  if (el.type === 'table' && el.tableData) {
    return <TableView el={el} />;
  }
  return null;
});

/** SVG path shape stretched to the element box, stroke kept at constant width. */
export function ShapeSvg({ path, evenodd, el }: { path: string; evenodd?: boolean; el: Pick<CanvasElementData, 'fillColor' | 'strokeColor' | 'strokeWidth'> }) {
  const hasStroke = (el.strokeWidth ?? 0) > 0 && el.strokeColor && el.strokeColor !== 'transparent';
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible block">
      <path
        d={path}
        fill={el.fillColor && el.fillColor !== 'transparent' ? el.fillColor : 'none'}
        fillRule={evenodd ? 'evenodd' : 'nonzero'}
        stroke={hasStroke ? el.strokeColor : 'none'}
        strokeWidth={hasStroke ? el.strokeWidth : 0}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function TableView({ el, onCellChange }: { el: CanvasElementData; onCellChange?: (r: number, c: number, v: string) => void }) {
  const data = el.tableData || [];
  const stroke = el.strokeColor && el.strokeColor !== 'transparent' ? el.strokeColor : '#94a3b8';
  return (
    <table
      className="w-full h-full border-collapse table-fixed"
      style={{
        fontSize: el.fontSize || 13,
        color: el.fontColor || '#0f172a',
        backgroundColor: el.fillColor || '#ffffff',
        fontFamily: el.fontFamily || 'Inter, sans-serif'
      }}
    >
      <tbody>
        {data.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => (
              <td
                key={c}
                className="align-middle overflow-hidden"
                style={{
                  border: `1px solid ${stroke}`,
                  backgroundColor: r === 0 ? `${stroke}33` : undefined,
                  fontWeight: r === 0 ? 700 : 400,
                  padding: '0 8px'
                }}
              >
                {onCellChange ? (
                  <input
                    value={cell}
                    dir="auto"
                    onMouseDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => onCellChange(r, c, e.target.value)}
                    className="w-full bg-transparent focus:outline-none focus:bg-white/80 rounded"
                    style={{ font: 'inherit', color: 'inherit' }}
                  />
                ) : (
                  <span className="block truncate">{cell}</span>
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function elementStyle(el: CanvasElementData): React.CSSProperties {
  return {
    position: 'absolute',
    left: el.x,
    top: el.y,
    width: el.width,
    height: el.height,
    zIndex: el.zIndex,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    opacity: el.opacity
  };
}

/** Renders its children only once they scroll near the viewport. */
export function LazyMount({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '600px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  return visible ? <>{children}</> : <div ref={ref} style={{ width, height }} className="bg-white shadow-sm" />;
}

/** Static, non-interactive page rendering (thumbnails, hub cards). */
export const PagePreview = memo(
  function PagePreview({
  doc,
  pageIndex,
  width,
  flows,
  pageLabel
}: {
  doc: PubDocument;
  pageIndex: number;
  width: number;
  flows?: Map<string, FrameFlow>;
  pageLabel?: string;
}) {
  const page0 = doc.pages[pageIndex] || doc.pages[0];
  const dims = getPageDims(doc, page0);
  const scale = width / dims.width;
  const f = useMemo(() => flows ?? computePageFlows(doc, pageIndex), [flows, doc, pageIndex]);
  const page = doc.pages[pageIndex] || doc.pages[0];
  if (!page) return null;
  const pageText = pageNumberLabel(pageIndex, doc.pages.length, pageLabel);
  const master = masterElementsFor(doc, page);
  return (
    <div
      className="relative overflow-hidden bg-white shadow-sm"
      style={{ width, height: dims.height * scale }}
      dir="ltr"
    >
      <div
        style={{
          width: dims.width,
          height: dims.height,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          background: page.background || '#fff',
          position: 'absolute',
          inset: 0
        }}
      >
        {[master, page.elements].map((layer, li) => (
          <div key={li} style={{ position: 'absolute', inset: 0, zIndex: li }}>
            {layer.map((el) => (
              <div key={el.id} style={elementStyle(el)}>
                <ElementContent el={el} flow={f.get(el.id)} pageText={pageText} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
},
  (a, b) => {
    if (a.width !== b.width || a.pageIndex !== b.pageIndex || a.pageLabel !== b.pageLabel) return false;
    const pa = a.doc.pages[a.pageIndex];
    const pb = b.doc.pages[b.pageIndex];
    if (a.doc === b.doc) return a.flows === b.flows;
    if (pa !== pb || a.doc.master !== b.doc.master || a.doc.pages.length !== b.doc.pages.length) return false;
    if (a.doc.orientation !== b.doc.orientation || a.doc.widthMm !== b.doc.widthMm || a.doc.heightMm !== b.doc.heightMm) return false;
    // Same page objects: equal unless a linked text flow on this page changed.
    for (const e of pb?.elements ?? []) if (e.type === 'text' && a.flows?.get(e.id) !== b.flows?.get(e.id)) return false;
    for (const e of b.doc.master?.elements ?? []) if (e.type === 'text' && a.flows?.get(e.id) !== b.flows?.get(e.id)) return false;
    return true;
  }
);
