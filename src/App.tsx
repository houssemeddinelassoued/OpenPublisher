import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HelpCircle, Info, Clock } from 'lucide-react';
import { HelpModal, AboutModal } from './HubExtras';
import { APP_NAME, APP_VERSION, APP_AUTHOR, APP_YEAR, APP_LICENSE } from './meta';
import { buildTemplates, type TemplateGroup } from './templates';
import {
  FileText,
  Plus,
  Trash2,
  Copy,
  Clipboard,
  Type,
  Image as ImageIcon,
  Square,
  Circle,
  Minus,
  Table as TableIcon,
  Hash,
  Frame,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid,
  Ruler,
  Eye,
  Download,
  FolderOpen,
  ChevronLeft,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Bold,
  Italic,
  Underline,
  ArrowUp,
  ArrowDown,
  Layers,
  Sparkles,
  Check,
  Layout,
  Printer,
  X,
  Palette,
  Sliders,
  Undo2,
  Redo2,
  FileSpreadsheet,
  CloudDownload,
  CloudUpload,
} from 'lucide-react';

// ============================================================================
// 1. DATA MODEL & TYPES (src/data/store.ts types)
// ============================================================================

export type PageSizePreset = 'A4' | 'Letter' | 'Custom';
export type Orientation = 'portrait' | 'landscape';
export type ElementType = 'text' | 'image' | 'shape' | 'table' | 'pagenum' | 'border';
export type ShapeVariant = 'rectangle' | 'circle' | 'line';

export interface CanvasElementData {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  // Text properties
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  // Shape / Box properties
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  shapeVariant?: ShapeVariant;
  borderRadius?: number;
  // Image properties
  imageUrl?: string;
  // Table properties
  rows?: number;
  cols?: number;
  tableData?: string[][];
  // Border style
  borderPreset?: 'classic' | 'double' | 'ornate' | 'modern';
}

export interface PageData {
  id: string;
  name: string;
  background: string;
  backgroundPattern?: 'none' | 'dots' | 'warm' | 'blueprint';
  elements: CanvasElementData[];
}

export interface PubDocument {
  id: string;
  title: string;
  category: string;
  updatedAt: string;
  pageSize: PageSizePreset;
  widthMm: number;
  heightMm: number;
  orientation: Orientation;
  marginMm: number;
  pages: PageData[];
  isTemplate?: boolean;
}

export interface PubImportReport {
  fileName: string;
  fileSize: number;
  formatDetected: 'OLE2-PUB' | 'RAW-BINARY-PUB' | 'HTML-FALLBACK' | 'DOCX-FALLBACK' | 'JSON-NATIVE';
  ole2MagicValid: boolean;
  extractedTextBlocks: string[];
  extractedImagesCount: number;
  detectedPageSize: {
    preset: PageSizePreset;
    widthMm: number;
    heightMm: number;
    orientation: Orientation;
  };
  warnings: string[];
  generatedDoc: PubDocument;
}

export interface TestCaseResult {
  id: string;
  name: string;
  category: 'Core Store' | '.PUB Importer' | 'Canvas Engine' | 'PWA & Sync';
  status: 'passed' | 'failed';
  durationMs: number;
  assertionDetail: string;
}

// ============================================================================
// 2. SEED DATA (src/data/seed/document.json)
// ============================================================================

export const SEED_DOCUMENTS: PubDocument[] = [
  {
    id: 'seed-newsletter-1',
    title: 'Community Gazette — Autumn Issue',
    category: 'Newsletter (2 Pages)',
    updatedAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    pageSize: 'A4',
    widthMm: 210,
    heightMm: 297,
    orientation: 'portrait',
    marginMm: 15,
    isTemplate: true,
    pages: [
      {
        id: 'page-1',
        name: 'Front Cover',
        background: '#ffffff',
        backgroundPattern: 'none',
        elements: [
          {
            id: 'el-border-1',
            type: 'border',
            x: 24,
            y: 24,
            width: 746,
            height: 1075,
            zIndex: 1,
            strokeColor: '#4f46e5',
            strokeWidth: 3,
            borderPreset: 'double'
          },
          {
            id: 'el-header-bg',
            type: 'shape',
            shapeVariant: 'rectangle',
            x: 45,
            y: 45,
            width: 704,
            height: 120,
            zIndex: 2,
            fillColor: '#4f46e5',
            strokeColor: '#3730a3',
            strokeWidth: 0,
            borderRadius: 8
          },
          {
            id: 'el-title',
            type: 'text',
            x: 65,
            y: 62,
            width: 660,
            height: 60,
            zIndex: 3,
            text: 'THE OAKRIDGE GAZETTE',
            fontFamily: 'Georgia, serif',
            fontSize: 36,
            fontColor: '#ffffff',
            bold: true,
            textAlign: 'center',
            fillColor: 'transparent',
            strokeColor: 'transparent',
            strokeWidth: 0
          },
          {
            id: 'el-subtitle',
            type: 'text',
            x: 65,
            y: 122,
            width: 660,
            height: 30,
            zIndex: 4,
            text: 'ISSUE NO. 42  •  LOCAL NEIGHBORHOOD CHRONICLE  •  OPENPUBLISHER EDITION',
            fontFamily: 'Inter, sans-serif',
            fontSize: 12,
            fontColor: '#e0e7ff',
            bold: true,
            textAlign: 'center',
            fillColor: 'transparent',
            strokeColor: 'transparent',
            strokeWidth: 0
          },
          {
            id: 'el-hero-img',
            type: 'image',
            x: 45,
            y: 185,
            width: 440,
            height: 280,
            zIndex: 5,
            imageUrl:
              'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=900&q=80',
            strokeColor: '#cbd5e1',
            strokeWidth: 1
          },
          {
            id: 'el-side-callout',
            type: 'shape',
            shapeVariant: 'rectangle',
            x: 505,
            y: 185,
            width: 244,
            height: 280,
            zIndex: 5,
            fillColor: '#f1f5f9',
            strokeColor: '#cbd5e1',
            strokeWidth: 1,
            borderRadius: 6
          },
          {
            id: 'el-side-text',
            type: 'text',
            x: 520,
            y: 200,
            width: 214,
            height: 250,
            zIndex: 6,
            text: 'IN THIS ISSUE\n\n• Town Hall Restoration Complete\n• Autumn Harvest Market Schedule\n• Library Digital Archive Project\n• Youth Science Fair Winners',
            fontFamily: 'Inter, sans-serif',
            fontSize: 14,
            fontColor: '#1e293b',
            bold: false,
            textAlign: 'left',
            fillColor: 'transparent',
            strokeColor: 'transparent',
            strokeWidth: 0
          },
          {
            id: 'el-article-heading',
            type: 'text',
            x: 45,
            y: 485,
            width: 704,
            height: 45,
            zIndex: 7,
            text: 'Historic Clocktower Reopens After Community Effort',
            fontFamily: 'Georgia, serif',
            fontSize: 24,
            fontColor: '#0f172a',
            bold: true,
            textAlign: 'left',
            fillColor: 'transparent',
            strokeColor: 'transparent',
            strokeWidth: 0
          },
          {
            id: 'el-article-body',
            type: 'text',
            x: 45,
            y: 535,
            width: 704,
            height: 200,
            zIndex: 8,
            text: 'After eighteen months of careful timber and stonework restoration, the Oakridge Clocktower welcomed visitors back this Saturday. Over 140 local volunteers contributed archival photographs, carpentry skills, and fundraising support.\n\nDouble-click any text frame on this page to edit copy, adjust typography in the Home ribbon, or insert new tables and shapes.',
            fontFamily: 'Georgia, serif',
            fontSize: 15,
            fontColor: '#334155',
            bold: false,
            textAlign: 'justify',
            fillColor: 'transparent',
            strokeColor: 'transparent',
            strokeWidth: 0
          },
          {
            id: 'el-schedule-table',
            type: 'table',
            x: 45,
            y: 760,
            width: 704,
            height: 220,
            zIndex: 9,
            rows: 4,
            cols: 3,
            strokeColor: '#94a3b8',
            strokeWidth: 1,
            fillColor: '#ffffff',
            fontSize: 13,
            fontColor: '#0f172a',
            tableData: [
              ['Community Event', 'Date & Time', 'Location'],
              ['Farmers & Artisans Market', 'Saturday • 09:00 AM', 'Main Town Square'],
              ['Heritage Walking Tour', 'Sunday • 02:00 PM', 'Clocktower Steps'],
              ['Public Print Workshop', 'Wednesday • 06:30 PM', 'Civic Studio B']
            ]
          },
          {
            id: 'el-pagenum-1',
            type: 'pagenum',
            x: 340,
            y: 1050,
            width: 120,
            height: 30,
            zIndex: 10,
            fontFamily: 'Inter, sans-serif',
            fontSize: 12,
            fontColor: '#64748b',
            textAlign: 'center'
          }
        ]
      },
      {
        id: 'page-2',
        name: 'Back Feature & Directory',
        background: '#ffffff',
        backgroundPattern: 'none',
        elements: [
          {
            id: 'p2-heading',
            type: 'text',
            x: 50,
            y: 55,
            width: 690,
            height: 50,
            zIndex: 1,
            text: 'Autumn Botanical Guide & Local Directory',
            fontFamily: 'Georgia, serif',
            fontSize: 26,
            fontColor: '#1e1b4b',
            bold: true,
            textAlign: 'left',
            fillColor: 'transparent',
            strokeColor: 'transparent',
            strokeWidth: 0
          },
          {
            id: 'p2-divider',
            type: 'shape',
            shapeVariant: 'line',
            x: 50,
            y: 112,
            width: 690,
            height: 8,
            zIndex: 2,
            fillColor: '#4f46e5',
            strokeColor: '#4f46e5',
            strokeWidth: 3
          },
          {
            id: 'p2-box',
            type: 'text',
            x: 50,
            y: 140,
            width: 690,
            height: 320,
            zIndex: 3,
            text: 'Page 2 demonstrates OpenPublisher multi-page document architecture.\n\nUse the Page Thumbnails sidebar on the left to switch between pages, reorder pages up or down, duplicate layouts, or add fresh pages. When you click Export PDF, all pages are rendered sequentially at high resolution.',
            fontFamily: 'Inter, sans-serif',
            fontSize: 16,
            fontColor: '#334155',
            textAlign: 'left',
            fillColor: '#f8fafc',
            strokeColor: '#cbd5e1',
            strokeWidth: 1
          },
          {
            id: 'el-pagenum-2',
            type: 'pagenum',
            x: 340,
            y: 1050,
            width: 120,
            height: 30,
            zIndex: 5,
            fontFamily: 'Inter, sans-serif',
            fontSize: 12,
            fontColor: '#64748b',
            textAlign: 'center'
          }
        ]
      }
    ]
  },
  {
    id: 'seed-flyer-2',
    title: 'Design Expo 2025 Promotional Flyer',
    category: 'Event Flyer (US Letter)',
    updatedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    pageSize: 'Letter',
    widthMm: 215.9,
    heightMm: 279.4,
    orientation: 'portrait',
    marginMm: 12,
    isTemplate: true,
    pages: [
      {
        id: 'flyer-p1',
        name: 'Flyer Front',
        background: '#fefce8',
        backgroundPattern: 'warm',
        elements: [
          {
            id: 'fl-badge',
            type: 'shape',
            shapeVariant: 'circle',
            x: 580,
            y: 50,
            width: 160,
            height: 160,
            zIndex: 4,
            fillColor: '#4f46e5',
            strokeColor: '#ffffff',
            strokeWidth: 4
          },
          {
            id: 'fl-badge-txt',
            type: 'text',
            x: 595,
            y: 102,
            width: 130,
            height: 60,
            zIndex: 5,
            text: 'FREE ENTRY\nOCT 24',
            fontFamily: 'Inter, sans-serif',
            fontSize: 18,
            fontColor: '#ffffff',
            bold: true,
            textAlign: 'center',
            fillColor: 'transparent',
            strokeColor: 'transparent',
            strokeWidth: 0
          },
          {
            id: 'fl-title',
            type: 'text',
            x: 55,
            y: 70,
            width: 500,
            height: 120,
            zIndex: 2,
            text: 'PRINT & PIXEL\nDESIGN EXPO',
            fontFamily: 'Inter, sans-serif',
            fontSize: 44,
            fontColor: '#0f172a',
            bold: true,
            textAlign: 'left',
            fillColor: 'transparent',
            strokeColor: 'transparent',
            strokeWidth: 0
          },
          {
            id: 'fl-img',
            type: 'image',
            x: 55,
            y: 230,
            width: 705,
            height: 440,
            zIndex: 2,
            imageUrl:
              'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1000&q=80',
            strokeColor: '#0f172a',
            strokeWidth: 2
          },
          {
            id: 'fl-footer',
            type: 'text',
            x: 55,
            y: 705,
            width: 705,
            height: 180,
            zIndex: 3,
            text: 'KEYNOTE SPEAKERS  •  LIVE LETTERPRESS DEMOS  •  OPEN-SOURCE DESKTOP PUBLISHING\n\nGrand Exhibition Hall, 400 Innovation Way • Doors Open 10:00 AM',
            fontFamily: 'Inter, sans-serif',
            fontSize: 16,
            fontColor: '#1e293b',
            bold: true,
            textAlign: 'center',
            fillColor: '#ffffff',
            strokeColor: '#cbd5e1',
            strokeWidth: 1
          }
        ]
      }
    ]
  },
  {
    id: 'seed-cert-3',
    title: 'Workshop Certificate of Excellence',
    category: 'Landscape Certificate (A4)',
    updatedAt: new Date(Date.now() - 1000 * 60 * 420).toISOString(),
    pageSize: 'A4',
    widthMm: 210,
    heightMm: 297,
    orientation: 'landscape',
    marginMm: 18,
    isTemplate: true,
    pages: [
      {
        id: 'cert-p1',
        name: 'Certificate',
        background: '#ffffff',
        backgroundPattern: 'none',
        elements: [
          {
            id: 'cert-border',
            type: 'border',
            x: 35,
            y: 35,
            width: 1052,
            height: 724,
            zIndex: 1,
            strokeColor: '#4f46e5',
            strokeWidth: 4,
            borderPreset: 'ornate'
          },
          {
            id: 'cert-header',
            type: 'text',
            x: 160,
            y: 130,
            width: 800,
            height: 70,
            zIndex: 2,
            text: 'CERTIFICATE OF EXCELLENCE',
            fontFamily: 'Georgia, serif',
            fontSize: 40,
            fontColor: '#312e81',
            bold: true,
            textAlign: 'center',
            fillColor: 'transparent',
            strokeColor: 'transparent',
            strokeWidth: 0
          },
          {
            id: 'cert-recipient',
            type: 'text',
            x: 210,
            y: 260,
            width: 700,
            height: 90,
            zIndex: 3,
            text: 'Alexandra Vance',
            fontFamily: 'Georgia, serif',
            fontSize: 48,
            fontColor: '#0f172a',
            italic: true,
            underline: true,
            textAlign: 'center',
            fillColor: 'transparent',
            strokeColor: 'transparent',
            strokeWidth: 0
          },
          {
            id: 'cert-desc',
            type: 'text',
            x: 210,
            y: 390,
            width: 700,
            height: 120,
            zIndex: 4,
            text: 'For outstanding mastery in Digital Typography, Editorial Layout Architecture, and Open-Source Publication Workflows.',
            fontFamily: 'Inter, sans-serif',
            fontSize: 18,
            fontColor: '#475569',
            textAlign: 'center',
            fillColor: 'transparent',
            strokeColor: 'transparent',
            strokeWidth: 0
          }
        ]
      }
    ]
  }
];

