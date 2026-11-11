import type { Type } from 'lucide-react';

export type IconType = typeof Type;

export function TopIcon({ children, onClick, title, disabled }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} disabled={disabled} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-35">
      {children}
    </button>
  );
}

export function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-stretch pe-3 me-2 border-e border-slate-200 shrink-0">
      <div className="flex items-center gap-1.5 flex-1">{children}</div>
      <div className="text-[9px] uppercase tracking-wider text-slate-400 text-center mt-0.5">{label}</div>
    </div>
  );
}

export function Sep() {
  return <span className="w-px self-stretch bg-slate-200 mx-1.5 shrink-0" />;
}

export function RBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
  danger,
  title
}: {
  icon: IconType;
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

export function Toggle({ children, on, onClick, disabled, title }: { children: React.ReactNode; on?: boolean; onClick: () => void; disabled?: boolean; title: string }) {
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

export function ColorPick({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className={`flex flex-col items-center gap-0.5 text-[10px] text-slate-600 ${disabled ? 'opacity-35 pointer-events-none' : 'cursor-pointer'}`}>
      <input type="color" value={toHex(value)} onChange={(e) => onChange(e.target.value)} className="w-7 h-7 rounded border border-slate-300 cursor-pointer" />
      {label}
    </label>
  );
}

export function MiniBtn({ children, onClick, title, disabled }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean }) {
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

export function toHex(c: string) {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c))
    return (
      '#' +
      c
        .slice(1)
        .split('')
        .map((x) => x + x)
        .join('')
    );
  return '#ffffff';
}

export const BG_SWATCHES = ['#ffffff', '#fffbeb', '#fff7ed', '#fdf2f8', '#f5f3ff', '#ecfeff', '#ecfbfb', '#f0fdf4', '#f8fafc'];

export const FONTS: { v: string; l: string }[] = [
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
