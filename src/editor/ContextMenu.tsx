import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { IconType } from './ui';

export type MenuItem =
  | {
      kind?: 'item';
      label: string;
      icon?: IconType;
      shortcut?: string;
      onClick: () => void;
      disabled?: boolean;
      danger?: boolean;
      checked?: boolean;
    }
  | { kind: 'sep' }
  | { kind: 'header'; label: string };

export const SEP: MenuItem = { kind: 'sep' };

/** Right-click menu rendered at the cursor, kept inside the viewport. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = Math.max(4, Math.min(x, window.innerWidth - r.width - 4));
    const ny = Math.max(4, Math.min(y, window.innerHeight - r.height - 4));
    setPos({ x: nx, y: ny });
  }, [x, y, items.length]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        e.preventDefault();
        onClose();
      }
    };
    const close = () => onClose();
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    window.addEventListener('wheel', close, { passive: true });
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('wheel', close);
    };
  }, [onClose]);

  // Drop leading / trailing / doubled separators.
  const clean: MenuItem[] = [];
  for (const it of items) {
    if (it.kind === 'sep' && (!clean.length || clean[clean.length - 1].kind === 'sep')) continue;
    clean.push(it);
  }
  while (clean.length && clean[clean.length - 1].kind === 'sep') clean.pop();

  return (
    <div
      ref={ref}
      data-modal-open
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[150] min-w-[220px] max-h-[85vh] overflow-y-auto op-scroll bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 text-sm select-none"
      style={{ left: pos.x, top: pos.y }}
    >
      {clean.map((it, i) => {
        if (it.kind === 'sep') return <div key={i} className="my-1 h-px bg-slate-100" />;
        if (it.kind === 'header')
          return (
            <div key={i} className="px-3 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {it.label}
            </div>
          );
        const Icon = it.icon;
        return (
          <button
            key={i}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onClick();
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-start disabled:opacity-35 disabled:pointer-events-none ${
              it.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-brand-50 hover:text-brand-900'
            }`}
          >
            <span className="w-4 h-4 flex items-center justify-center shrink-0">
              {it.checked ? <Check className="w-4 h-4 text-brand-700" /> : Icon ? <Icon className={`w-4 h-4 ${it.danger ? '' : 'text-brand-700'}`} /> : null}
            </span>
            <span className="flex-1">{it.label}</span>
            {it.shortcut && (
              <span className="text-[11px] text-slate-400 ps-4" dir="ltr">
                {it.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
