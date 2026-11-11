import type { CanvasElementData, PageData, PubDocument } from './App';

let counter = 0;
const uid = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

interface TOpts {
  size?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right' | 'justify';
  font?: string;
}

const SERIF = 'Georgia, serif';
const SANS = 'Inter, sans-serif';
const FUN = '"Comic Sans MS", "Comic Neue", cursive';

function T(x: number, y: number, w: number, h: number, text: string, o: TOpts = {}): CanvasElementData {
  return {
    id: uid(), type: 'text', x, y, width: w, height: h, zIndex: 10, text,
    fontFamily: o.font ?? SANS, fontSize: o.size ?? 16, fontColor: o.color ?? '#0f172a',
    bold: !!o.bold, italic: !!o.italic, textAlign: o.align ?? 'left',
    fillColor: 'transparent', strokeColor: 'transparent', strokeWidth: 0
  };
}

function R(
  x: number, y: number, w: number, h: number, fill: string,
  o: { stroke?: string; sw?: number; radius?: number; variant?: 'rectangle' | 'circle' | 'line' } = {}
): CanvasElementData {
  return {
    id: uid(), type: 'shape', shapeVariant: o.variant ?? 'rectangle', x, y, width: w, height: h, zIndex: 2,
    fillColor: fill, strokeColor: o.stroke ?? 'transparent', strokeWidth: o.sw ?? 0, borderRadius: o.radius ?? 0
  };
}

function Bd(w: number, h: number, color: string, preset: 'classic' | 'double' | 'ornate' | 'modern' = 'double'): CanvasElementData {
  return {
    id: uid(), type: 'border', x: 20, y: 20, width: w - 40, height: h - 40, zIndex: 1,
    strokeColor: color, strokeWidth: 3, borderPreset: preset
  };
}

function page(name: string, elements: CanvasElementData[], background = '#ffffff'): PageData {
  return { id: uid(), name, background, backgroundPattern: 'none', elements };
}

function doc(
  title: string, category: string, orientation: 'portrait' | 'landscape', pages: PageData[]
): PubDocument {
  const [w, h] = orientation === 'portrait' ? [210, 297] : [297, 210];
  return {
    id: `tpl-${title}`, title, category, updatedAt: new Date().toISOString(), pageSize: 'A4',
    widthMm: w, heightMm: h, orientation, marginMm: 15, pages, isTemplate: true
  };
}

const PW = 794, PH = 1123; // A4 portrait @ 96 dpi
const LW = 1123, LH = 794; // A4 landscape

export type TemplateGroup = 'Classe' | 'Parents' | 'Récompenses' | 'Organisation';

export interface TemplateInfo {
  group: TemplateGroup;
  color: string;
  description: string;
  doc: PubDocument;
}

