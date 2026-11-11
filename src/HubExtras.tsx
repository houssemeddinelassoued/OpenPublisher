import { X, Heart, ExternalLink, MousePointer2, Type, Printer, Save, LayoutTemplate, Keyboard } from 'lucide-react';
import { APP_AUTHOR, APP_LICENSE, APP_NAME, APP_REPO, APP_SITE, APP_VERSION, APP_YEAR } from './meta';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl border border-slate-200 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  { icon: LayoutTemplate, t: '1. Choisir un modèle', d: 'Sur l’accueil, cliquez sur un modèle (affiche, journal, lettre, diplôme…) ou sur « Page blanche ». Une copie est créée : le modèle d’origine n’est jamais modifié.' },
  { icon: Type, t: '2. Modifier le texte', d: 'Double-cliquez sur un texte pour l’écrire. Cliquez une fois sur un cadre pour le sélectionner, puis changez police, taille et couleur dans l’onglet « Accueil ».' },
  { icon: MousePointer2, t: '3. Déplacer et agrandir', d: 'Faites glisser un cadre avec la souris pour le déplacer. Tirez la poignée en bas à droite pour l’agrandir. Touche Suppr pour l’effacer.' },
  { icon: LayoutTemplate, t: '4. Ajouter des éléments', d: 'Onglet « Insertion » : zone de texte, image (depuis votre ordinateur), formes, tableau, numéro de page, cadre décoratif.' },
  { icon: Printer, t: '5. Imprimer', d: 'Bouton « Exporter en PDF » en haut à droite : le fichier est prêt à imprimer. « Exporter en PNG » enregistre la page en image.' },
  { icon: Save, t: '6. Enregistrer', d: 'Tout est enregistré automatiquement sur cet ordinateur. Pensez à faire une « Sauvegarde » de temps en temps (fichier à garder sur une clé USB).' }
];

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Aide — Comment ça marche ?" onClose={onClose}>
      <div className="grid sm:grid-cols-2 gap-3">
        {STEPS.map((s) => (
          <div key={s.t} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
              <s.icon className="w-4 h-4 text-indigo-600" /> {s.t}
            </div>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">{s.d}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
        <div className="flex items-center gap-2 font-semibold text-indigo-900 text-sm mb-2">
          <Keyboard className="w-4 h-4" /> Raccourcis utiles
        </div>
        <ul className="text-sm text-indigo-900/90 grid grid-cols-2 gap-y-1">
          <li><b>Ctrl + Z</b> : annuler</li>
          <li><b>Ctrl + Maj + Z</b> : rétablir</li>
          <li><b>Ctrl + C / V</b> : copier / coller</li>
          <li><b>Suppr</b> : supprimer le cadre</li>
          <li><b>Double-clic</b> : écrire dans un texte</li>
          <li><b>Molette + Ctrl</b> : zoom</li>
        </ul>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <b>Vos anciens fichiers Publisher (.pub)</b> : utilisez « Ouvrir un fichier ». Le texte et les images sont récupérés, mais la mise en page peut changer :
        vérifiez toujours le résultat avant d’imprimer. Pour une conversion fidèle, exportez d’abord en PDF depuis Publisher.
      </div>
    </Modal>
  );
}

export function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={`À propos de ${APP_NAME}`} onClose={onClose}>
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-2xl font-bold shadow">OP</div>
        <div>
          <div className="font-bold text-xl text-slate-900">{APP_NAME}</div>
          <div className="text-sm text-slate-500">Version {APP_VERSION} • Logiciel libre de mise en page</div>
        </div>
      </div>
      <p className="text-sm text-slate-700 leading-relaxed">
        {APP_NAME} est un logiciel gratuit de PAO (publication assistée par ordinateur) pensé pour remplacer Microsoft Publisher au quotidien :
        affiches, journaux de classe, lettres, invitations, diplômes… Il fonctionne <b>sans internet</b>, et vos documents restent
        <b> uniquement sur votre ordinateur</b>.
      </p>
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm space-y-1.5">
        <div><span className="text-slate-500">Auteur :</span> <b>{APP_AUTHOR}</b></div>
        <div><span className="text-slate-500">Licence :</span> {APP_LICENSE} — libre d’utilisation et de partage</div>
        <div>
          <span className="text-slate-500">Code source :</span>{' '}
          <a href={APP_REPO} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-1">
            GitHub <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div>
          <span className="text-slate-500">Version en ligne :</span>{' '}
          <a href={APP_SITE} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-1">
            {APP_SITE.replace('https://', '')} <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
      <p className="text-xs text-slate-500 flex items-center gap-1.5">
        <Heart className="w-3.5 h-3.5 text-rose-500" /> Fait avec soin par {APP_AUTHOR} • © {APP_YEAR}
      </p>
    </Modal>
  );
}
