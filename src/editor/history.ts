import type { PubDocument } from '../core/model';

/** One undoable step: the document state *before* the action, and the action's name. */
export interface HistEntry {
  doc: PubDocument;
  label: string;
  at: number;
}

/**
 * Undo / redo stacks for one document. Kept by the App per document, so the
 * history survives leaving the editor and coming back during the session.
 */
export interface HistoryStore {
  past: HistEntry[];
  future: HistEntry[];
  lastKey: string;
  lastAt: number;
}

export const HISTORY_LIMIT = 300;
/** Successive changes with the same key (typing, sliders…) within this delay form one step. */
export const COALESCE_MS = 1500;

export function createHistory(): HistoryStore {
  return { past: [], future: [], lastKey: '', lastAt: 0 };
}
