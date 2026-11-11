import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { SHAPES, SHAPE_GROUPS, getShape } from '../core/shapes';
import { ShapeSvg } from './ElementView';

/** Small preview of a shape (native or path). */
export function ShapeIcon({ id, size = 26 }: { id: string; size?: number }) {
  const def = getShape(id);
  const style = { fillColor: '#a6e8ea', strokeColor: '#127a80', strokeWidth: 1.5 };
  return (
    <span className="inline-block" style={{ width: size, height: size }}>
      {def?.path ? (
        <ShapeSvg path={def.path} evenodd={def.evenodd} el={style} />
      ) : id === 'line' ? (
        <span className="flex items-center h-full">
          <span className="w-full h-[3px] rounded bg-brand-700" />
        </span>
      ) : (
        <span
          className="block w-full h-full border-[1.5px] border-brand-700 bg-brand-200"
          style={{ borderRadius: id === 'circle' ? '50%' : id === 'rounded' ? 6 : 0 }}
        />
      )}
    </span>
  );
}

/** Popover listing every shape by group. */
export function ShapeGallery({ x, y, onPick, onClose }: { x: number; y: number; onPick: (id: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: Math.max(4, Math.min(x, window.innerWidth - r.width - 8)), y: Math.max(4, Math.min(y, window.innerHeight - r.height - 8)) });
  }, [x, y]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      data-modal-open
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[150] w-[360px] max-h-[70vh] overflow-y-auto op-scroll bg-white rounded-2xl shadow-xl border border-slate-200 p-3 space-y-3"
      style={{ left: pos.x, top: pos.y }}
    >
      {SHAPE_GROUPS.map((g) => (
        <div key={g}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{t(`shape.group.${g}`)}</div>
          <div className="grid grid-cols-8 gap-1">
            {SHAPES.filter((s) => s.group === g).map((s) => (
              <button
                key={s.id}
                title={t(`shape.${s.id}`)}
                onClick={() => {
                  onPick(s.id);
                  onClose();
                }}
                className="aspect-square rounded-lg hover:bg-brand-50 hover:ring-1 hover:ring-brand-300 flex items-center justify-center p-1"
              >
                <ShapeIcon id={s.id} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
