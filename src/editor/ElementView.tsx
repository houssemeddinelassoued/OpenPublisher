import { memo, useMemo } from 'react';
import type { CanvasElementData, PubDocument } from '../core/model';
import { getCanvasPixelDimensions } from '../core/model';
import { LINE_HEIGHT, TEXT_PAD, computeDocumentFlows, type FrameFlow } from '../core/textflow';
import { pageNumberLabel } from '../core/render';

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
    const fs = el.fontSize || 16;
    const lines = el.type === 'pagenum' ? [{ text: pageText || '', endsPara: true }] : flow?.lines ?? [];
    return (
      <div
        className="w-full h-full overflow-hidden box-border"
        dir="auto"
        style={{
          backgroundColor: el.fillColor && el.fillColor !== 'transparent' ? el.fillColor : 'transparent',
          border: hasStroke ? `${el.strokeWidth}px solid ${el.strokeColor}` : 'none',
          fontFamily: el.fontFamily || 'Inter, sans-serif',
          fontSize: fs,
          color: el.fontColor || '#0f172a',
          fontWeight: el.bold ? 700 : 400,
          fontStyle: el.italic ? 'italic' : 'normal',
          textDecoration: el.underline ? 'underline' : 'none',
          lineHeight: `${fs * LINE_HEIGHT}px`,
          padding: TEXT_PAD - (hasStroke ? el.strokeWidth! : 0)
        }}
      >
        {lines.map((l, i) => (
          <div
            key={i}
            style={{
              whiteSpace: 'pre',
              height: fs * LINE_HEIGHT,
              textAlign: (el.textAlign === 'justify' ? 'justify' : el.textAlign || 'left') as React.CSSProperties['textAlign'],
              textAlignLast: el.textAlign === 'justify' && !l.endsPara ? 'justify' : undefined,
              direction: 'ltr',
              unicodeBidi: 'plaintext'
            }}
          >
            {l.text || ' '}
          </div>
        ))}
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
        className="w-full h-full object-cover select-none pointer-events-none box-border"
        style={{ border: hasStroke ? `${el.strokeWidth}px solid ${el.strokeColor}` : 'none' }}
      />
    );
  }
  if (el.type === 'table' && el.tableData) {
    return <TableView el={el} />;
  }
  return null;
});

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

/** Static, non-interactive page rendering (thumbnails, hub cards). */
export const PagePreview = memo(function PagePreview({
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
  const dims = getCanvasPixelDimensions(doc);
  const scale = width / dims.width;
  const f = useMemo(() => flows ?? computeDocumentFlows(doc), [flows, doc]);
  const page = doc.pages[pageIndex] || doc.pages[0];
  if (!page) return null;
  const pageText = pageNumberLabel(pageIndex, doc.pages.length, pageLabel);
  const master = doc.master && !page.hideMaster ? doc.master.elements : [];
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
});
