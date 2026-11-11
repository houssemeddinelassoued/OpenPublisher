// ============================================================================
// Text layout & linked text frames ("story autoflow")
// One measuring engine is shared by the on-screen canvas and the PDF/PNG
// exporter, so line breaks are identical everywhere.
// ============================================================================
import type { CanvasElementData, PubDocument } from './model';

export const TEXT_PAD = 6;
export const LINE_HEIGHT = 1.32;

export interface LaidLine {
  text: string;
  /** Last line of a paragraph (never stretched when justified). */
  endsPara: boolean;
}

export interface FrameFlow {
  lines: LaidLine[];
  /** Text did not fit and has nowhere to go (last frame of the chain). */
  overflow: boolean;
  /** Id of the first frame of the story this frame belongs to. */
  storyHeadId: string;
  /** Position of this frame in its chain (0 = head). */
  chainIndex: number;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function ctx(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

export function fontString(el: CanvasElementData): string {
  return `${el.italic ? 'italic ' : ''}${el.bold ? 'bold ' : ''}${el.fontSize || 16}px ${
    el.fontFamily || 'Inter, sans-serif'
  }`;
}

interface Cursor {
  p: number; // paragraph index
  w: number; // word index inside paragraph
}

type Story = string[][];

function tokenize(text: string): Story {
  return text.split('\n').map((p) => (p.length ? p.split(' ') : []));
}

/** Breaks a long single word that cannot fit on one line. */
function splitWord(word: string, maxW: number, c: CanvasRenderingContext2D): [string, string] {
  let i = word.length;
  while (i > 1 && c.measureText(word.slice(0, i)).width > maxW) i--;
  return [word.slice(0, i), word.slice(i)];
}

/**
 * Lays out as many lines of `story` (from `cursor`) as fit in the frame.
 * When `maxLines` is Infinity everything is laid out.
 */
function layoutFrame(story: Story, cursor: Cursor, el: CanvasElementData, maxLines: number) {
  const c = ctx();
  c.font = fontString(el);
  const maxW = Math.max(10, el.width - TEXT_PAD * 2);
  const lines: LaidLine[] = [];
  let { p, w } = cursor;
  // Copy so word splitting does not mutate the shared story.
  const paras = story.map((x) => x.slice());

  while (p < paras.length && lines.length < maxLines) {
    const words = paras[p];
    if (words.length === 0 || w >= words.length) {
      if (words.length === 0) lines.push({ text: '', endsPara: true });
      p++;
      w = 0;
      continue;
    }
    let line = '';
    while (w < words.length) {
      const candidate = line ? `${line} ${words[w]}` : words[w];
      if (c.measureText(candidate).width <= maxW) {
        line = candidate;
        w++;
      } else if (!line) {
        const [head, tail] = splitWord(words[w], maxW, c);
        line = head;
        if (tail) words[w] = tail;
        else w++;
        break;
      } else break;
    }
    const ends = w >= words.length;
    lines.push({ text: line, endsPara: ends });
    if (ends) {
      p++;
      w = 0;
    }
  }
  return { lines, cursor: { p, w }, paras };
}

function maxLinesFor(el: CanvasElementData) {
  const lh = (el.fontSize || 16) * LINE_HEIGHT;
  return Math.max(1, Math.floor((el.height - TEXT_PAD * 2 + 0.01) / lh));
}

/** Text frames that are the target of another frame's nextFrameId. */
function targetsOf(all: CanvasElementData[]) {
  const s = new Set<string>();
  for (const e of all) if (e.type === 'text' && e.nextFrameId) s.add(e.nextFrameId);
  return s;
}

/** Collects every text frame in the document (pages + master). */
export function allTextFrames(doc: PubDocument): CanvasElementData[] {
  const out: CanvasElementData[] = [];
  for (const p of doc.pages) for (const e of p.elements) if (e.type === 'text') out.push(e);
  for (const e of doc.master?.elements || []) if (e.type === 'text') out.push(e);
  return out;
}

/**
 * Computes the visible lines of every text frame in a document, following
 * nextFrameId links (across pages too). Cycles are ignored safely.
 */
export function computeDocumentFlows(doc: PubDocument): Map<string, FrameFlow> {
  const frames = allTextFrames(doc);
  const byId = new Map(frames.map((f) => [f.id, f]));
  const targets = targetsOf(frames);
  const result = new Map<string, FrameFlow>();

  for (const head of frames) {
    if (targets.has(head.id) && byId.has(head.id)) {
      // Not a head unless the chain pointing to it is broken (handled below).
      continue;
    }
    flowChain(head, byId, result);
  }
  // Orphan cycles (A→B→A) have no head: treat the first one as head.
  for (const f of frames) if (!result.has(f.id)) flowChain(f, byId, result);
  return result;
}

function flowChain(head: CanvasElementData, byId: Map<string, CanvasElementData>, out: Map<string, FrameFlow>) {
  const story = tokenize(head.text || '');
  let cursor: Cursor = { p: 0, w: 0 };
  let frame: CanvasElementData | undefined = head;
  const seen = new Set<string>();
  let idx = 0;
  let paras = story;
  while (frame && !seen.has(frame.id)) {
    seen.add(frame.id);
    const next: CanvasElementData | undefined = frame.nextFrameId ? byId.get(frame.nextFrameId) : undefined;
    const hasNext: boolean = !!next && !seen.has(next.id);
    const res = layoutFrame(paras, cursor, frame, maxLinesFor(frame));
    paras = res.paras;
    cursor = res.cursor;
    const remaining = cursor.p < paras.length;
    out.set(frame.id, {
      lines: res.lines,
      overflow: remaining && !hasNext,
      storyHeadId: head.id,
      chainIndex: idx++
    });
    frame = hasNext ? next : undefined;
  }
}

/** Removes a frame from link chains (used when a frame is deleted). */
export function unlinkReferences(doc: PubDocument, removedIds: Set<string>): PubDocument {
  const fix = (els: CanvasElementData[]) =>
    els.map((e) => {
      if (e.nextFrameId && removedIds.has(e.nextFrameId)) {
        const target = findEl(doc, e.nextFrameId);
        return { ...e, nextFrameId: target?.nextFrameId && !removedIds.has(target.nextFrameId) ? target.nextFrameId : undefined };
      }
      return e;
    });
  return {
    ...doc,
    pages: doc.pages.map((p) => ({ ...p, elements: fix(p.elements) })),
    master: doc.master ? { elements: fix(doc.master.elements) } : doc.master
  };
}

export function findEl(doc: PubDocument, id: string): CanvasElementData | undefined {
  for (const p of doc.pages) {
    const f = p.elements.find((e) => e.id === id);
    if (f) return f;
  }
  return doc.master?.elements.find((e) => e.id === id);
}

/** Page index of an element (-1 = master layer). */
export function pageOfElement(doc: PubDocument, id: string): number {
  for (let i = 0; i < doc.pages.length; i++) if (doc.pages[i].elements.some((e) => e.id === id)) return i;
  return -1;
}