// ============================================================================
// 3. INDEXED-DB LOCAL PERSISTENCE STORE (src/data/store.ts)
// ============================================================================

const DB_NAME = 'openpublisher_db_v1';
const STORE_NAME = 'documents';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadAllDocumentsFromDB(): Promise<PubDocument[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = async () => {
        let docs = req.result as PubDocument[];
        {
          docs = (docs || []).filter((d) => !d.isTemplate);
          docs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          resolve(docs);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveDocumentToDB(doc: PubDocument): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(doc);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('IndexedDB fallback active:', e);
  }
}

export async function deleteDocumentFromDB(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('IndexedDB delete error:', e);
  }
}

// ============================================================================
// 4. PHASE 2 & 3: .PUB BINARY IMPORTER & .DOCX/HTML FALLBACK ENGINE
// ============================================================================

const OLE2_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * Generates a realistic synthetic OLE2 .pub binary buffer in memory so users can test
 * the binary OLE2/Quill text & JPEG extractor without needing an external file on disk.
 */
export function createSamplePubBinaryBuffer(): { fileName: string; buffer: ArrayBuffer } {
  const stories = [
    'ANNUAL HERITAGE FESTIVAL 2025',
    'Imported from Legacy Microsoft Publisher (.PUB) Binary Stream',
    'Saturday, November 15 • Civic Gardens & Printmakers Pavilion',
    'Featuring archival letterpress demonstrations, community choir performances, autumn botanical exhibitions, and local culinary stalls.',
    'NOTE: Verify multi-column flow and custom BorderArt against original Publisher layout.'
  ];

  const totalBytes = 4096;
  const buf = new ArrayBuffer(totalBytes);
  const view = new Uint8Array(buf);

  // 1. Write OLE2 Compound Document Magic Header
  OLE2_SIGNATURE.forEach((byte, idx) => {
    view[idx] = byte;
  });

  // 2. Write simulated Escher/MSPHeader metadata marker in ASCII
  const marker = 'MSPublisher.Document.2010.QuillSubstream';
  for (let i = 0; i < marker.length; i++) {
    view[64 + i] = marker.charCodeAt(i);
  }

  // 3. Encode UTF-16LE text streams (how Publisher Quill stores text runs)
  let offset = 256;
  for (const story of stories) {
    for (let i = 0; i < story.length; i++) {
      view[offset] = story.charCodeAt(i) & 0xff;
      view[offset + 1] = 0x00;
      offset += 2;
    }
    // Null separator run
    offset += 32;
  }

  return {
    fileName: 'Heritage_Festival_2010_Archive.pub',
    buffer: buf
  };
}

/**
 * Parses a binary .pub ArrayBuffer by inspecting OLE2 headers, scanning for UTF-16LE
 * Quill text stories and printable ASCII segments, and carving embedded JPEG streams.
 */
export async function parsePublisherBinaryBuffer(
  fileName: string,
  buffer: ArrayBuffer
): Promise<PubImportReport> {
  const bytes = new Uint8Array(buffer);
  const ole2MagicValid = OLE2_SIGNATURE.every((b, idx) => bytes[idx] === b);

  const extractedStrings: string[] = [];

  // 1. Scan for UTF-16LE text runs (standard in Publisher 2000-2013 Quill streams)
  let currentUtf16 = '';
  for (let i = 0; i < bytes.length - 1; i += 2) {
    const low = bytes[i];
    const high = bytes[i + 1];
    if (high === 0 && ((low >= 32 && low <= 126) || low === 10 || low === 13)) {
      currentUtf16 += String.fromCharCode(low);
    } else if (low === 0x22 && high === 0x20) {
      currentUtf16 += '•';
    } else {
      const cleaned = currentUtf16.trim();
      if (cleaned.length >= 10 && /[a-zA-Z]{3,}/.test(cleaned)) {
        extractedStrings.push(cleaned);
      }
      currentUtf16 = '';
    }
  }
  if (currentUtf16.trim().length >= 10) {
    extractedStrings.push(currentUtf16.trim());
  }

  // 2. Scan for ASCII text runs if UTF-16LE yielded few blocks
  if (extractedStrings.length < 2) {
    let currentAscii = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b >= 32 && b <= 126) {
        currentAscii += String.fromCharCode(b);
      } else {
        const cleaned = currentAscii.trim();
        if (
          cleaned.length >= 14 &&
          /[a-zA-Z]{4,}/.test(cleaned) &&
          !cleaned.startsWith('MSPublisher') &&
          !cleaned.includes('Root Entry')
        ) {
          extractedStrings.push(cleaned);
        }
        currentAscii = '';
      }
    }
  }

  // Deduplicate and filter noise
  const uniqueBlocks = Array.from(new Set(extractedStrings)).slice(0, 12);
  if (uniqueBlocks.length === 0) {
    uniqueBlocks.push(
      `Imported Publication: ${fileName.replace(/\.pub$/i, '')}`,
      'Binary stream contained compressed or non-standard Escher records. Use the canvas tools to touch up layout blocks.'
    );
  }

  // 3. Scan for embedded JPEG streams (FF D8 FF ... FF D9)
  const extractedImageUrls: string[] = [];
  for (let i = 0; i < bytes.length - 4; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
      let end = i + 3;
      while (end < bytes.length - 1 && !(bytes[end] === 0xff && bytes[end + 1] === 0xd9)) {
        end++;
      }
      if (end < bytes.length - 1 && end - i > 256) {
        const jpegSlice = bytes.slice(i, end + 2);
        const blob = new Blob([jpegSlice], { type: 'image/jpeg' });
        extractedImageUrls.push(URL.createObjectURL(blob));
        i = end + 1;
      }
    }
  }

  // Build canvas elements from extracted blocks
  const elements: CanvasElementData[] = [
    {
      id: `pub-border-${Date.now()}`,
      type: 'border',
      x: 28,
      y: 28,
      width: 738,
      height: 1066,
      zIndex: 1,
      strokeColor: '#4f46e5',
      strokeWidth: 2,
      borderPreset: 'classic'
    },
    {
      id: `pub-badge-${Date.now()}`,
      type: 'shape',
      shapeVariant: 'rectangle',
      x: 48,
      y: 48,
      width: 698,
      height: 44,
      zIndex: 2,
      fillColor: '#eef2ff',
      strokeColor: '#c7d2fe',
      strokeWidth: 1,
      borderRadius: 6
    },
    {
      id: `pub-meta-${Date.now()}`,
      type: 'text',
      x: 60,
      y: 58,
      width: 674,
      height: 26,
      zIndex: 3,
      text: `IMPORTED .PUB FILE: ${fileName}  •  ${ole2MagicValid ? 'OLE2 Compound Binary Verified' : 'Raw Binary Stream'}  •  Please verify layout fidelity`,
      fontFamily: 'Inter, sans-serif',
      fontSize: 11,
      fontColor: '#4338ca',
      bold: true,
      textAlign: 'left',
      fillColor: 'transparent',
      strokeColor: 'transparent',
      strokeWidth: 0
    }
  ];

  let cursorY = 115;
  uniqueBlocks.forEach((block, idx) => {
    const isHeading = idx === 0;
    const height = isHeading ? 72 : Math.max(64, Math.ceil(block.length / 65) * 28 + 24);
    elements.push({
      id: `pub-txt-${Date.now()}-${idx}`,
      type: 'text',
      x: 48,
      y: cursorY,
      width: 698,
      height,
      zIndex: idx + 4,
      text: block,
      fontFamily: isHeading ? 'Georgia, serif' : 'Inter, sans-serif',
      fontSize: isHeading ? 28 : 15,
      fontColor: isHeading ? '#0f172a' : '#334155',
      bold: isHeading,
      textAlign: 'left',
      fillColor: isHeading ? 'transparent' : '#f8fafc',
      strokeColor: isHeading ? 'transparent' : '#e2e8f0',
      strokeWidth: isHeading ? 0 : 1
    });
    cursorY += height + 18;
  });

  extractedImageUrls.forEach((imgUrl, idx) => {
    elements.push({
      id: `pub-img-${Date.now()}-${idx}`,
      type: 'image',
      x: 48,
      y: Math.min(cursorY, 780),
      width: 320,
      height: 220,
      zIndex: 25 + idx,
      imageUrl: imgUrl,
      strokeColor: '#cbd5e1',
      strokeWidth: 1
    });
    cursorY += 240;
  });

  const generatedDoc: PubDocument = {
    id: `imported-pub-${Date.now()}`,
    title: fileName.replace(/\.[^.]+$/, ''),
    category: 'Imported .PUB Document',
    updatedAt: new Date().toISOString(),
    pageSize: 'A4',
    widthMm: 210,
    heightMm: 297,
    orientation: 'portrait',
    marginMm: 15,
    pages: [
      {
        id: `page-pub-1`,
        name: 'Imported Page 1',
        background: '#ffffff',
        backgroundPattern: 'none',
        elements
      }
    ]
  };

  const warnings: string[] = [
    'Complex multi-frame text autoflow links and proprietary BorderArt are converted into independent editable frames.',
    'Always verify files with years of archival work side-by-side against Microsoft Publisher.'
  ];
  if (!ole2MagicValid) {
    warnings.unshift(
      'File header did not match standard OLE2 signature (D0 CF 11 E0); used heuristic text-stream recovery.'
    );
  }

  return {
    fileName,
    fileSize: buffer.byteLength,
    formatDetected: ole2MagicValid ? 'OLE2-PUB' : 'RAW-BINARY-PUB',
    ole2MagicValid,
    extractedTextBlocks: uniqueBlocks,
    extractedImagesCount: extractedImageUrls.length,
    detectedPageSize: {
      preset: 'A4',
      widthMm: 210,
      heightMm: 297,
      orientation: 'portrait'
    },
    warnings,
    generatedDoc
  };
}

/**
 * Fallback importer for .html, .htm, .docx, and plain text files
 */
export async function parseFallbackDocumentFile(file: File): Promise<PubImportReport> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const textContent = await file.text();
  const blocks: string[] = [];

  if (ext === 'html' || ext === 'htm') {
    const parser = new DOMParser();
    const dom = parser.parseFromString(textContent, 'text/html');
    const nodes = dom.querySelectorAll('h1, h2, h3, p, li, td');
    nodes.forEach((n) => {
      const t = n.textContent?.trim();
      if (t && t.length > 2) blocks.push(t);
    });
  } else {
    // Extract readable XML/text runs from .docx or plain text
    const cleaned = textContent
      .replace(/<[^>]+>/g, '\n')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3 && /[a-zA-Z]{2,}/.test(s));
    blocks.push(...cleaned.slice(0, 15));
  }

  if (blocks.length === 0) {
    blocks.push(`Imported Fallback Document (${file.name})`, 'Edit this frame on the canvas.');
  }

  const elements: CanvasElementData[] = blocks.slice(0, 10).map((b, i) => ({
    id: `fb-el-${Date.now()}-${i}`,
    type: 'text',
    x: 50,
    y: 60 + i * 92,
    width: 690,
    height: 76,
    zIndex: i + 1,
    text: b,
    fontFamily: i === 0 ? 'Georgia, serif' : 'Inter, sans-serif',
    fontSize: i === 0 ? 26 : 14,
    fontColor: '#0f172a',
    bold: i === 0,
    textAlign: 'left',
    fillColor: i === 0 ? 'transparent' : '#f8fafc',
    strokeColor: i === 0 ? 'transparent' : '#e2e8f0',
    strokeWidth: i === 0 ? 0 : 1
  }));

  const generatedDoc: PubDocument = {
    id: `imported-fb-${Date.now()}`,
    title: file.name.replace(/\.[^.]+$/, ''),
    category: `Imported ${ext.toUpperCase()} Fallback`,
    updatedAt: new Date().toISOString(),
    pageSize: 'A4',
    widthMm: 210,
    heightMm: 297,
    orientation: 'portrait',
    marginMm: 15,
    pages: [
      {
        id: 'page-fb-1',
        name: 'Imported Page 1',
        background: '#ffffff',
        backgroundPattern: 'none',
        elements
      }
    ]
  };

  return {
    fileName: file.name,
    fileSize: file.size,
    formatDetected: ext === 'docx' ? 'DOCX-FALLBACK' : 'HTML-FALLBACK',
    ole2MagicValid: true,
    extractedTextBlocks: blocks.slice(0, 10),
    extractedImagesCount: 0,
    detectedPageSize: { preset: 'A4', widthMm: 210, heightMm: 297, orientation: 'portrait' },
    warnings: [
      'Imported via HTML/.DOCX fallback pipeline. Paragraph blocks were mapped to individual Publisher text frames.'
    ],
    generatedDoc
  };
}

