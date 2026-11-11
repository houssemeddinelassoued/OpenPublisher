// ============================================================================
// Rich text helpers: keeping formatted runs and paragraph formats in sync with
// the plain `text` of an element while it is edited.
// ============================================================================
import type { CanvasElementData, ParaFormat, TextRun } from './model';

export const RUN_STYLE_KEYS = ['bold', 'italic', 'underline', 'fontSize', 'fontColor', 'fontFamily', 'script'] as const;
type RunStyle = Omit<TextRun, 'text'>;

/** Runs of an element, or null when absent / out of sync with its text. */
export function validRuns(el: Pick<CanvasElementData, 'runs' | 'text'>): TextRun[] | null {
  if (!el.runs?.length) return null;
  let total = 0;
  for (const r of el.runs) total += r.text.length;
  return total === (el.text || '').length ? el.runs : null;
}

const sameStyle = (a: RunStyle, b: RunStyle) => RUN_STYLE_KEYS.every((k) => a[k] === b[k]);

function styleOf(r: TextRun): RunStyle {
  const s: RunStyle = {};
  for (const k of RUN_STYLE_KEYS) if (r[k] !== undefined) (s as Record<string, unknown>)[k] = r[k];
  return s;
}

/** Merges adjacent runs with identical formatting and drops empty ones. */
export function compactRuns(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && sameStyle(styleOf(last), styleOf(r))) last.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

function explode(runs: TextRun[]): { idx: number[]; styles: RunStyle[] } {
  const idx: number[] = [];
  const styles: RunStyle[] = [];
  runs.forEach((r, i) => {
    styles.push(styleOf(r));
    for (let k = 0; k < r.text.length; k++) idx.push(i);
  });
  return { idx, styles };
}

function implode(text: string, idx: number[], styles: RunStyle[]): TextRun[] {
  const out: TextRun[] = [];
  let k = 0;
  while (k < text.length) {
    let e = k + 1;
    while (e < text.length && idx[e] === idx[k]) e++;
    out.push({ ...(styles[idx[k]] ?? {}), text: text.slice(k, e) });
    k = e;
  }
  return compactRuns(out);
}

const countBreaks = (s: string) => {
  let n = 0;
  for (const ch of s) if (ch === '\n') n++;
  return n;
};

/** Number of paragraphs of a text. */
export const paragraphCount = (text: string) => countBreaks(text) + 1;

/**
 * Re-aligns runs and paragraph formats after the plain text changed from
 * `el.text` to `next`. Inserted characters take the style of the character
 * before them (or after them at the start of a paragraph); new paragraphs
 * inherit the format of the paragraph where they were created.
 */
export function remapRich(el: CanvasElementData, next: string): Pick<CanvasElementData, 'runs' | 'paras'> {
  const old = el.text || '';
  const max = Math.min(old.length, next.length);
  let p = 0;
  while (p < max && old[p] === next[p]) p++;
  let s = 0;
  while (s < max - p && old[old.length - 1 - s] === next[next.length - 1 - s]) s++;
  const delEnd = old.length - s;
  const inserted = next.slice(p, next.length - s);

  const out: Pick<CanvasElementData, 'runs' | 'paras'> = {};
  const runs = validRuns(el);
  if (runs) {
    const { idx, styles } = explode(runs);
    const atParaStart = p === 0 || old[p - 1] === '\n';
    const insStyle = (atParaStart ? idx[delEnd] ?? idx[p - 1] : idx[p - 1] ?? idx[delEnd]) ?? 0;
    const nextIdx = [...idx.slice(0, p), ...new Array(inserted.length).fill(insStyle), ...idx.slice(delEnd)];
    out.runs = next.length ? implode(next, nextIdx, styles) : [];
  } else if (el.runs) out.runs = undefined;

  if (el.paras) {
    const paras = normalizeParas(el.paras, paragraphCount(old));
    const k0 = countBreaks(old.slice(0, p));
    const removed = countBreaks(old.slice(p, delEnd));
    const added = countBreaks(inserted);
    out.paras = [...paras.slice(0, k0 + 1), ...new Array(added).fill(paras[k0] ?? {}), ...paras.slice(k0 + 1 + removed)];
  }
  return out;
}

export function normalizeParas(paras: ParaFormat[], count: number): ParaFormat[] {
  if (paras.length === count) return paras;
  if (paras.length > count) return paras.slice(0, count);
  return [...paras, ...new Array(count - paras.length).fill(paras[paras.length - 1] ?? {})];
}

/**
 * Applies a patch to an element, keeping rich text consistent:
 *  - a text change re-aligns runs / paragraph formats,
 *  - an element-level style (bold, size, colour…) applies to the whole text,
 *  - an element-level alignment applies to every paragraph.
 */
export function applyElementPatch(el: CanvasElementData, patch: Partial<CanvasElementData>): CanvasElementData {
  const next: CanvasElementData = { ...el, ...patch };
  if (!el.runs && !el.paras) return next;
  if ('text' in patch && patch.text !== el.text && !('runs' in patch) && !('paras' in patch)) {
    Object.assign(next, remapRich(el, patch.text ?? ''));
  }
  const keys = RUN_STYLE_KEYS.filter((k) => k in patch);
  if (keys.length && next.runs && !('runs' in patch)) {
    next.runs = compactRuns(
      next.runs.map((r) => {
        const c = { ...r };
        for (const k of keys) delete c[k];
        return c;
      })
    );
  }
  if ('textAlign' in patch && next.paras && !('paras' in patch)) {
    next.paras = next.paras.map((p) => {
      const c = { ...p };
      delete c.align;
      return c;
    });
  }
  return next;
}

/** Most used value of a run property, weighted by number of characters. */
export function dominant<K extends keyof RunStyle>(runs: TextRun[], key: K): RunStyle[K] | undefined {
  const counts = new Map<RunStyle[K], number>();
  for (const r of runs) {
    const n = r.text.replace(/\s/g, '').length || 0.1;
    counts.set(r[key], (counts.get(r[key]) ?? 0) + n);
  }
  let best: RunStyle[K] | undefined;
  let bestN = -1;
  for (const [v, n] of counts) if (n > bestN && v !== undefined) {
    best = v;
    bestN = n;
  }
  return best;
}
