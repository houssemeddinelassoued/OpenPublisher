import { useState } from 'react';
import { LayoutTemplate } from 'lucide-react';
import { useI18n } from '../i18n';
import { Modal } from './Modals';

export type TemplateScope = 'document' | 'page' | 'selection';

/** Asks for a template name / description and what to include. */
export function SaveTemplateModal({
  defaultName,
  scopes,
  initialScope,
  onSave,
  onClose
}: {
  defaultName: string;
  /** Available scopes with the number of pages each one would contain. */
  scopes: { scope: TemplateScope; pages: number }[];
  initialScope: TemplateScope;
  onSave: (name: string, description: string, scope: TemplateScope) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(defaultName);
  const [desc, setDesc] = useState('');
  const [scope, setScope] = useState<TemplateScope>(initialScope);
  const field = 'w-full mt-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500';
  return (
    <Modal
      title={t('tplm.title')}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">
            {t('common.cancel')}
          </button>
          <button
            disabled={!name.trim()}
            onClick={() => onSave(name.trim(), desc.trim(), scope)}
            className="px-4 py-2 text-sm font-semibold bg-brand-700 hover:bg-brand-800 text-white rounded-lg inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            <LayoutTemplate className="w-4 h-4" /> {t('tplm.save')}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{t('tplm.intro')}</p>
      <label className="block text-xs font-semibold text-slate-700">
        {t('tplm.name')}
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={field} />
      </label>
      <label className="block text-xs font-semibold text-slate-700">
        {t('tplm.desc')}
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t('tplm.descPh')} className={field} />
      </label>
      {scopes.length > 1 && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-slate-700">{t('tplm.content')}</div>
          {scopes.map((s) => (
            <label
              key={s.scope}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer ${
                scope === s.scope ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input type="radio" checked={scope === s.scope} onChange={() => setScope(s.scope)} />
              <span className="flex-1 text-sm">{t(`tplm.scope.${s.scope}`)}</span>
              <span className="text-xs text-slate-500">{t('common.pages', { n: s.pages })}</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