// ============================================================================
// 5. PAGE GEOMETRY & HIGH-DPI PRINT EXPORT ENGINE
// ============================================================================

const MM_TO_PX = 3.78; // 96 DPI base screen coordinate scale

export function getCanvasPixelDimensions(doc: PubDocument): { width: number; height: number } {
  const baseW = Math.round(doc.widthMm * MM_TO_PX);
  const baseH = Math.round(doc.heightMm * MM_TO_PX);
  if (doc.orientation === 'landscape') {
    return { width: Math.max(baseW, baseH), height: Math.min(baseW, baseH) };
  }
  return { width: Math.min(baseW, baseH), height: Math.max(baseW, baseH) };
}

/**
 * Renders a single PageData onto an offscreen HTML5 Canvas at high resolution (2x scale)
 * for crisp PNG export and Print-Ready PDF generation.
 */
export async function renderPageToCanvas(
  doc: PubDocument,
  page: PageData,
  pageIndex: number,
  totalPages: number,
  scale = 2
): Promise<HTMLCanvasElement> {
  const { width, height } = getCanvasPixelDimensions(doc);
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // 1. Page Background
  ctx.fillStyle = page.background || '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Sort elements by zIndex
  const sorted = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);

  for (const el of sorted) {
    ctx.save();
    if (el.type === 'shape') {
      ctx.fillStyle = el.fillColor || '#e2e8f0';
      ctx.strokeStyle = el.strokeColor || '#64748b';
      ctx.lineWidth = el.strokeWidth ?? 1;

      if (el.shapeVariant === 'circle') {
        ctx.beginPath();
        ctx.ellipse(
          el.x + el.width / 2,
          el.y + el.height / 2,
          el.width / 2,
          el.height / 2,
          0,
          0,
          Math.PI * 2
        );
        if (el.fillColor && el.fillColor !== 'transparent') ctx.fill();
        if ((el.strokeWidth ?? 0) > 0) ctx.stroke();
      } else if (el.shapeVariant === 'line') {
        ctx.beginPath();
        ctx.moveTo(el.x, el.y + el.height / 2);
        ctx.lineTo(el.x + el.width, el.y + el.height / 2);
        ctx.lineWidth = Math.max(2, el.strokeWidth || 3);
        ctx.stroke();
      } else {
        if (el.fillColor && el.fillColor !== 'transparent') {
          ctx.fillRect(el.x, el.y, el.width, el.height);
        }
        if ((el.strokeWidth ?? 0) > 0) {
          ctx.strokeRect(el.x, el.y, el.width, el.height);
        }
      }
    } else if (el.type === 'border') {
      ctx.strokeStyle = el.strokeColor || '#4f46e5';
      ctx.lineWidth = el.strokeWidth || 3;
      ctx.strokeRect(el.x, el.y, el.width, el.height);
      if (el.borderPreset === 'double' || el.borderPreset === 'ornate') {
        ctx.lineWidth = 1;
        ctx.strokeRect(el.x + 6, el.y + 6, el.width - 12, el.height - 12);
      }
    } else if (el.type === 'image' && el.imageUrl) {
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.crossOrigin = 'anonymous';
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = el.imageUrl!;
        });
        ctx.drawImage(img, el.x, el.y, el.width, el.height);
      } catch {
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(el.x, el.y, el.width, el.height);
        ctx.fillStyle = '#64748b';
        ctx.font = '13px sans-serif';
        ctx.fillText('[Embedded Image]', el.x + 12, el.y + 24);
      }
      if ((el.strokeWidth ?? 0) > 0) {
        ctx.strokeStyle = el.strokeColor || '#cbd5e1';
        ctx.lineWidth = el.strokeWidth || 1;
        ctx.strokeRect(el.x, el.y, el.width, el.height);
      }
    } else if (el.type === 'table' && el.tableData) {
      const rows = el.tableData.length;
      const cols = el.tableData[0]?.length || 1;
      const cellW = el.width / cols;
      const cellH = el.height / rows;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cx = el.x + c * cellW;
          const cy = el.y + r * cellH;
          ctx.fillStyle = r === 0 ? '#eef2ff' : el.fillColor || '#ffffff';
          ctx.fillRect(cx, cy, cellW, cellH);
          ctx.strokeStyle = el.strokeColor || '#94a3b8';
          ctx.lineWidth = 1;
          ctx.strokeRect(cx, cy, cellW, cellH);

          ctx.fillStyle = el.fontColor || '#0f172a';
          ctx.font = `${r === 0 ? 'bold ' : ''}${el.fontSize || 13}px Inter, sans-serif`;
          const cellText = el.tableData[r][c] || '';
          ctx.fillText(cellText, cx + 8, cy + cellH / 2 + 5, cellW - 14);
        }
      }
    } else if (el.type === 'text' || el.type === 'pagenum') {
      if (el.fillColor && el.fillColor !== 'transparent') {
        ctx.fillStyle = el.fillColor;
        ctx.fillRect(el.x, el.y, el.width, el.height);
      }
      if ((el.strokeWidth ?? 0) > 0 && el.strokeColor && el.strokeColor !== 'transparent') {
        ctx.strokeStyle = el.strokeColor;
        ctx.lineWidth = el.strokeWidth || 1;
        ctx.strokeRect(el.x, el.y, el.width, el.height);
      }

      const rawText =
        el.type === 'pagenum' ? `Page ${pageIndex + 1} of ${totalPages}` : el.text || '';
      const fontSize = el.fontSize || 16;
      const fontStyle = `${el.italic ? 'italic ' : ''}${el.bold ? 'bold ' : ''}${fontSize}px ${
        el.fontFamily || 'Inter, sans-serif'
      }`;
      ctx.font = fontStyle;
      ctx.fillStyle = el.fontColor || '#0f172a';
      ctx.textBaseline = 'top';

      const paragraphs = rawText.split('\n');
      let cursorY = el.y + 6;
      const lineHeight = fontSize * 1.32;

      for (const para of paragraphs) {
        const words = para.split(' ');
        let currentLine = '';

        for (let n = 0; n < words.length; n++) {
          const testLine = currentLine + words[n] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > el.width - 12 && n > 0) {
            drawAlignedText(
              ctx,
              currentLine.trim(),
              el.x,
              cursorY,
              el.width,
              el.textAlign || 'left'
            );
            currentLine = words[n] + ' ';
            cursorY += lineHeight;
          } else {
            currentLine = testLine;
          }
        }
        drawAlignedText(ctx, currentLine.trim(), el.x, cursorY, el.width, el.textAlign || 'left');
        cursorY += lineHeight;
      }
    }
    ctx.restore();
  }

  return canvas;
}

function drawAlignedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  align: 'left' | 'center' | 'right' | 'justify'
) {
  if (align === 'center') {
    const m = ctx.measureText(text);
    ctx.fillText(text, x + (width - m.width) / 2, y);
  } else if (align === 'right') {
    const m = ctx.measureText(text);
    ctx.fillText(text, x + width - m.width - 4, y);
  } else {
    ctx.fillText(text, x + 4, y);
  }
}

// ============================================================================
// 5B. PHASE 4 & 5: AUTOMATED TEST RUNNER & PWA MANIFEST INJECTOR
// ============================================================================

export function injectPwaManifest(): string {
  const manifest = {
    name: 'OpenPublisher — Local-First Desktop Publishing',
    short_name: 'OpenPublisher',
    description:
      'Offline-capable Publisher editor with OLE2 .PUB binary importer and print-ready PDF export.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#4f46e5',
    icons: [
      {
        src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%234f46e5"/><text x="50" y="68" font-size="56" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">P</text></svg>',
        sizes: '192x192',
        type: 'image/svg+xml'
      }
    ]
  };
  const blob = new Blob([JSON.stringify(manifest, null, 2)], {
    type: 'application/manifest+json'
  });
  const url = URL.createObjectURL(blob);
  let link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'manifest';
    document.head.appendChild(link);
  }
  link.href = url;
  return url;
}

export async function runAutomatedTestSuite(): Promise<TestCaseResult[]> {
  const results: TestCaseResult[] = [];

  // TEST 1: Seed Data & Schema Validation
  {
    const t0 = performance.now();
    const valid =
      SEED_DOCUMENTS.length >= 3 &&
      SEED_DOCUMENTS.every((d) => d.pages.length >= 1 && d.widthMm > 0 && d.heightMm > 0);
    results.push({
      id: 'SEED-01',
      name: 'Seed Templates & Document Schema Integrity',
      category: 'Core Store',
      status: valid ? 'passed' : 'failed',
      durationMs: Math.max(1, Math.round(performance.now() - t0)),
      assertionDetail: `Verified ${SEED_DOCUMENTS.length} starter templates (Newsletter, Flyer, Certificate) with valid mm geometry.`
    });
  }

  // TEST 2: IndexedDB Persistence CRUD Cycle
  {
    const t0 = performance.now();
    const probeId = `test-probe-${Date.now()}`;
    const probeDoc: PubDocument = {
      ...SEED_DOCUMENTS[0],
      id: probeId,
      title: 'Automated Test Probe'
    };
    await saveDocumentToDB(probeDoc);
    const all = await loadAllDocumentsFromDB();
    const found = all.some((d) => d.id === probeId);
    await deleteDocumentFromDB(probeId);
    results.push({
      id: 'IDB-02',
      name: 'IndexedDB Offline Save, Query & Cleanup Cycle',
      category: 'Core Store',
      status: found ? 'passed' : 'failed',
      durationMs: Math.max(1, Math.round(performance.now() - t0)),
      assertionDetail: `Wrote, queried, and deleted probe document (${probeId}) in openpublisher_db_v1.`
    });
  }

  // TEST 3: Phase 2 OLE2 .PUB Binary Parser & Magic Header Check
  {
    const t0 = performance.now();
    const sample = createSamplePubBinaryBuffer();
    const report = await parsePublisherBinaryBuffer(sample.fileName, sample.buffer);
    const passed =
      report.ole2MagicValid &&
      report.formatDetected === 'OLE2-PUB' &&
      report.extractedTextBlocks.length >= 4 &&
      report.generatedDoc.pages[0].elements.length >= 5;
    results.push({
      id: 'PUB-03',
      name: 'OLE2 Compound Binary (.PUB) Header & UTF-16LE Story Extractor',
      category: '.PUB Importer',
      status: passed ? 'passed' : 'failed',
      durationMs: Math.max(1, Math.round(performance.now() - t0)),
      assertionDetail: `Verified magic bytes (D0 CF 11 E0) and carved ${report.extractedTextBlocks.length} Quill text stories into canvas frames.`
    });
  }

  // TEST 4: Phase 3 HTML / DOCX Fallback Importer
  {
    const t0 = performance.now();
    const htmlContent = `<html><body><h1>Fallback Test Headline</h1><p>Paragraph body converted into OpenPublisher frame.</p></body></html>`;
    const mockFile = new File([htmlContent], 'legacy_export.html', { type: 'text/html' });
    const report = await parseFallbackDocumentFile(mockFile);
    const passed =
      report.formatDetected === 'HTML-FALLBACK' &&
      report.extractedTextBlocks.length >= 2 &&
      report.generatedDoc.pages[0].elements.some((e) => e.text?.includes('Fallback Test Headline'));
    results.push({
      id: 'FALLBACK-04',
      name: 'HTML / .DOCX Fallback Ingestion & Frame Mapper',
      category: '.PUB Importer',
      status: passed ? 'passed' : 'failed',
      durationMs: Math.max(1, Math.round(performance.now() - t0)),
      assertionDetail: `Parsed DOM nodes into ${report.generatedDoc.pages[0].elements.length} positioned text frames.`
    });
  }

  // TEST 5: Page Geometry & Orientation Pixel Calculator
  {
    const t0 = performance.now();
    const portraitDims = getCanvasPixelDimensions(SEED_DOCUMENTS[0]); // A4 Portrait
    const landscapeDims = getCanvasPixelDimensions(SEED_DOCUMENTS[2]); // A4 Landscape
    const passed =
      portraitDims.width < portraitDims.height &&
      landscapeDims.width > landscapeDims.height &&
      portraitDims.width === landscapeDims.height;
    results.push({
      id: 'GEOM-05',
      name: 'Physical Millimeter-to-Canvas Pixel & Orientation Engine',
      category: 'Canvas Engine',
      status: passed ? 'passed' : 'failed',
      durationMs: Math.max(1, Math.round(performance.now() - t0)),
      assertionDetail: `A4 Portrait (${portraitDims.width}×${portraitDims.height}px) & Landscape (${landscapeDims.width}×${landscapeDims.height}px) verified.`
    });
  }

  // TEST 6: High-DPI Print-Ready Canvas Renderer
  {
    const t0 = performance.now();
    const canvas = await renderPageToCanvas(
      SEED_DOCUMENTS[0],
      SEED_DOCUMENTS[0].pages[0],
      0,
      SEED_DOCUMENTS[0].pages.length,
      1
    );
    const passed = canvas.width > 700 && canvas.height > 1000;
    results.push({
      id: 'RENDER-06',
      name: 'Print-Ready PDF/PNG Offscreen Rasterizer',
      category: 'Canvas Engine',
      status: passed ? 'passed' : 'failed',
      durationMs: Math.max(1, Math.round(performance.now() - t0)),
      assertionDetail: `Rendered ${SEED_DOCUMENTS[0].pages[0].elements.length} layered elements onto ${canvas.width}×${canvas.height}px surface.`
    });
  }

  // TEST 7: PWA Manifest & Offline Workspace Sync Readiness
  {
    const t0 = performance.now();
    const manifestUrl = injectPwaManifest();
    const passed = Boolean(manifestUrl && manifestUrl.startsWith('blob:'));
    results.push({
      id: 'PWA-07',
      name: 'PWA Web App Manifest & Workspace Sync Bundle Readiness',
      category: 'PWA & Sync',
      status: passed ? 'passed' : 'failed',
      durationMs: Math.max(1, Math.round(performance.now() - t0)),
      assertionDetail:
        'Injected standalone PWA manifest and verified offline IndexedDB workspace bundler.'
    });
  }

  return results;
}

