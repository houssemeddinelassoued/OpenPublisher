import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { LANGS, useI18n, type Lang } from '../i18n';

const BASE = import.meta.env.BASE_URL;

export function AppLogo({ size = 40, className = '' }: { size?: number; className?: string }) {
  return <img src={`${BASE}logo-mark.png`} width={size} height={size} alt="OpenPublisher" className={`shrink-0 object-contain ${className}`} draggable={false} />;
}

/** National Quantum logo (company behind the NQ Open Initiative). */
export function NQLogo({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src={`${BASE}national-quantum.png`}
      width={size}
      height={size}
      alt="National Quantum"
      className={`shrink-0 rounded-lg object-cover ${className}`}
      draggable={false}
    />
  );
}

const LANG_META: Record<Lang, { badge: string; hint: string; color: string }> = {
  fr: { badge: 'FR', hint: 'Français', color: 'bg-blue-600' },
  en: { badge: 'EN', hint: 'English', color: 'bg-rose-600' },
  ar: { badge: 'ع', hint: 'العربية', color: 'bg-emerald-600' }
};

/** Language picker: a compact button that opens a small card list. */
export function LanguageSwitcher({ dark = false, align = 'end' }: { dark?: boolean; align?: 'start' | 'end' }) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const cur = LANG_META[lang];
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        title={t('common.language')}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-2 rounded-xl border ps-1.5 pe-2.5 py-1.5 text-sm font-semibold transition ${
          dark ? 'border-white/20 bg-white/10 text-white hover:bg-white/20' : 'border-slate-300 bg-white text-slate-700 hover:border-brand-400 hover:bg-brand-50'
        }`}
      >
        <span className={`w-6 h-6 rounded-lg ${cur.color} text-white text-[11px] font-bold flex items-center justify-center`}>{cur.badge}</span>
        <span className="hidden sm:inline">{cur.hint}</span>
        <ChevronDown className={`w-3.5 h-3.5 opacity-60 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="listbox"
          className={`absolute z-[160] mt-2 w-60 rounded-2xl bg-white shadow-xl border border-slate-200 p-2 ${align === 'end' ? 'end-0' : 'start-0'}`}
        >
          <div className="flex items-center gap-2 px-2 pt-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <Globe className="w-3.5 h-3.5" /> {t('common.language')}
          </div>
          {LANGS.map((l) => {
            const m = LANG_META[l.id];
            const active = l.id === lang;
            return (
              <button
                key={l.id}
                role="option"
                aria-selected={active}
                onClick={() => {
                  setLang(l.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-2 py-2 rounded-xl text-start transition ${
                  active ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-slate-50'
                }`}
              >
                <span className={`w-8 h-8 rounded-lg ${m.color} text-white text-xs font-bold flex items-center justify-center shrink-0`}>{m.badge}</span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{l.label}</span>
                  <span className="block text-[11px] text-slate-500">{t(`lang.${l.id}`)}</span>
                </span>
                {active && <Check className="w-4 h-4 text-brand-700" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
