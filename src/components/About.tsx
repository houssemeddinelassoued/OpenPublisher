import { ExternalLink, Mail, Heart, Code2, Globe, Scale, Users, MessageCircle } from 'lucide-react';
import { useI18n } from '../i18n';
import {
  APP_COMPANY,
  APP_COMPANY_TAGLINE,
  APP_EMAIL,
  APP_FACEBOOK,
  APP_INITIATIVE,
  APP_LICENSE,
  APP_LINKEDIN,
  APP_NAME,
  APP_REPO,
  APP_SITE,
  APP_TEAM,
  APP_VERSION,
  APP_YEAR
} from '../meta';
import { Modal } from './Modals';

const BASE = import.meta.env.BASE_URL;

const LinkedinIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
    <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
  </svg>
);
const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
    <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.23 2.68.23v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
  </svg>
);

const AVATAR_COLORS = ['from-brand-700 to-brand-500', 'from-rose-500 to-amber-400', 'from-violet-600 to-sky-500'];

export function AboutModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal title={t('about.title')} onClose={onClose} wide>
      {/* Hero */}
      <section className="rounded-2xl bg-gradient-to-br from-brand-50 via-white to-brand-100 border border-brand-100 p-5 flex flex-col sm:flex-row items-center gap-5">
        <img src={`${BASE}logo-full.png`} alt={APP_NAME} className="w-32 h-32 object-contain drop-shadow-sm" />
        <div className="text-center sm:text-start">
          <div className="text-2xl font-bold text-brand-900">{APP_NAME}</div>
          <div className="text-sm text-brand-700 font-medium">{t('about.version', { v: APP_VERSION })}</div>
          <p className="text-sm text-slate-600 leading-relaxed mt-2 max-w-md">{t('about.desc')}</p>
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Team */}
        <section className="rounded-2xl border border-slate-200 p-4 space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-bold text-brand-900">
            <Users className="w-4 h-4 text-brand-600" /> {t('about.team')}
          </h4>
          <ul className="space-y-2.5">
            {APP_TEAM.map((m, i) => (
              <li key={m.name} className="flex items-center gap-3">
                <span
                  className={`w-10 h-10 rounded-full bg-gradient-to-br ${AVATAR_COLORS[i % AVATAR_COLORS.length]} text-white text-sm font-bold flex items-center justify-center shrink-0`}
                >
                  {m.initials}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{m.name}</div>
                  <div className="text-xs text-slate-500">{t(`about.role.${m.role}`)}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Contact */}
        <section className="rounded-2xl border border-slate-200 p-4 space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-bold text-brand-900">
            <MessageCircle className="w-4 h-4 text-brand-600" /> {t('about.contact')}
          </h4>
          <p className="text-xs text-slate-500">{t('about.contactText')}</p>
          <div className="space-y-2">
            <a
              href={`mailto:${APP_EMAIL}?subject=OpenPublisher`}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-900 text-sm"
              dir="ltr"
            >
              <Mail className="w-4 h-4 shrink-0" /> <span className="truncate">{APP_EMAIL}</span>
            </a>
            <div className="flex gap-2">
              {APP_LINKEDIN && (
                <a
                  href={APP_LINKEDIN}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#0a66c2] text-white text-sm font-semibold hover:opacity-90"
                >
                  <LinkedinIcon /> LinkedIn
                </a>
              )}
              {APP_FACEBOOK && (
                <a
                  href={APP_FACEBOOK}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#1877f2] text-white text-sm font-semibold hover:opacity-90"
                >
                  <FacebookIcon /> Facebook
                </a>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Company */}
      <section className="rounded-2xl bg-[#1f2a33] text-white p-4 flex flex-col sm:flex-row items-center gap-4">
        <img src={`${BASE}national-quantum.png`} alt={APP_COMPANY} className="w-24 h-24 rounded-xl object-cover shrink-0" />
        <div className="text-center sm:text-start">
          <div className="text-[11px] uppercase tracking-wider text-white/60">{t('about.company')}</div>
          <div className="text-lg font-bold">{APP_COMPANY}</div>
          <div className="text-xs text-white/70">{APP_COMPANY_TAGLINE}</div>
          <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-xs font-semibold text-aqua">{APP_INITIATIVE}</div>
        </div>
      </section>

      {/* Links */}
      <section className="grid sm:grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Scale className="w-3.5 h-3.5" /> {t('about.license')}
          </div>
          <div className="font-semibold text-slate-800 mt-0.5">{t('about.licenseText', { l: APP_LICENSE })}</div>
        </div>
        <a href={APP_REPO} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-50 border border-slate-200 p-3 hover:border-brand-300 hover:bg-brand-50">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Code2 className="w-3.5 h-3.5" /> {t('about.source')}
          </div>
          <div className="font-semibold text-brand-800 mt-0.5 inline-flex items-center gap-1">
            GitHub <ExternalLink className="w-3 h-3" />
          </div>
        </a>
        <a href={APP_SITE} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-50 border border-slate-200 p-3 hover:border-brand-300 hover:bg-brand-50">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Globe className="w-3.5 h-3.5" /> {t('about.online')}
          </div>
          <div className="font-semibold text-brand-800 mt-0.5 inline-flex items-center gap-1">
            {t('about.openOnline')} <ExternalLink className="w-3 h-3" />
          </div>
        </a>
      </section>

      <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
        <Heart className="w-3.5 h-3.5 text-rose-500" /> {t('about.madeWith', { a: APP_TEAM.map((m) => m.name).join(' & ') })} • © {APP_YEAR} {APP_COMPANY}
      </p>
    </Modal>
  );
}