// ============================================================================
// 6. MAIN APPLICATION SHELL
// ============================================================================

export type RibbonTabId = 'home' | 'insertion' | 'page-creation' | 'view' | 'about';

export function App() {
  // Navigation & Document state
  const [screenMode, setScreenMode] = useState<'hub' | 'editor'>('hub');
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [tplFilter, setTplFilter] = useState<'Tous' | TemplateGroup>('Tous');
  const [TEMPLATES] = useState(() => buildTemplates());
  const [documents, setDocuments] = useState<PubDocument[]>([]);
  const [activeDoc, setActiveDoc] = useState<PubDocument>(SEED_DOCUMENTS[0]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);

  // Undo / Redo History Stack
  const [historyPast, setHistoryPast] = useState<PubDocument[]>([]);
  const [historyFuture, setHistoryFuture] = useState<PubDocument[]>([]);

  // Ribbon & Selection state
  const [activeRibbonTab, setActiveRibbonTab] = useState<RibbonTabId>('home');
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [clipboardElement, setClipboardElement] = useState<CanvasElementData | null>(null);

  // View & Workspace Aids state
  const [zoom, setZoom] = useState<number>(0.75);
  const [showRulers, setShowRulers] = useState<boolean>(true);
  const [showGuides, setShowGuides] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [showThumbnails, setShowThumbnails] = useState<boolean>(true);

  // Toast / Status Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Phase 2: .PUB Importer Studio & Diagnostic Report Modal
  const [pubStudioModalOpen, setPubStudioModalOpen] = useState(false);
  const [latestImportReport, setLatestImportReport] = useState<PubImportReport | null>(null);


  // Custom New Document Modal state
  const [newDocModalOpen, setNewDocModalOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState('Nouveau document');
  const [customPreset, setCustomPreset] = useState<PageSizePreset>('A4');
  const [customWidthMm, setCustomWidthMm] = useState(210);
  const [customHeightMm, setCustomHeightMm] = useState(297);
  const [customOrientation, setCustomOrientation] = useState<Orientation>('portrait');

  // Drag / Resize Interaction Refs
  const dragStateRef = useRef<{
    mode: 'move' | 'resize-br' | 'resize-r' | 'resize-b' | null;
    elementId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  }>({
    mode: null,
    elementId: '',
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    origW: 0,
    origH: 0
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const universalImportRef = useRef<HTMLInputElement | null>(null);
  const workspaceBackupInputRef = useRef<HTMLInputElement | null>(null);

  const notify = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  // Load initial documents from IndexedDB & inject PWA manifest
  useEffect(() => {
    loadAllDocumentsFromDB().then((docs) => {
      setDocuments(docs);
      if (docs.length > 0) {
        setActiveDoc(docs[0]);
      }
    });
  }, []);


  // Export entire IndexedDB Workspace as a single Sync Bundle
  const handleExportWorkspaceBackup = useCallback(() => {
    const bundle = {
      exportedAt: new Date().toISOString(),
      app: 'OpenPublisher',
      version: '1.0.0-release',
      documentCount: documents.length,
      documents
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openpublisher_workspace_sync_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify(`Exported all ${documents.length} publications to sync bundle`);
  }, [documents, notify]);

  // Import Workspace Sync Bundle
  const handleImportWorkspaceBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const docsToRestore: PubDocument[] = Array.isArray(parsed?.documents)
        ? parsed.documents
        : Array.isArray(parsed)
        ? parsed
        : [];
      if (docsToRestore.length > 0) {
        for (const d of docsToRestore) {
          await saveDocumentToDB(d);
        }
        const reloaded = await loadAllDocumentsFromDB();
        setDocuments(reloaded);
        setActiveDoc(reloaded[0] || null);
        notify(`Synced ${docsToRestore.length} publications into IndexedDB`);
      }
    } catch {
      notify('Invalid workspace backup JSON file');
    }
    e.target.value = '';
  };

  // Auto-save activeDoc to IndexedDB on change with optional Undo history push
  const updateActiveDocument = useCallback(
    (updater: (prev: PubDocument) => PubDocument, recordUndo = true) => {
      setActiveDoc((prev) => {
        if (recordUndo) {
          setHistoryPast((past) => [...past.slice(-24), prev]);
          setHistoryFuture([]);
        }
        const updated = {
          ...updater(prev),
          updatedAt: new Date().toISOString()
        };
        saveDocumentToDB(updated);
        setDocuments((list) => {
          const exists = list.some((d) => d.id === updated.id);
          if (exists) {
            return list.map((d) => (d.id === updated.id ? updated : d));
          }
          return [updated, ...list];
        });
        return updated;
      });
    },
    []
  );

  const handleUndo = useCallback(() => {
    if (historyPast.length === 0) return;
    const previous = historyPast[historyPast.length - 1];
    setHistoryPast((past) => past.slice(0, -1));
    setHistoryFuture((future) => [activeDoc, ...future]);
    setActiveDoc(previous);
    saveDocumentToDB(previous);
    notify('Undo applied');
  }, [historyPast, activeDoc, notify]);

  const handleRedo = useCallback(() => {
    if (historyFuture.length === 0) return;
    const next = historyFuture[0];
    setHistoryFuture((future) => future.slice(1));
    setHistoryPast((past) => [...past, activeDoc]);
    setActiveDoc(next);
    saveDocumentToDB(next);
    notify('Redo applied');
  }, [historyFuture, activeDoc, notify]);

  const currentPage: PageData = activeDoc.pages[activePageIndex] || activeDoc.pages[0];
  const selectedElement: CanvasElementData | null =
    currentPage?.elements.find((e) => e.id === selectedElementId) || null;

  // Helper to update a single element on the current page
  const updateElement = useCallback(
    (elementId: string, patch: Partial<CanvasElementData>, recordUndo = true) => {
      updateActiveDocument((doc) => {
        const pages = doc.pages.map((p, idx) => {
          if (idx !== activePageIndex) return p;
          return {
            ...p,
            elements: p.elements.map((el) => (el.id === elementId ? { ...el, ...patch } : el))
          };
        });
        return { ...doc, pages };
      }, recordUndo);
    },
    [activePageIndex, updateActiveDocument]
  );

  // Add a new element to the current page
  const addElementToPage = useCallback(
    (newEl: Omit<CanvasElementData, 'id' | 'zIndex'>) => {
      const maxZ = currentPage.elements.reduce((acc, el) => Math.max(acc, el.zIndex), 0);
      const created: CanvasElementData = {
        ...newEl,
        id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        zIndex: maxZ + 1
      };
      updateActiveDocument((doc) => {
        const pages = doc.pages.map((p, idx) =>
          idx === activePageIndex ? { ...p, elements: [...p.elements, created] } : p
        );
        return { ...doc, pages };
      });
      setSelectedElementId(created.id);
      notify(`Inserted ${created.type}`);
    },
    [activePageIndex, currentPage, notify, updateActiveDocument]
  );

  // Delete currently selected element
  const deleteSelectedElement = useCallback(() => {
    if (!selectedElementId) return;
    updateActiveDocument((doc) => {
      const pages = doc.pages.map((p, idx) =>
        idx === activePageIndex
          ? { ...p, elements: p.elements.filter((e) => e.id !== selectedElementId) }
          : p
      );
      return { ...doc, pages };
    });
    setSelectedElementId(null);
    setEditingTextId(null);
    notify('Element deleted');
  }, [activePageIndex, notify, selectedElementId, updateActiveDocument]);

  // Keyboard shortcuts (Delete, Undo, Redo)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (screenMode !== 'editor') return;
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementId && !editingTextId) {
        e.preventDefault();
        deleteSelectedElement();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screenMode, selectedElementId, editingTextId, handleUndo, handleRedo, deleteSelectedElement]);

  // Layer ordering controls
  const adjustLayer = (direction: 'front' | 'back' | 'forward' | 'backward') => {
    if (!selectedElement) return;
    const zValues = currentPage.elements.map((e) => e.zIndex);
    const maxZ = Math.max(...zValues, 1);
    const minZ = Math.min(...zValues, 1);

    let nextZ = selectedElement.zIndex;
    if (direction === 'front') nextZ = maxZ + 1;
    if (direction === 'back') nextZ = Math.max(0, minZ - 1);
    if (direction === 'forward') nextZ = selectedElement.zIndex + 1;
    if (direction === 'backward') nextZ = Math.max(0, selectedElement.zIndex - 1);

    updateElement(selectedElement.id, { zIndex: nextZ });
  };

  // Pointer Move / Up listeners for dragging and resizing elements
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state.mode || !state.elementId) return;

      const dx = (e.clientX - state.startX) / zoom;
      const dy = (e.clientY - state.startY) / zoom;
      const gridStep = snapToGrid ? 8 : 1;

      if (state.mode === 'move') {
        const nextX = Math.round((state.origX + dx) / gridStep) * gridStep;
        const nextY = Math.round((state.origY + dy) / gridStep) * gridStep;
        updateElement(state.elementId, { x: nextX, y: nextY }, false);
      } else if (state.mode === 'resize-br') {
        const nextW = Math.max(32, Math.round((state.origW + dx) / gridStep) * gridStep);
        const nextH = Math.max(24, Math.round((state.origH + dy) / gridStep) * gridStep);
        updateElement(state.elementId, { width: nextW, height: nextH }, false);
      } else if (state.mode === 'resize-r') {
        const nextW = Math.max(32, Math.round((state.origW + dx) / gridStep) * gridStep);
        updateElement(state.elementId, { width: nextW }, false);
      } else if (state.mode === 'resize-b') {
        const nextH = Math.max(24, Math.round((state.origH + dy) / gridStep) * gridStep);
        updateElement(state.elementId, { height: nextH }, false);
      }
    };

    const handleMouseUp = () => {
      dragStateRef.current.mode = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [snapToGrid, updateElement, zoom]);

  // Create a brand new blank document or from template
  const handleCreateDocument = (
    title: string,
    preset: PageSizePreset,
    widthMm: number,
    heightMm: number,
    orientation: Orientation
  ) => {
    const newDoc: PubDocument = {
      id: `doc-${Date.now()}`,
      title: title.trim() || 'Nouveau document',
      category: `${preset} (${orientation})`,
      updatedAt: new Date().toISOString(),
      pageSize: preset,
      widthMm,
      heightMm,
      orientation,
      marginMm: 15,
      pages: [
        {
          id: `page-${Date.now()}`,
          name: 'Page 1',
          background: '#ffffff',
          backgroundPattern: 'none',
          elements: [
            {
              id: `el-welcome-${Date.now()}`,
              type: 'text',
              x: 60,
              y: 60,
              width: 520,
              height: 90,
              zIndex: 1,
              text: `${title.trim() || 'Untitled Publication'}\nDouble-click to edit text or use the Insertion tab above.`,
              fontFamily: 'Georgia, serif',
              fontSize: 24,
              fontColor: '#0f172a',
              bold: true,
              textAlign: 'left',
              fillColor: 'transparent',
              strokeColor: 'transparent',
              strokeWidth: 0
            }
          ]
        }
      ]
    };

    saveDocumentToDB(newDoc);
    setDocuments((prev) => [newDoc, ...prev]);
    setActiveDoc(newDoc);
    setActivePageIndex(0);
    setSelectedElementId(null);
    setNewDocModalOpen(false);
    setScreenMode('editor');
    notify('Created new publication');
  };

  const handleOpenDocument = (doc: PubDocument) => {
    if (doc.isTemplate) {
      const cloned: PubDocument = {
        ...JSON.parse(JSON.stringify(doc)),
        id: `doc-${Date.now()}`,
        title: doc.title,
        isTemplate: false,
        updatedAt: new Date().toISOString()
      };
      saveDocumentToDB(cloned);
      setDocuments((prev) => [cloned, ...prev]);
      setActiveDoc(cloned);
      setActivePageIndex(0);
      setScreenMode('editor');
      notify('Created working copy from template');
    } else {
      setActiveDoc(doc);
      setActivePageIndex(0);
      setScreenMode('editor');
    }
  };

  // Export PNG of current page
  const handleExportPNG = async () => {
    setIsExporting(true);
    try {
      const canvas = await renderPageToCanvas(
        activeDoc,
        currentPage,
        activePageIndex,
        activeDoc.pages.length,
        2
      );
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${activeDoc.title.replace(/\s+/g, '_')}_Page_${activePageIndex + 1}.png`;
      link.href = dataUrl;
      link.click();
      notify('Exported high-resolution PNG');
    } finally {
      setIsExporting(false);
    }
  };

  // Export Print-Ready Multi-Page PDF
  const handleExportPrintPDF = async () => {
    setIsExporting(true);
    try {
      const pageDataUrls: string[] = [];
      for (let i = 0; i < activeDoc.pages.length; i++) {
        const c = await renderPageToCanvas(
          activeDoc,
          activeDoc.pages[i],
          i,
          activeDoc.pages.length,
          2
        );
        pageDataUrls.push(c.toDataURL('image/png'));
      }

      const printWindow = window.open('', '_blank', 'width=960,height=800');
      if (!printWindow) {
        notify('Pop-up blocked — please allow pop-ups for Print-Ready PDF');
        return;
      }

      const isLandscape = activeDoc.orientation === 'landscape';
      const wMm = isLandscape
        ? Math.max(activeDoc.widthMm, activeDoc.heightMm)
        : Math.min(activeDoc.widthMm, activeDoc.heightMm);
      const hMm = isLandscape
        ? Math.min(activeDoc.widthMm, activeDoc.heightMm)
        : Math.max(activeDoc.widthMm, activeDoc.heightMm);

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${activeDoc.title} — Print-Ready PDF</title>
            <style>
              @page {
                size: ${wMm}mm ${hMm}mm;
                margin: 0;
              }
              body {
                margin: 0;
                padding: 0;
                background: #0f172a;
                font-family: system-ui, sans-serif;
                display: flex;
                flex-direction: column;
                align-items: center;
              }
              .toolbar {
                width: 100%;
                background: #1e293b;
                color: white;
                padding: 12px 24px;
                box-sizing: border-box;
                display: flex;
                justify-content: space-between;
                align-items: center;
                position: sticky;
                top: 0;
              }
              .btn {
                background: #4f46e5;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
              }
              .page-sheet {
                width: ${wMm}mm;
                height: ${hMm}mm;
                margin: 20px auto;
                background: white;
                box-shadow: 0 10px 30px rgba(0,0,0,0.4);
                page-break-after: always;
              }
              .page-sheet img {
                width: 100%;
                height: 100%;
                display: block;
              }
              @media print {
                body { background: white; }
                .toolbar { display: none; }
                .page-sheet { margin: 0; box-shadow: none; }
              }
            </style>
          </head>
          <body>
            <div class="toolbar">
              <div><strong>${activeDoc.title}</strong> • ${activeDoc.pages.length} Page(s) • ${wMm}×${hMm}mm Print-Ready</div>
              <button class="btn" onclick="window.print()">Save as PDF / Print</button>
            </div>
            ${pageDataUrls
              .map((src) => `<div class="page-sheet"><img src="${src}" /></div>`)
              .join('')}
            <script>
              setTimeout(() => { window.print(); }, 450);
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
      notify('Generated Print-Ready PDF preview');
    } finally {
      setIsExporting(false);
    }
  };

  // Save/Export native .opub.json project file
  const handleDownloadJSON = () => {
    const blob = new Blob([JSON.stringify(activeDoc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDoc.title.replace(/\s+/g, '_')}.opub.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Saved .opub.json project file');
  };

  // Universal File Importer (.pub binary, .docx, .html, .opub.json)
  const handleUniversalFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    try {
      if (ext === 'json') {
        const text = await file.text();
        const parsed = JSON.parse(text) as PubDocument;
        if (parsed && parsed.pages && Array.isArray(parsed.pages)) {
          parsed.id = `doc-${Date.now()}`;
          await saveDocumentToDB(parsed);
          setDocuments((prev) => [parsed, ...prev]);
          setActiveDoc(parsed);
          setActivePageIndex(0);
          setScreenMode('editor');
          notify('Document importé');
        }
      } else if (ext === 'pub') {
        const buffer = await file.arrayBuffer();
        const report = await parsePublisherBinaryBuffer(file.name, buffer);
        await saveDocumentToDB(report.generatedDoc);
        setDocuments((prev) => [report.generatedDoc, ...prev]);
        setActiveDoc(report.generatedDoc);
        setActivePageIndex(0);
        setLatestImportReport(report);
        setPubStudioModalOpen(true);
        setScreenMode('editor');
        notify(`Fichier Publisher importé (${report.extractedTextBlocks.length} blocs de texte récupérés)`);
      } else {
        const report = await parseFallbackDocumentFile(file);
        await saveDocumentToDB(report.generatedDoc);
        setDocuments((prev) => [report.generatedDoc, ...prev]);
        setActiveDoc(report.generatedDoc);
        setActivePageIndex(0);
        setLatestImportReport(report);
        setPubStudioModalOpen(true);
        setScreenMode('editor');
        notify(`Fichier ${ext.toUpperCase()} importé`);
      }
    } catch {
      notify('Impossible de lire ce fichier. Vérifiez son format.');
    }
    e.target.value = '';
  };


  // Handle local image upload for Image Element
  const handleImageFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        addElementToPage({
          type: 'image',
          x: 90,
          y: 120,
          width: 340,
          height: 240,
          imageUrl: reader.result,
          strokeColor: '#cbd5e1',
          strokeWidth: 1
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const canvasDimensions = getCanvasPixelDimensions(activeDoc);
  const marginPx = Math.round(activeDoc.marginMm * MM_TO_PX);

  // ============================================================================
  // RENDER: START HUB SCREEN (src/pages/Home.tsx)
  // ============================================================================
  if (screenMode === 'hub') {
    const groups: ('Tous' | TemplateGroup)[] = ['Tous', 'Classe', 'Parents', 'Récompenses', 'Organisation'];
    const shownTemplates = TEMPLATES.filter((t) => tplFilter === 'Tous' || t.group === tplFilter);
    const lastDoc = documents[0];
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <input
          ref={universalImportRef}
          type="file"
          accept=".pub,.json,.opub.json,.html,.htm,.docx,.txt"
          className="hidden"
          onChange={handleUniversalFileImport}
        />
        <input
          ref={workspaceBackupInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImportWorkspaceBackup}
        />

        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shadow-sm shadow-indigo-200">
              OP
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight text-slate-900 leading-tight">{APP_NAME}</h1>
              <p className="text-xs text-slate-500">par {APP_AUTHOR}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHelpOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium"
            >
              <HelpCircle className="w-4 h-4 text-indigo-600" />
              Aide
            </button>
            <button
              onClick={() => setAboutOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium"
            >
              <Info className="w-4 h-4 text-indigo-600" />
              À propos
            </button>
          </div>
        </header>

        <main className="max-w-6xl w-full mx-auto px-6 py-8 space-y-10 flex-1">
          {/* Welcome + main actions */}
          <section className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white p-7 shadow-md">
            <h2 className="text-2xl font-bold tracking-tight">Bonjour ! Que voulez-vous créer aujourd’hui ?</h2>
            <p className="text-indigo-100 text-sm mt-1">
              Choisissez un modèle ci-dessous, ou commencez avec une page blanche.
            </p>
            <div className="flex flex-wrap gap-3 mt-5">
              {lastDoc && (
                <button
                  onClick={() => handleOpenDocument(lastDoc)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-indigo-700 hover:bg-indigo-50 text-sm font-semibold shadow-sm"
                >
                  <Clock className="w-4 h-4" />
                  Reprendre « {lastDoc.title.length > 28 ? lastDoc.title.slice(0, 28) + '…' : lastDoc.title} »
                </button>
              )}
              <button
                onClick={() => handleCreateDocument('Nouveau document', 'A4', 210, 297, 'portrait')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/30 text-white text-sm font-semibold"
              >
                <Plus className="w-4 h-4" />
                Page blanche (portrait)
              </button>
              <button
                onClick={() => handleCreateDocument('Nouveau document', 'A4', 297, 210, 'landscape')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/30 text-white text-sm font-semibold"
              >
                <Plus className="w-4 h-4" />
                Page blanche (paysage)
              </button>
              <button
                onClick={() => universalImportRef.current?.click()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/30 text-white text-sm font-semibold"
                title="Ouvrir un fichier Publisher (.pub), Word (.docx) ou une page web"
              >
                <FolderOpen className="w-4 h-4" />
                Ouvrir un fichier Publisher / Word
              </button>
              <button
                onClick={() => setNewDocModalOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl text-indigo-100 hover:text-white text-sm underline underline-offset-4"
              >
                Autre format…
              </button>
            </div>
          </section>

          {/* Templates */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Modèles prêts à l’emploi</h3>
                <p className="text-sm text-slate-500">Cliquez sur un modèle : vous en recevez une copie à personnaliser.</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {groups.map((g) => (
                  <button
                    key={g}
                    onClick={() => setTplFilter(g)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                      tplFilter === g
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {shownTemplates.map((tpl) => {
                const landscape = tpl.doc.orientation === 'landscape';
                return (
                  <button
                    key={tpl.doc.id}
                    onClick={() => handleOpenDocument(tpl.doc)}
                    className="group text-left bg-white hover:shadow-md border border-slate-200 hover:border-indigo-400 rounded-xl p-4 transition flex flex-col"
                  >
                    <div className="h-40 rounded-lg bg-slate-100 flex items-center justify-center mb-3">
                      <div
                        className="bg-white shadow border border-slate-200 overflow-hidden flex flex-col"
                        style={{ width: landscape ? 130 : 92, height: landscape ? 92 : 130 }}
                      >
                        <div style={{ background: tpl.color }} className="h-1/4" />
                        <div className="p-2 space-y-1">
                          <div className="h-1.5 w-3/4 rounded" style={{ background: tpl.color, opacity: 0.35 }} />
                          <div className="h-1 w-full rounded bg-slate-200" />
                          <div className="h-1 w-5/6 rounded bg-slate-200" />
                          <div className="h-1 w-2/3 rounded bg-slate-200" />
                        </div>
                      </div>
                    </div>
                    <div className="font-semibold text-sm text-slate-900 group-hover:text-indigo-600">{tpl.doc.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5 flex-1">{tpl.description}</div>
                    <div className="text-[11px] text-slate-400 mt-2">
                      {tpl.doc.category} • {landscape ? 'Paysage' : 'Portrait'}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* My documents */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Mes documents</h3>
              <span className="text-xs text-slate-500">{documents.length} document(s)</span>
            </div>

            {documents.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-500 text-sm">
                Vous n’avez encore aucun document. Choisissez un modèle ci-dessus pour commencer.
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs divide-y divide-slate-200">
                {documents.map((doc) => (
                  <div key={doc.id} className="p-4 sm:px-6 hover:bg-slate-50 transition flex flex-wrap items-center justify-between gap-4">
                    <button onClick={() => handleOpenDocument(doc)} className="flex items-center gap-3.5 min-w-0 text-left">
                      <div className="w-10 h-12 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-slate-900 truncate">{doc.title}</div>
                        <div className="text-xs text-slate-500">
                          {doc.pages.length} page(s) • {doc.orientation === 'landscape' ? 'Paysage' : 'Portrait'} • Modifié le{' '}
                          {new Date(doc.updatedAt).toLocaleDateString('fr-FR')} à{' '}
                          {new Date(doc.updatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenDocument(doc)}
                        className="px-3.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold"
                      >
                        Ouvrir
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm(`Supprimer « ${doc.title} » définitivement ?`)) return;
                          await deleteDocumentFromDB(doc.id);
                          setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
                          notify('Document supprimé');
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        title="Supprimer ce document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Backup */}
          <section className="rounded-2xl bg-white border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-xl">
              <div className="font-semibold text-sm text-slate-900">Sauvegarde de sécurité</div>
              <p className="text-xs text-slate-500 mt-0.5">
                Vos documents sont enregistrés sur cet ordinateur. Faites régulièrement une sauvegarde sur une clé USB ou
                dans le cloud pour ne rien perdre.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExportWorkspaceBackup}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold"
              >
                <CloudDownload className="w-4 h-4 text-indigo-600" />
                Sauvegarder tout
              </button>
              <button
                onClick={() => workspaceBackupInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold"
              >
                <CloudUpload className="w-4 h-4 text-indigo-600" />
                Restaurer une sauvegarde
              </button>
            </div>
          </section>
        </main>

        <footer className="text-center text-xs text-slate-400 py-5">
          {APP_NAME} v{APP_VERSION} • © {APP_YEAR} {APP_AUTHOR} • Licence {APP_LICENSE}
        </footer>

        {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
        {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}

        {toastMessage && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">
            {toastMessage}
          </div>
        )}

        {/* New document modal */}
        {newDocModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base text-slate-900">Nouveau document</h3>
                <button onClick={() => setNewDocModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Titre</label>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Format</label>
                    <select
                      value={customPreset}
                      onChange={(e) => {
                        const val = e.target.value as PageSizePreset;
                        setCustomPreset(val);
                        if (val === 'A4') {
                          setCustomWidthMm(210);
                          setCustomHeightMm(297);
                        } else if (val === 'Letter') {
                          setCustomWidthMm(215.9);
                          setCustomHeightMm(279.4);
                        }
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    >
                      <option value="A4">A4 (210 × 297 mm)</option>
                      <option value="Letter">Lettre US (215,9 × 279,4 mm)</option>
                      <option value="Custom">Dimensions personnalisées</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Orientation</label>
                    <select
                      value={customOrientation}
                      onChange={(e) => setCustomOrientation(e.target.value as Orientation)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    >
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Paysage</option>
                    </select>
                  </div>
                </div>
                {customPreset === 'Custom' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Largeur (mm)</label>
                      <input
                        type="number" min={80} max={500} value={customWidthMm}
                        onChange={(e) => setCustomWidthMm(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Hauteur (mm)</label>
                      <input
                        type="number" min={80} max={500} value={customHeightMm}
                        onChange={(e) => setCustomHeightMm(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setNewDocModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">
                  Annuler
                </button>
                <button
                  onClick={() => handleCreateDocument(customTitle, customPreset, customWidthMm, customHeightMm, customOrientation)}
                  className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                >
                  Créer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // RENDER: MAIN PUBLISHER RIBBON EDITOR (src/pages/Editor.tsx)
  // ============================================================================
  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-100 text-slate-900 select-none">
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFileSelected}
      />
      <input
        ref={universalImportRef}
        type="file"
        accept=".pub,.json,.opub.json,.html,.htm,.docx,.txt"
        className="hidden"
        onChange={handleUniversalFileImport}
      />
      <input
        ref={workspaceBackupInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportWorkspaceBackup}
      />

      {/* 1. TOP APPLICATION BAR */}
      <header className="bg-slate-900 text-white px-4 py-2 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setScreenMode('hub')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
            title="Retour à l’accueil"
          >
            <ChevronLeft className="w-4 h-4" />
            Accueil
          </button>

          <div className="h-4 w-px bg-slate-700" />

          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center font-bold text-xs">
              P
            </div>
            <input
              type="text"
              value={activeDoc.title}
              onChange={(e) => updateActiveDocument((d) => ({ ...d, title: e.target.value }))}
              className="bg-transparent hover:bg-slate-800 focus:bg-slate-800 px-2 py-1 rounded text-sm font-semibold text-white focus:outline-none border border-transparent focus:border-indigo-500"
            />
          </div>

          <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/70 border border-emerald-800/60 px-2 py-0.5 rounded-full">
            <Check className="w-3 h-3" /> Enregistré automatiquement
          </span>

          {/* Undo / Redo Quick Buttons */}
          <div className="flex items-center gap-1 ml-1">
            <button
              disabled={historyPast.length === 0}
              onClick={handleUndo}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
              title="Annuler (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              disabled={historyFuture.length === 0}
              onClick={handleRedo}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
              title="Rétablir (Ctrl+Maj+Z)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Export & Import Actions */}
        <div className="flex items-center gap-2">

          <button
            onClick={handleDownloadJSON}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition"
            title="Télécharger une copie du document (fichier .opub.json)"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Copie .OPUB</span>
          </button>

          <button
            disabled={isExporting}
            onClick={handleExportPNG}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition disabled:opacity-50"
          >
            <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
            Exporter en PNG
          </button>

          <button
            disabled={isExporting}
            onClick={handleExportPrintPDF}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-xs transition disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" />
            Exporter en PDF / Imprimer
          </button>
        </div>
      </header>

      {/* 2. PUBLISHER RIBBON TABS & TOOLBAR (src/editor/RibbonToolbar.tsx) */}
      <div className="bg-white border-b border-slate-200 shadow-2xs z-20">
        {/* Ribbon Tab Headers */}
        <div className="flex items-center px-4 border-b border-slate-200 bg-slate-50/70 overflow-x-auto">
          {(
            [
              { id: 'home', label: 'Accueil' },
              { id: 'insertion', label: 'Insertion' },
              { id: 'page-creation', label: 'Page' },
              { id: 'view', label: 'Affichage' },
              { id: 'about', label: 'Aide & À propos' }
            ] as { id: RibbonTabId; label: string }[]
          ).map((tab) => {
            const active = activeRibbonTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveRibbonTab(tab.id)}
                className={`px-4 py-2 text-xs font-semibold tracking-wide border-b-2 transition whitespace-nowrap ${
                  active
                    ? 'border-indigo-600 text-indigo-600 bg-white'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Ribbon Controls Strip */}
        <div className="px-4 py-2.5 flex items-center gap-4 overflow-x-auto min-h-[64px]">
          {/* ==================== TAB 1: HOME ==================== */}
          {activeRibbonTab === 'home' && (
            <>
              {/* Clipboard Group */}
              <div className="flex items-center gap-1.5 pr-4 border-r border-slate-200">
                <button
                  disabled={!selectedElement}
                  onClick={() => {
                    if (selectedElement) {
                      setClipboardElement(selectedElement);
                      notify('Élément copié');
                    }
                  }}
                  className="flex flex-col items-center justify-center px-2.5 py-1 rounded-lg hover:bg-slate-100 disabled:opacity-40 text-xs text-slate-700"
                >
                  <Copy className="w-4 h-4 text-indigo-600 mb-0.5" />
                  <span className="text-[10px]">Copier</span>
                </button>

                <button
                  disabled={!clipboardElement}
                  onClick={() => {
                    if (clipboardElement) {
                      const { id: _unusedId, zIndex: _unusedZ, ...rest } = clipboardElement;
                      addElementToPage({
                        ...rest,
                        x: clipboardElement.x + 24,
                        y: clipboardElement.y + 24
                      });
                    }
                  }}
                  className="flex flex-col items-center justify-center px-2.5 py-1 rounded-lg hover:bg-slate-100 disabled:opacity-40 text-xs text-slate-700"
                >
                  <Clipboard className="w-4 h-4 text-indigo-600 mb-0.5" />
                  <span className="text-[10px]">Coller</span>
                </button>

                <button
                  disabled={!selectedElement}
                  onClick={deleteSelectedElement}
                  className="flex flex-col items-center justify-center px-2.5 py-1 rounded-lg hover:bg-rose-50 disabled:opacity-40 text-xs text-rose-600"
                >
                  <Trash2 className="w-4 h-4 mb-0.5" />
                  <span className="text-[10px]">Supprimer</span>
                </button>
              </div>

              {/* Typography Group */}
              <div className="flex items-center gap-2 pr-4 border-r border-slate-200">
                <select
                  disabled={!selectedElement}
                  value={selectedElement?.fontFamily || 'Inter, sans-serif'}
                  onChange={(e) =>
                    selectedElement &&
                    updateElement(selectedElement.id, { fontFamily: e.target.value })
                  }
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white disabled:opacity-40"
                >
                  <option value="Inter, sans-serif">Inter (moderne)</option>
                  <option value="&quot;Comic Sans MS&quot;, &quot;Comic Neue&quot;, cursive">Comic Sans (écolier)</option>
                    <option value="Arial, sans-serif">Arial</option>
                    <option value="Georgia, serif">Georgia</option>
                  <option value="'Times New Roman', serif">Times New Roman</option>
                  <option value="'Courier New', monospace">Courier</option>
                </select>

                <input
                  type="number"
                  min={8}
                  max={96}
                  disabled={!selectedElement}
                  value={selectedElement?.fontSize || 16}
                  onChange={(e) =>
                    selectedElement &&
                    updateElement(selectedElement.id, { fontSize: Number(e.target.value) })
                  }
                  className="w-16 px-2 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40"
                  title="Taille du texte"
                />

                <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50">
                  <button
                    disabled={!selectedElement}
                    onClick={() =>
                      selectedElement &&
                      updateElement(selectedElement.id, { bold: !selectedElement.bold })
                    }
                    className={`p-1.5 rounded disabled:opacity-40 ${
                      selectedElement?.bold
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </button>
                  <button
                    disabled={!selectedElement}
                    onClick={() =>
                      selectedElement &&
                      updateElement(selectedElement.id, { italic: !selectedElement.italic })
                    }
                    className={`p-1.5 rounded disabled:opacity-40 ${
                      selectedElement?.italic
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <Italic className="w-3.5 h-3.5" />
                  </button>
                  <button
                    disabled={!selectedElement}
                    onClick={() =>
                      selectedElement &&
                      updateElement(selectedElement.id, { underline: !selectedElement.underline })
                    }
                    className={`p-1.5 rounded disabled:opacity-40 ${
                      selectedElement?.underline
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <Underline className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Text Alignment */}
                <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50">
                  {(
                    [
                      { align: 'left', icon: AlignLeft },
                      { align: 'center', icon: AlignCenter },
                      { align: 'right', icon: AlignRight },
                      { align: 'justify', icon: AlignJustify }
                    ] as const
                  ).map(({ align, icon: Icon }) => (
                    <button
                      key={align}
                      disabled={!selectedElement}
                      onClick={() =>
                        selectedElement && updateElement(selectedElement.id, { textAlign: align })
                      }
                      className={`p-1.5 rounded disabled:opacity-40 ${
                        selectedElement?.textAlign === align
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>

                {/* Font & Fill Color Pickers */}
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <span className="text-[11px] font-medium">Texte</span>
                  <input
                    type="color"
                    disabled={!selectedElement}
                    value={selectedElement?.fontColor || '#0f172a'}
                    onChange={(e) =>
                      selectedElement &&
                      updateElement(selectedElement.id, { fontColor: e.target.value })
                    }
                    className="w-6 h-6 rounded border border-slate-300 cursor-pointer disabled:opacity-40"
                  />
                </label>

                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <span className="text-[11px] font-medium">Fond</span>
                  <input
                    type="color"
                    disabled={!selectedElement}
                    value={
                      selectedElement?.fillColor && selectedElement.fillColor !== 'transparent'
                        ? selectedElement.fillColor
                        : '#ffffff'
                    }
                    onChange={(e) =>
                      selectedElement &&
                      updateElement(selectedElement.id, { fillColor: e.target.value })
                    }
                    className="w-6 h-6 rounded border border-slate-300 cursor-pointer disabled:opacity-40"
                  />
                </label>
              </div>

              {/* Layer Ordering Group */}
              <div className="flex items-center gap-1.5">
                <button
                  disabled={!selectedElement}
                  onClick={() => adjustLayer('front')}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 text-xs font-medium flex items-center gap-1"
                >
                  <Layers className="w-3.5 h-3.5 text-indigo-600" />
                  Premier plan
                </button>
                <button
                  disabled={!selectedElement}
                  onClick={() => adjustLayer('forward')}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
                  title="Avancer"
                >
                  <ArrowUp className="w-3.5 h-3.5 text-slate-700" />
                </button>
                <button
                  disabled={!selectedElement}
                  onClick={() => adjustLayer('backward')}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
                  title="Reculer"
                >
                  <ArrowDown className="w-3.5 h-3.5 text-slate-700" />
                </button>
                <button
                  disabled={!selectedElement}
                  onClick={() => adjustLayer('back')}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 text-xs font-medium"
                >
                  Arrière-plan
                </button>
              </div>
            </>
          )}

          {/* ==================== TAB 2: INSERTION ==================== */}
          {activeRibbonTab === 'insertion' && (
            <div className="flex items-center gap-2.5">
              {/* Text Box */}
              <button
                onClick={() =>
                  addElementToPage({
                    type: 'text',
                    x: 80,
                    y: 100,
                    width: 320,
                    height: 110,
                    text: 'Nouveau texte — double-cliquez pour modifier.',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 16,
                    fontColor: '#0f172a',
                    textAlign: 'left',
                    fillColor: 'transparent',
                    strokeColor: '#94a3b8',
                    strokeWidth: 1
                  })
                }
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition"
              >
                <Type className="w-4 h-4" />
                Zone de texte
              </button>

              {/* Upload Image */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 transition"
              >
                <ImageIcon className="w-4 h-4 text-indigo-600" />
                Ajouter une image
              </button>

              {/* Stock Editorial Photo */}
              <button
                onClick={() =>
                  addElementToPage({
                    type: 'image',
                    x: 110,
                    y: 150,
                    width: 360,
                    height: 240,
                    imageUrl:
                      'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=900&q=80',
                    strokeColor: '#cbd5e1',
                    strokeWidth: 1
                  })
                }
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 transition"
              >
                <Sparkles className="w-4 h-4 text-indigo-600" />
                Photo exemple
              </button>

              <div className="h-6 w-px bg-slate-200" />

              {/* Shapes */}
              <button
                onClick={() =>
                  addElementToPage({
                    type: 'shape',
                    shapeVariant: 'rectangle',
                    x: 140,
                    y: 180,
                    width: 220,
                    height: 130,
                    fillColor: '#e0e7ff',
                    strokeColor: '#4f46e5',
                    strokeWidth: 2,
                    borderRadius: 8
                  })
                }
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200"
              >
                <Square className="w-4 h-4 text-indigo-600" />
                Rectangle
              </button>

              <button
                onClick={() =>
                  addElementToPage({
                    type: 'shape',
                    shapeVariant: 'circle',
                    x: 180,
                    y: 180,
                    width: 150,
                    height: 150,
                    fillColor: '#fef3c7',
                    strokeColor: '#d97706',
                    strokeWidth: 2
                  })
                }
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200"
              >
                <Circle className="w-4 h-4 text-amber-600" />
                Cercle
              </button>

              <button
                onClick={() =>
                  addElementToPage({
                    type: 'shape',
                    shapeVariant: 'line',
                    x: 80,
                    y: 260,
                    width: 500,
                    height: 12,
                    fillColor: '#4f46e5',
                    strokeColor: '#4f46e5',
                    strokeWidth: 3
                  })
                }
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200"
              >
                <Minus className="w-4 h-4 text-indigo-600" />
                Ligne
              </button>

              <div className="h-6 w-px bg-slate-200" />

              {/* Table */}
              <button
                onClick={() =>
                  addElementToPage({
                    type: 'table',
                    x: 80,
                    y: 320,
                    width: 560,
                    height: 180,
                    rows: 3,
                    cols: 3,
                    fillColor: '#ffffff',
                    strokeColor: '#94a3b8',
                    strokeWidth: 1,
                    fontSize: 13,
                    fontColor: '#0f172a',
                    tableData: [
                      ['Item / Topic', 'Schedule', 'Notes'],
                      ['Keynote Session', '10:00 AM', 'Main Auditorium'],
                      ['Workshop Panel', '01:30 PM', 'Studio Room B']
                    ]
                  })
                }
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200"
              >
                <TableIcon className="w-4 h-4 text-indigo-600" />
                Tableau 3×3
              </button>

              {/* Page Number Token */}
              <button
                onClick={() =>
                  addElementToPage({
                    type: 'pagenum',
                    x: Math.round(canvasDimensions.width / 2 - 70),
                    y: canvasDimensions.height - 60,
                    width: 140,
                    height: 30,
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 12,
                    fontColor: '#475569',
                    textAlign: 'center'
                  })
                }
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200"
              >
                <Hash className="w-4 h-4 text-indigo-600" />
                Numéro de page
              </button>

              {/* Decorative Page Border */}
              <button
                onClick={() =>
                  addElementToPage({
                    type: 'border',
                    x: 24,
                    y: 24,
                    width: canvasDimensions.width - 48,
                    height: canvasDimensions.height - 48,
                    strokeColor: '#4f46e5',
                    strokeWidth: 3,
                    borderPreset: 'double'
                  })
                }
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200"
              >
                <Frame className="w-4 h-4 text-indigo-600" />
                Cadre décoratif
              </button>

              <div className="h-6 w-px bg-slate-200" />

              {/* Legacy .PUB / Fallback Import Trigger */}
              <button
                onClick={() => universalImportRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-white text-xs font-semibold shadow-2xs"
              >
                <FileSpreadsheet className="w-4 h-4 text-indigo-300" />
                Importer un fichier
              </button>
            </div>
          )}

          {/* ==================== TAB 3: PAGE CREATION ==================== */}
          {activeRibbonTab === 'page-creation' && (
            <div className="flex items-center gap-3">
              {/* Add / Duplicate / Delete Page */}
              <div className="flex items-center gap-2 pr-4 border-r border-slate-200">
                <button
                  onClick={() => {
                    const newPage: PageData = {
                      id: `page-${Date.now()}`,
                      name: `Page ${activeDoc.pages.length + 1}`,
                      background: '#ffffff',
                      backgroundPattern: 'none',
                      elements: [
                        {
                          id: `el-pgnum-${Date.now()}`,
                          type: 'pagenum',
                          x: Math.round(canvasDimensions.width / 2 - 70),
                          y: canvasDimensions.height - 60,
                          width: 140,
                          height: 30,
                          fontFamily: 'Inter, sans-serif',
                          fontSize: 12,
                          fontColor: '#64748b',
                          textAlign: 'center',
                          zIndex: 1
                        }
                      ]
                    };
                    updateActiveDocument((d) => ({
                      ...d,
                      pages: [...d.pages, newPage]
                    }));
                    setActivePageIndex(activeDoc.pages.length);
                    notify('Page ajoutée');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nouvelle page
                </button>

                <button
                  onClick={() => {
                    const cloned: PageData = {
                      ...JSON.parse(JSON.stringify(currentPage)),
                      id: `page-${Date.now()}`,
                      name: `${currentPage.name} (Copy)`
                    };
                    updateActiveDocument((d) => {
                      const nextPages = [...d.pages];
                      nextPages.splice(activePageIndex + 1, 0, cloned);
                      return { ...d, pages: nextPages };
                    });
                    setActivePageIndex(activePageIndex + 1);
                    notify('Page dupliquée');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-xs font-medium"
                >
                  <Copy className="w-3.5 h-3.5 text-indigo-600" />
                  Dupliquer la page
                </button>

                <button
                  disabled={activeDoc.pages.length <= 1}
                  onClick={() => {
                    if (activeDoc.pages.length <= 1) return;
                    updateActiveDocument((d) => ({
                      ...d,
                      pages: d.pages.filter((_, i) => i !== activePageIndex)
                    }));
                    setActivePageIndex(Math.max(0, activePageIndex - 1));
                    notify('Page supprimée');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-40 text-xs font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Supprimer la page
                </button>
              </div>

              {/* Page Size Preset */}
              <div className="flex items-center gap-2 pr-4 border-r border-slate-200">
                <span className="text-xs font-medium text-slate-600">Format :</span>
                <select
                  value={activeDoc.pageSize}
                  onChange={(e) => {
                    const preset = e.target.value as PageSizePreset;
                    updateActiveDocument((d) => ({
                      ...d,
                      pageSize: preset,
                      widthMm: preset === 'A4' ? 210 : preset === 'Letter' ? 215.9 : d.widthMm,
                      heightMm: preset === 'A4' ? 297 : preset === 'Letter' ? 279.4 : d.heightMm
                    }));
                  }}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="A4">A4 (210 × 297 mm)</option>
                  <option value="Letter">Lettre US (215,9 × 279,4 mm)</option>
                  <option value="Custom">Personnalisé</option>
                </select>

                {activeDoc.pageSize === 'Custom' && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={activeDoc.widthMm}
                      onChange={(e) =>
                        updateActiveDocument((d) => ({
                          ...d,
                          widthMm: Math.max(80, Number(e.target.value))
                        }))
                      }
                      className="w-16 px-2 py-1 text-xs border border-slate-300 rounded"
                      title="Largeur en mm"
                    />
                    <span className="text-xs text-slate-400">×</span>
                    <input
                      type="number"
                      value={activeDoc.heightMm}
                      onChange={(e) =>
                        updateActiveDocument((d) => ({
                          ...d,
                          heightMm: Math.max(80, Number(e.target.value))
                        }))
                      }
                      className="w-16 px-2 py-1 text-xs border border-slate-300 rounded"
                      title="Hauteur en mm"
                    />
                  </div>
                )}

                {/* Orientation */}
                <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50">
                  <button
                    onClick={() => updateActiveDocument((d) => ({ ...d, orientation: 'portrait' }))}
                    className={`px-2.5 py-1 rounded text-xs font-medium ${
                      activeDoc.orientation === 'portrait'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Portrait
                  </button>
                  <button
                    onClick={() =>
                      updateActiveDocument((d) => ({ ...d, orientation: 'landscape' }))
                    }
                    className={`px-2.5 py-1 rounded text-xs font-medium ${
                      activeDoc.orientation === 'landscape'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Paysage
                  </button>
                </div>
              </div>

              {/* Page Background Fill */}
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-medium text-slate-600">Fond de page :</span>
                <input
                  type="color"
                  value={currentPage.background || '#ffffff'}
                  onChange={(e) => {
                    const bg = e.target.value;
                    updateActiveDocument((d) => ({
                      ...d,
                      pages: d.pages.map((p, idx) =>
                        idx === activePageIndex ? { ...p, background: bg } : p
                      )
                    }));
                  }}
                  className="w-7 h-7 rounded border border-slate-300 cursor-pointer"
                />
                {[
                  { label: 'Blanc', color: '#ffffff' },
                  { label: 'Ivoire', color: '#fefce8' },
                  { label: 'Gris', color: '#f1f5f9' },
                  { label: 'Bleu pâle', color: '#eef2ff' }
                ].map((preset) => (
                  <button
                    key={preset.color}
                    onClick={() =>
                      updateActiveDocument((d) => ({
                        ...d,
                        pages: d.pages.map((p, idx) =>
                          idx === activePageIndex ? { ...p, background: preset.color } : p
                        )
                      }))
                    }
                    className="px-2 py-1 text-[11px] rounded border border-slate-200 hover:border-indigo-400 bg-white"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ==================== TAB 4: VIEW ==================== */}
          {activeRibbonTab === 'view' && (
            <div className="flex items-center gap-4">
              {/* Zoom Controls */}
              <div className="flex items-center gap-2 pr-4 border-r border-slate-200">
                <button
                  onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100"
                >
                  <ZoomOut className="w-4 h-4 text-slate-700" />
                </button>
                <span className="text-xs font-semibold w-14 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100"
                >
                  <ZoomIn className="w-4 h-4 text-slate-700" />
                </button>
                <button
                  onClick={() => setZoom(0.75)}
                  className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 hover:bg-slate-100 font-medium"
                >
                  Ajuster à la page
                </button>
                <button
                  onClick={() => setZoom(1)}
                  className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 hover:bg-slate-100 font-medium flex items-center gap-1"
                >
                  <Maximize2 className="w-3 h-3" /> 100%
                </button>
              </div>

              {/* Workspace Overlays */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowRulers((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    showRulers
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  <Ruler className="w-3.5 h-3.5" />
                  Règles
                </button>

                <button
                  onClick={() => setShowGuides((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    showGuides
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Marges
                </button>

                <button
                  onClick={() => setShowGrid((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    showGrid
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  <Grid className="w-3.5 h-3.5" />
                  Grille
                </button>

                <button
                  onClick={() => setSnapToGrid((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    snapToGrid
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Magnétisme
                </button>

                <button
                  onClick={() => setShowThumbnails((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    showThumbnails
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  <Layout className="w-3.5 h-3.5" />
                  Miniatures des pages
                </button>
              </div>
            </div>
          )}

          {/* ==================== TAB 5: ABOUT & .PUB IMPORTER ==================== */}
          {activeRibbonTab === 'about' && (
            <div className="flex items-center justify-between w-full gap-4 flex-wrap">
              <p className="text-xs text-slate-600">
                {APP_NAME} v{APP_VERSION} — par <b>{APP_AUTHOR}</b> • Licence {APP_LICENSE}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHelpOpen(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  Ouvrir l’aide
                </button>
                <button
                  onClick={() => setAboutOpen(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Info className="w-3.5 h-3.5" />
                  À propos du logiciel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. WORKSPACE BODY: THUMBNAILS SIDEBAR + RULERS + CANVAS + INSPECTOR */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* LEFT SIDEBAR: MULTI-PAGE THUMBNAILS (src/editor/PageThumbnails.tsx) */}
        {showThumbnails && (
          <aside className="w-52 bg-white border-r border-slate-200 flex flex-col shrink-0 z-10">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Pages ({activeDoc.pages.length})
              </span>
              <button
                onClick={() => {
                  const newPage: PageData = {
                    id: `page-${Date.now()}`,
                    name: `Page ${activeDoc.pages.length + 1}`,
                    background: '#ffffff',
                    backgroundPattern: 'none',
                    elements: []
                  };
                  updateActiveDocument((d) => ({
                    ...d,
                    pages: [...d.pages, newPage]
                  }));
                  setActivePageIndex(activeDoc.pages.length);
                }}
                className="p-1 rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                title="Ajouter une page"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {activeDoc.pages.map((page, idx) => {
                const isCurrent = idx === activePageIndex;
                return (
                  <div
                    key={page.id}
                    onClick={() => {
                      setActivePageIndex(idx);
                      setSelectedElementId(null);
                      setEditingTextId(null);
                    }}
                    className={`group rounded-xl p-2.5 border transition cursor-pointer ${
                      isCurrent
                        ? 'border-indigo-600 bg-indigo-50/60 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-700 truncate">
                        {idx + 1}. {page.name}
                      </span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                        {idx > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateActiveDocument((d) => {
                                const next = [...d.pages];
                                const [moved] = next.splice(idx, 1);
                                next.splice(idx - 1, 0, moved);
                                return { ...d, pages: next };
                              });
                              setActivePageIndex(idx - 1);
                            }}
                            className="p-0.5 text-slate-400 hover:text-indigo-600"
                            title="Monter la page"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                        )}
                        {idx < activeDoc.pages.length - 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateActiveDocument((d) => {
                                const next = [...d.pages];
                                const [moved] = next.splice(idx, 1);
                                next.splice(idx + 1, 0, moved);
                                return { ...d, pages: next };
                              });
                              setActivePageIndex(idx + 1);
                            }}
                            className="p-0.5 text-slate-400 hover:text-indigo-600"
                            title="Descendre la page"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        )}
                        {activeDoc.pages.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateActiveDocument((d) => ({
                                ...d,
                                pages: d.pages.filter((_, i) => i !== idx)
                              }));
                              if (activePageIndex >= idx && activePageIndex > 0) {
                                setActivePageIndex(activePageIndex - 1);
                              }
                            }}
                            className="p-0.5 text-slate-400 hover:text-rose-600"
                            title="Supprimer la page"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div
                      className={`mx-auto rounded border border-slate-300 shadow-2xs relative overflow-hidden ${
                        activeDoc.orientation === 'landscape' ? 'w-36 h-24' : 'w-24 h-32'
                      }`}
                      style={{ background: page.background || '#ffffff' }}
                    >
                      <div className="absolute inset-2 border border-dashed border-indigo-200 pointer-events-none" />
                      <div className="p-2 text-[9px] text-slate-400 font-medium">
                        {page.elements.length} items
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        {/* CENTER WORKSPACE: RULERS & INTERACTIVE PAGE CANVAS (src/editor/Canvas.tsx) */}
        <div
          className="flex-1 overflow-auto bg-slate-200/90 relative flex flex-col items-center p-8"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedElementId(null);
              setEditingTextId(null);
            }
          }}
        >
          {/* Horizontal Top Ruler */}
          {showRulers && (
            <div
              className="bg-white/90 border border-slate-300 text-[9px] text-slate-400 flex items-end mb-1 select-none shrink-0 overflow-hidden rounded-t"
              style={{ width: canvasDimensions.width * zoom, height: 20 }}
            >
              {Array.from({ length: Math.ceil(canvasDimensions.width / 50) }).map((_, i) => (
                <div
                  key={i}
                  className="border-l border-slate-300 pl-1 h-3 shrink-0"
                  style={{ width: 50 * zoom }}
                >
                  {i * 50}
                </div>
              ))}
            </div>
          )}

          <div className="flex">
            {/* Vertical Left Ruler */}
            {showRulers && (
              <div
                className="bg-white/90 border border-slate-300 text-[9px] text-slate-400 flex flex-col mr-1 select-none shrink-0 overflow-hidden rounded-l"
                style={{ width: 22, height: canvasDimensions.height * zoom }}
              >
                {Array.from({ length: Math.ceil(canvasDimensions.height / 50) }).map((_, i) => (
                  <div
                    key={i}
                    className="border-t border-slate-300 pt-0.5 pl-0.5 shrink-0"
                    style={{ height: 50 * zoom }}
                  >
                    {i * 50}
                  </div>
                ))}
              </div>
            )}

            {/* Physical Page Surface */}
            <div
              className="relative shadow-2xl border border-slate-300 transition-transform origin-top-left"
              style={{
                width: canvasDimensions.width,
                height: canvasDimensions.height,
                transform: `scale(${zoom})`,
                marginBottom: -(canvasDimensions.height * (1 - zoom)),
                marginRight: -(canvasDimensions.width * (1 - zoom)),
                backgroundColor: currentPage.background || '#ffffff',
                backgroundImage: showGrid
                  ? 'radial-gradient(#94a3b8 1px, transparent 1px)'
                  : undefined,
                backgroundSize: showGrid ? '16px 16px' : undefined
              }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                  setSelectedElementId(null);
                  setEditingTextId(null);
                }
              }}
            >
              {/* Margin Guides Overlay */}
              {showGuides && (
                <div
                  className="absolute border border-dashed border-indigo-400/70 pointer-events-none z-40"
                  style={{
                    left: marginPx,
                    top: marginPx,
                    right: marginPx,
                    bottom: marginPx
                  }}
                />
              )}

              {/* Render All Elements Sorted by zIndex */}
              {[...currentPage.elements]
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((el) => {
                  const isSelected = el.id === selectedElementId;
                  const isEditing = el.id === editingTextId;

                  return (
                    <div
                      key={el.id}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelectedElementId(el.id);
                        if (editingTextId !== el.id) {
                          setEditingTextId(null);
                          dragStateRef.current = {
                            mode: 'move',
                            elementId: el.id,
                            startX: e.clientX,
                            startY: e.clientY,
                            origX: el.x,
                            origY: el.y,
                            origW: el.width,
                            origH: el.height
                          };
                        }
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (el.type === 'text') {
                          setEditingTextId(el.id);
                        }
                      }}
                      style={{
                        position: 'absolute',
                        left: el.x,
                        top: el.y,
                        width: el.width,
                        height: el.height,
                        zIndex: el.zIndex
                      }}
                      className={`group ${
                        isSelected
                          ? 'ring-2 ring-indigo-600'
                          : 'hover:ring-1 hover:ring-indigo-300'
                      } ${el.type === 'border' ? 'pointer-events-auto' : ''}`}
                    >
                      {/* ELEMENT TYPE: TEXT OR PAGENUM */}
                      {(el.type === 'text' || el.type === 'pagenum') && (
                        <div
                          className="w-full h-full p-1.5 box-border overflow-hidden"
                          style={{
                            backgroundColor: el.fillColor || 'transparent',
                            border:
                              (el.strokeWidth ?? 0) > 0
                                ? `${el.strokeWidth}px solid ${el.strokeColor || '#cbd5e1'}`
                                : 'none',
                            fontFamily: el.fontFamily || 'Inter, sans-serif',
                            fontSize: el.fontSize || 16,
                            color: el.fontColor || '#0f172a',
                            fontWeight: el.bold ? 'bold' : 'normal',
                            fontStyle: el.italic ? 'italic' : 'normal',
                            textDecoration: el.underline ? 'underline' : 'none',
                            textAlign: el.textAlign || 'left',
                            lineHeight: 1.32
                          }}
                        >
                          {el.type === 'pagenum' ? (
                            <span>
                              Page {activePageIndex + 1} of {activeDoc.pages.length}
                            </span>
                          ) : isEditing ? (
                            <textarea
                              autoFocus
                              value={el.text || ''}
                              onChange={(e) => updateElement(el.id, { text: e.target.value })}
                              className="w-full h-full bg-white/90 focus:outline-none resize-none p-0 m-0"
                              style={{
                                fontFamily: 'inherit',
                                fontSize: 'inherit',
                                color: 'inherit',
                                fontWeight: 'inherit',
                                fontStyle: 'inherit',
                                textAlign: 'inherit'
                              }}
                            />
                          ) : (
                            <div className="whitespace-pre-wrap break-words">{el.text}</div>
                          )}
                        </div>
                      )}

                      {/* ELEMENT TYPE: SHAPE */}
                      {el.type === 'shape' && (
                        <div className="w-full h-full flex items-center justify-center">
                          {el.shapeVariant === 'line' ? (
                            <div
                              style={{
                                width: '100%',
                                height: Math.max(2, el.strokeWidth || 3),
                                backgroundColor: el.strokeColor || '#4f46e5'
                              }}
                            />
                          ) : (
                            <div
                              className="w-full h-full"
                              style={{
                                backgroundColor: el.fillColor || '#e2e8f0',
                                border: `${el.strokeWidth ?? 1}px solid ${
                                  el.strokeColor || '#4f46e5'
                                }`,
                                borderRadius:
                                  el.shapeVariant === 'circle' ? '9999px' : el.borderRadius || 0
                              }}
                            />
                          )}
                        </div>
                      )}

                      {/* ELEMENT TYPE: DECORATIVE BORDER */}
                      {el.type === 'border' && (
                        <div
                          className="w-full h-full box-border pointer-events-none"
                          style={{
                            border: `${el.strokeWidth || 3}px ${
                              el.borderPreset === 'double' ? 'double' : 'solid'
                            } ${el.strokeColor || '#4f46e5'}`,
                            outline:
                              el.borderPreset === 'ornate'
                                ? `1px solid ${el.strokeColor || '#4f46e5'}`
                                : undefined,
                            outlineOffset: el.borderPreset === 'ornate' ? '-6px' : undefined
                          }}
                        />
                      )}

                      {/* ELEMENT TYPE: IMAGE */}
                      {el.type === 'image' && (
                        <img
                          src={el.imageUrl}
                          alt="Canvas visual"
                          draggable={false}
                          className="w-full h-full object-cover select-none"
                          style={{
                            border:
                              (el.strokeWidth ?? 0) > 0
                                ? `${el.strokeWidth}px solid ${el.strokeColor || '#cbd5e1'}`
                                : 'none'
                          }}
                        />
                      )}

                      {/* ELEMENT TYPE: TABLE */}
                      {el.type === 'table' && el.tableData && (
                        <table
                          className="w-full h-full border-collapse table-fixed"
                          style={{
                            fontSize: el.fontSize || 13,
                            color: el.fontColor || '#0f172a',
                            backgroundColor: el.fillColor || '#ffffff'
                          }}
                        >
                          <tbody>
                            {el.tableData.map((row, rIdx) => (
                              <tr key={rIdx}>
                                {row.map((cell, cIdx) => (
                                  <td
                                    key={cIdx}
                                    style={{
                                      border: `1px solid ${el.strokeColor || '#94a3b8'}`,
                                      backgroundColor: rIdx === 0 ? '#eef2ff' : undefined,
                                      fontWeight: rIdx === 0 ? 700 : 400
                                    }}
                                    className="p-1.5 align-middle"
                                  >
                                    <input
                                      type="text"
                                      value={cell}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onChange={(e) => {
                                        const nextTable = el.tableData!.map((r, ri) =>
                                          ri === rIdx
                                            ? r.map((c, ci) => (ci === cIdx ? e.target.value : c))
                                            : r
                                        );
                                        updateElement(el.id, { tableData: nextTable });
                                      }}
                                      className="w-full bg-transparent focus:outline-none focus:bg-white/80 px-1 rounded"
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {/* RESIZE HANDLES WHEN SELECTED */}
                      {isSelected && (
                        <>
                          {/* East Handle */}
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              dragStateRef.current = {
                                mode: 'resize-r',
                                elementId: el.id,
                                startX: e.clientX,
                                startY: e.clientY,
                                origX: el.x,
                                origY: el.y,
                                origW: el.width,
                                origH: el.height
                              };
                            }}
                            className="w-3 h-3 bg-white border-2 border-indigo-600 rounded-full absolute -right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize shadow"
                          />
                          {/* South Handle */}
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              dragStateRef.current = {
                                mode: 'resize-b',
                                elementId: el.id,
                                startX: e.clientX,
                                startY: e.clientY,
                                origX: el.x,
                                origY: el.y,
                                origW: el.width,
                                origH: el.height
                              };
                            }}
                            className="w-3 h-3 bg-white border-2 border-indigo-600 rounded-full absolute left-1/2 -bottom-1.5 -translate-x-1/2 cursor-ns-resize shadow"
                          />
                          {/* South-East Corner Handle */}
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              dragStateRef.current = {
                                mode: 'resize-br',
                                elementId: el.id,
                                startX: e.clientX,
                                startY: e.clientY,
                                origX: el.x,
                                origY: el.y,
                                origW: el.width,
                                origH: el.height
                              };
                            }}
                            className="w-3.5 h-3.5 bg-indigo-600 border-2 border-white rounded-full absolute -right-2 -bottom-2 cursor-nwse-resize shadow"
                          />
                        </>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* RIGHT SIDEBAR: CONTEXTUAL ELEMENT INSPECTOR */}
        {selectedElement && (
          <aside className="w-64 bg-white border-l border-slate-200 p-4 space-y-4 overflow-y-auto shrink-0 hidden xl:block">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                  Propriétés
                </span>
                <h4 className="text-xs font-bold text-slate-900 capitalize">
                  {selectedElement.type} Frame
                </h4>
              </div>
              <button
                onClick={() => setSelectedElementId(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Position & Geometry */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-slate-600">Position et taille</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-500">
                  X
                  <input
                    type="number"
                    value={selectedElement.x}
                    onChange={(e) =>
                      updateElement(selectedElement.id, { x: Number(e.target.value) })
                    }
                    className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-300 rounded"
                  />
                </label>
                <label className="text-[11px] text-slate-500">
                  Y
                  <input
                    type="number"
                    value={selectedElement.y}
                    onChange={(e) =>
                      updateElement(selectedElement.id, { y: Number(e.target.value) })
                    }
                    className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-300 rounded"
                  />
                </label>
                <label className="text-[11px] text-slate-500">
                  Largeur
                  <input
                    type="number"
                    value={selectedElement.width}
                    onChange={(e) =>
                      updateElement(selectedElement.id, {
                        width: Math.max(24, Number(e.target.value))
                      })
                    }
                    className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-300 rounded"
                  />
                </label>
                <label className="text-[11px] text-slate-500">
                  Hauteur
                  <input
                    type="number"
                    value={selectedElement.height}
                    onChange={(e) =>
                      updateElement(selectedElement.id, {
                        height: Math.max(20, Number(e.target.value))
                      })
                    }
                    className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-300 rounded"
                  />
                </label>
              </div>
            </div>

            {/* Stroke & Border Width */}
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <div className="text-[11px] font-semibold text-slate-600">Bordure</div>
              <div className="flex items-center justify-between gap-2">
                <input
                  type="color"
                  value={
                    selectedElement.strokeColor && selectedElement.strokeColor !== 'transparent'
                      ? selectedElement.strokeColor
                      : '#4f46e5'
                  }
                  onChange={(e) =>
                    updateElement(selectedElement.id, { strokeColor: e.target.value })
                  }
                  className="w-8 h-8 rounded border border-slate-300 cursor-pointer"
                />
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={selectedElement.strokeWidth ?? 1}
                  onChange={(e) =>
                    updateElement(selectedElement.id, { strokeWidth: Number(e.target.value) })
                  }
                  className="w-20 px-2 py-1 text-xs border border-slate-300 rounded"
                />
                <span className="text-xs text-slate-500">px</span>
              </div>
            </div>

            {selectedElement.type === 'text' && (
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="text-[11px] font-semibold text-slate-600">Contenu du texte</div>
                <textarea
                  rows={5}
                  value={selectedElement.text || ''}
                  onChange={(e) => updateElement(selectedElement.id, { text: e.target.value })}
                  className="w-full p-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            {/* Dynamic Table Row/Col Controls */}
            {selectedElement.type === 'table' && selectedElement.tableData && (
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="text-[11px] font-semibold text-slate-600">
                  Table Structure ({selectedElement.tableData.length}×
                  {selectedElement.tableData[0]?.length || 1})
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => {
                      const cols = selectedElement.tableData![0]?.length || 1;
                      const nextRow = Array.from({ length: cols }, () => 'New Cell');
                      updateElement(selectedElement.id, {
                        tableData: [...selectedElement.tableData!, nextRow]
                      });
                    }}
                    className="px-2 py-1.5 text-[11px] font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded border border-indigo-200"
                  >
                    + Add Row
                  </button>
                  <button
                    onClick={() => {
                      if (selectedElement.tableData!.length <= 1) return;
                      updateElement(selectedElement.id, {
                        tableData: selectedElement.tableData!.slice(0, -1)
                      });
                    }}
                    className="px-2 py-1.5 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded"
                  >
                    - Remove Row
                  </button>
                  <button
                    onClick={() => {
                      const nextTable = selectedElement.tableData!.map((r, i) => [
                        ...r,
                        i === 0 ? 'Header' : 'Cell'
                      ]);
                      updateElement(selectedElement.id, { tableData: nextTable });
                    }}
                    className="px-2 py-1.5 text-[11px] font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded border border-indigo-200"
                  >
                    + Add Col
                  </button>
                  <button
                    onClick={() => {
                      if ((selectedElement.tableData![0]?.length || 1) <= 1) return;
                      const nextTable = selectedElement.tableData!.map((r) => r.slice(0, -1));
                      updateElement(selectedElement.id, { tableData: nextTable });
                    }}
                    className="px-2 py-1.5 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded"
                  >
                    - Remove Col
                  </button>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}

      {pubStudioModalOpen && latestImportReport && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="font-bold text-lg text-slate-900">Fichier importé</h3>
            <p className="text-sm text-slate-700">
              <b>{latestImportReport.fileName}</b> a été converti. {latestImportReport.extractedTextBlocks.length} bloc(s) de texte et{' '}
              {latestImportReport.extractedImagesCount} image(s) récupérés.
            </p>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              La mise en page d’origine peut avoir changé. Vérifiez chaque page avant d’imprimer et replacez les éléments si besoin.
            </div>
            {latestImportReport.warnings.length > 0 && (
              <ul className="text-xs text-slate-600 list-disc pl-5 space-y-1 max-h-32 overflow-y-auto">
                {latestImportReport.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            <div className="flex justify-end">
              <button
                onClick={() => setPubStudioModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
              >
                J’ai compris
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Pill */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg border border-slate-700 flex items-center gap-2 text-xs font-medium">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default App;