export function buildTemplates(): TemplateInfo[] {
  return [
    {
      group: 'Classe', color: '#2563eb', description: 'Pour afficher une consigne, une règle ou une information.',
      doc: doc('Affiche de classe', 'Affiche • 1 page', 'portrait', [
        page('Affiche', [
          Bd(PW, PH, '#2563eb'),
          R(40, 40, PW - 80, 200, '#2563eb', { radius: 16 }),
          T(60, 80, PW - 120, 90, 'TITRE DE L’AFFICHE', { size: 54, color: '#ffffff', bold: true, align: 'center', font: FUN }),
          T(60, 175, PW - 120, 40, 'Classe de CE1 • Année scolaire 2025-2026', { size: 20, color: '#dbeafe', align: 'center' }),
          R(60, 280, PW - 120, 460, '#eff6ff', { stroke: '#93c5fd', sw: 2, radius: 16 }),
          T(90, 310, PW - 180, 400, 'Double-cliquez pour écrire votre texte.\n\n• Première information\n• Deuxième information\n• Troisième information', { size: 26, color: '#1e3a8a' }),
          T(60, 790, PW - 120, 60, 'Une phrase importante à retenir !', { size: 30, color: '#be123c', bold: true, align: 'center', font: FUN }),
          T(60, 1000, PW - 120, 40, 'Mme / M. ……………………', { size: 18, color: '#475569', align: 'center' })
        ])
      ])
    },
    {
      group: 'Classe', color: '#7c3aed', description: 'Un journal de 2 pages avec articles, bravos et dates.',
      doc: doc('Journal de classe', 'Journal • 2 pages', 'portrait', [
        page('Une', [
          R(0, 0, PW, 170, '#7c3aed'),
          T(40, 30, PW - 80, 80, 'LE JOURNAL DE LA CLASSE', { size: 46, color: '#ffffff', bold: true, align: 'center', font: SERIF }),
          T(40, 115, PW - 80, 30, 'N° 1 • Mois / Année • École ……………………', { size: 16, color: '#ede9fe', align: 'center' }),
          T(40, 200, 460, 50, 'L’événement du mois', { size: 30, bold: true, color: '#5b21b6', font: SERIF }),
          T(40, 255, 460, 420, 'Écrivez ici l’article principal. Double-cliquez pour modifier le texte, puis utilisez les onglets en haut pour changer la police ou la couleur.', { size: 18, align: 'justify' }),
          R(530, 200, 224, 475, '#f5f3ff', { stroke: '#c4b5fd', sw: 1, radius: 12 }),
          T(545, 215, 194, 30, 'Le saviez-vous ?', { size: 20, bold: true, color: '#5b21b6' }),
          T(545, 255, 194, 400, 'Une anecdote, un petit jeu ou une recette de la classe.', { size: 16 }),
          R(40, 720, PW - 80, 4, '#7c3aed'),
          T(40, 745, 350, 40, 'Les bravos', { size: 26, bold: true, color: '#5b21b6', font: SERIF }),
          T(40, 790, 350, 250, '• ………………\n• ………………\n• ………………', { size: 18 }),
          T(410, 745, 344, 40, 'Les dates à retenir', { size: 26, bold: true, color: '#5b21b6', font: SERIF }),
          T(410, 790, 344, 250, '• …/…  Sortie\n• …/…  Réunion\n• …/…  Vacances', { size: 18 })
        ]),
        page('Page 2', [
          T(40, 40, PW - 80, 50, 'Les travaux des élèves', { size: 34, bold: true, color: '#5b21b6', font: SERIF }),
          R(40, 100, 345, 380, '#f8fafc', { stroke: '#cbd5e1', sw: 1, radius: 8 }),
          T(55, 115, 315, 350, 'Poème, dessin ou texte d’un élève.', { size: 16, italic: true }),
          R(409, 100, 345, 380, '#f8fafc', { stroke: '#cbd5e1', sw: 1, radius: 8 }),
          T(424, 115, 315, 350, 'Autre production de la classe.', { size: 16, italic: true }),
          T(40, 520, PW - 80, 50, 'Les jeux', { size: 34, bold: true, color: '#5b21b6', font: SERIF }),
          T(40, 580, PW - 80, 400, 'Devinette, mots mêlés, labyrinthe…', { size: 18 })
        ])
      ])
    },
    {
      group: 'Classe', color: '#4f46e5', description: 'Une feuille d’exercices avec nom, date et consignes.',
      doc: doc('Fiche d’exercices', 'Fiche • 1 page', 'portrait', [
        page('Fiche', [
          R(40, 40, PW - 80, 70, '#eef2ff', { stroke: '#a5b4fc', sw: 2, radius: 12 }),
          T(60, 58, 380, 36, 'Prénom : ……………………………', { size: 20 }),
          T(460, 58, 280, 36, 'Date : …… / …… / ……', { size: 20, align: 'right' }),
          T(40, 140, PW - 80, 60, 'Titre de la leçon', { size: 40, bold: true, color: '#3730a3', align: 'center', font: FUN }),
          T(40, 230, PW - 80, 36, '1. Consigne de l’exercice …………………………', { size: 20, bold: true }),
          T(40, 280, PW - 80, 240, '………………………………………………\n\n………………………………………………\n\n………………………………………………', { size: 22 }),
          T(40, 560, PW - 80, 36, '2. Consigne de l’exercice …………………………', { size: 20, bold: true }),
          T(40, 610, PW - 80, 240, '………………………………………………\n\n………………………………………………\n\n………………………………………………', { size: 22 })
        ])
      ])
    },
    {
      group: 'Parents', color: '#059669', description: 'Lettre officielle avec en-tête et coupon-réponse.',
      doc: doc('Lettre aux parents', 'Lettre • 1 page', 'portrait', [
        page('Lettre', [
          R(0, 0, PW, 14, '#059669'),
          T(60, 50, 420, 40, 'École ………………………………', { size: 24, bold: true, color: '#065f46', font: SERIF }),
          T(60, 90, 420, 60, 'Classe de ……  •  Mme / M. ……………\nAdresse • Téléphone • Courriel', { size: 14, color: '#475569' }),
          T(520, 50, 214, 30, 'Le …… / …… / ……', { size: 16, align: 'right' }),
          T(60, 200, PW - 120, 40, 'Objet : …………………………………', { size: 20, bold: true }),
          T(60, 270, PW - 120, 28, 'Chers parents,', { size: 18 }),
          T(60, 320, PW - 120, 520, 'Écrivez votre message ici. Double-cliquez sur ce cadre pour modifier le texte.\n\nVous pouvez ajouter un tableau ou une image depuis l’onglet « Insertion ».', { size: 18, align: 'justify' }),
          T(60, 880, PW - 120, 28, 'Cordialement,', { size: 18 }),
          T(60, 920, 300, 28, 'Signature', { size: 18, italic: true }),
          R(60, 1010, PW - 120, 2, '#a7f3d0'),
          T(60, 1020, PW - 120, 60, '✂ Coupon-réponse à rendre signé :  Nom de l’élève ………………  Signature ………………', { size: 14, color: '#475569' })
        ])
      ])
    },
    {
      group: 'Parents', color: '#ea580c', description: 'Invitation colorée pour une fête, une kermesse ou une sortie.',
      doc: doc('Invitation (fête / kermesse)', 'Invitation • 1 page', 'portrait', [
        page('Invitation', [
          Bd(PW, PH, '#ea580c', 'ornate'),
          R(70, 80, PW - 140, 6, '#fdba74'),
          T(60, 120, PW - 120, 60, 'Vous êtes invités !', { size: 52, color: '#c2410c', bold: true, align: 'center', font: FUN }),
          T(60, 260, PW - 120, 100, 'FÊTE DE L’ÉCOLE', { size: 64, color: '#9a3412', bold: true, align: 'center', font: SERIF }),
          R(PW / 2 - 130, 400, 260, 260, '#ffedd5', { variant: 'circle', stroke: '#fb923c', sw: 4 }),
          T(PW / 2 - 110, 480, 220, 100, '🎈', { size: 90, align: 'center' }),
          T(60, 720, PW - 120, 40, 'Samedi …… juin à …h……', { size: 30, align: 'center', bold: true }),
          T(60, 775, PW - 120, 40, 'Cour de l’école ………………', { size: 24, align: 'center' }),
          T(60, 860, PW - 120, 120, 'Spectacle des enfants, jeux, stands et goûter.\nVenez nombreux !', { size: 22, align: 'center', color: '#475569' })
        ], '#fff7ed')
      ])
    },
    {
      group: 'Récompenses', color: '#ca8a04', description: 'Un diplôme paysage à remplir avec le nom de l’élève.',
      doc: doc('Diplôme / Certificat', 'Certificat • 1 page', 'landscape', [
        page('Diplôme', [
          Bd(LW, LH, '#ca8a04', 'ornate'),
          T(60, 80, LW - 120, 80, 'DIPLÔME D’HONNEUR', { size: 60, color: '#854d0e', bold: true, align: 'center', font: SERIF }),
          T(60, 200, LW - 120, 40, 'décerné à', { size: 24, align: 'center', italic: true, color: '#475569' }),
          T(60, 260, LW - 120, 90, 'Prénom NOM', { size: 64, align: 'center', bold: true, font: FUN, color: '#1e293b' }),
          R(250, 360, LW - 500, 3, '#ca8a04'),
          T(120, 400, LW - 240, 120, 'pour son travail, son effort et sa gentillesse tout au long de l’année.', { size: 28, align: 'center', font: SERIF }),
          T(120, 620, 360, 30, 'Date : …… / …… / ……', { size: 18 }),
          T(LW - 480, 620, 360, 30, 'Signature de l’enseignant(e)', { size: 18, align: 'right' })
        ], '#fffbeb')
      ])
    },
    {
      group: 'Récompenses', color: '#db2777', description: 'Suivi de la semaine avec tableau et smileys.',
      doc: doc('Tableau de comportement', 'Suivi • 1 page', 'landscape', [
        page('Comportement', [
          T(40, 30, LW - 80, 60, 'MON TABLEAU DE COMPORTEMENT', { size: 40, color: '#9d174d', bold: true, align: 'center', font: FUN }),
          T(40, 95, LW - 80, 30, 'Prénom : ………………………   Semaine du …… au ……', { size: 20, align: 'center' }),
          {
            id: uid(), type: 'table', x: 40, y: 150, width: LW - 80, height: 560, zIndex: 5, rows: 6, cols: 6,
            tableData: [
              ['', 'Lundi', 'Mardi', 'Jeudi', 'Vendredi', 'Bilan'],
              ['J’écoute', '', '', '', '', ''],
              ['Je travaille', '', '', '', '', ''],
              ['Je respecte', '', '', '', '', ''],
              ['Je range', '', '', '', '', ''],
              ['Mot / Signature', '', '', '', '', '']
            ],
            strokeColor: '#f9a8d4', strokeWidth: 2, fillColor: '#fdf2f8'
          },
          T(40, 730, LW - 80, 30, '😀 Très bien    🙂 Bien    😐 À améliorer', { size: 18, align: 'center' })
        ])
      ])
    },
    {
      group: 'Organisation', color: '#0891b2', description: 'Tableau de la semaine à compléter avec les horaires.',
      doc: doc('Emploi du temps', 'Planning • 1 page', 'landscape', [
        page('Emploi du temps', [
          T(40, 25, LW - 80, 60, 'EMPLOI DU TEMPS DE LA CLASSE', { size: 38, color: '#155e75', bold: true, align: 'center', font: FUN }),
          {
            id: uid(), type: 'table', x: 40, y: 100, width: LW - 80, height: 640, zIndex: 5, rows: 8, cols: 5,
            tableData: [
              ['Horaires', 'Lundi', 'Mardi', 'Jeudi', 'Vendredi'],
              ['8h30 – 9h15', '', '', '', ''],
              ['9h15 – 10h00', '', '', '', ''],
              ['Récréation', '', '', '', ''],
              ['10h15 – 11h00', '', '', '', ''],
              ['11h00 – 11h45', '', '', '', ''],
              ['13h30 – 14h30', '', '', '', ''],
              ['14h30 – 15h30', '', '', '', '']
            ],
            strokeColor: '#67e8f9', strokeWidth: 2, fillColor: '#ecfeff'
          }
        ])
      ])
    }
  ];
}
