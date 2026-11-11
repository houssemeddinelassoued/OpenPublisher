# OpenPublisher

Logiciel libre de mise en page (PAO) pour remplacer Microsoft Publisher au quotidien : affiches, journaux de classe, lettres aux parents, invitations, diplômes… Pensé pour les enseignants.

**Version en ligne :** https://houssemeddinelassoued.github.io/OpenPublisher/

## Fonctionnalités

- 8 modèles prêts à l'emploi (affiche, journal, fiche d'exercices, lettre aux parents, invitation, diplôme, tableau de comportement, emploi du temps)
- Éditeur visuel : texte, images, formes, tableaux, cadres, numéros de page, multi-pages
- Export **PDF prêt à imprimer** et PNG
- Import de fichiers Publisher (`.pub`, récupération du texte et des images), Word (`.docx`) et HTML
- Fonctionne **hors ligne** ; les documents restent sur l'ordinateur (IndexedDB)
- Sauvegarde / restauration de tous les documents en un fichier
- Installable comme une application (PWA) depuis Chrome ou Edge
- Aide intégrée et interface 100 % en français

## Installer comme une application

Ouvrez la version en ligne dans Chrome ou Edge, puis : menu ⋮ → **Installer OpenPublisher** (ou « Enregistrer et partager → Créer un raccourci »). Une icône apparaît sur le bureau.

## Développement

Prérequis : Node.js 18+.

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production dans dist/
npm run preview
```

Stack : React, TypeScript, Vite, Tailwind CSS v4, lucide-react.

## Limites connues

- Le format `.pub` est propriétaire : l'import récupère le texte et les images, mais pas la mise en page exacte. Vérifiez toujours le résultat.
- L'export PDF est basé sur des images haute résolution (le texte n'est pas sélectionnable).

## Auteur et licence

© Houssemeddine Lassoued — licence [MIT](LICENSE).
