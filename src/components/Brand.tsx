import { LANGS, useI18n, type Lang } from '../i18n';
import { Languages } from 'lucide-react';

const BASE = import.meta.env.BASE_URL;

export function AppLogo({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src={`${BASE}logo-mark.png`}
      width={size}
      height={size}
      alt="OpenPublisher"
      className={`rounded-xl shrink-0 ${className}`}
      draggable={false}
    />
  );
}

/** National Quantum — NQ Open Initiative mark (atom orbits around “NQ”). */
export function NQLogo({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="NQ Open Initiative">
      <defs>
        <linearGradient id="nqg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b4f5c" />
          <stop offset="1" stopColor="#127a80" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#nqg)" />
      <g fill="none" stroke="#5ee0d6" strokeWidth="1.6" opacity="0.9">
        <ellipse cx="32" cy="32" rx="25" ry="9" />
        <ellipse cx="32" cy="32" rx="25" ry="9" transform="rotate(60 32 32)" />
        <ellipse cx="32" cy="32" rx="25" ry="9" transform="rotate(120 32 32)" />
      </g>
      <circle cx="57" cy="32" r="2.6" fill="#a6e8ea" />
      <text
        x="32"
        y="38.5"
        textAnchor="middle"
        fontFamily="Segoe UI, Arial, sans-serif"
        fontWeight="800"
        fontSize="18"
        fill="#ffffff"
      >
        NQ
      </text>
    </svg>
  );
}

export function LanguageSwitcher({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <label
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold ${
        dark ? 'border-white/20 bg-white/10 text-white' : 'border-slate-300 bg-white text-slate-700'
      }`}
      title={t('common.language')}
    >
      <Languages className={`w-4 h-4 ${dark ? 'text-aqua' : 'text-brand-700'}`} />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className={`bg-transparent focus:outline-none cursor-pointer ${dark ? 'text-white' : ''}`}
      >
        {LANGS.map((l) => (
          <option key={l.id} value={l.id} className="text-slate-900">
            {compact ? l.short : l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
