/**
 * Line-level diff between two resume versions.
 *
 * Pure and dependency-free: an LCS over normalised lines, then a word-level
 * pass on paired changes so the UI can highlight exactly what moved. Resumes
 * are short enough (a few hundred lines) that O(n·m) is fine.
 */

export type DiffKind = "added" | "removed" | "unchanged" | "changed";

export interface DiffLine {
  kind: DiffKind;
  before?: string;
  after?: string;
  /** Word-level segments, only populated for `changed` lines. */
  beforeWords?: { text: string; changed: boolean }[];
  afterWords?: { text: string; changed: boolean }[];
}

const splitLines = (text: string): string[] =>
  text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

const key = (line: string) => line.toLowerCase().replace(/\s+/g, " ");

/** Longest common subsequence table over lines. */
function lcs(a: string[], b: string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] = key(a[i]!) === key(b[j]!) ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  return table;
}

function wordSimilarity(a: string, b: string): number {
  const aw = new Set(key(a).split(" "));
  const bw = new Set(key(b).split(" "));
  let shared = 0;
  aw.forEach((w) => {
    if (bw.has(w)) shared++;
  });
  return shared / Math.max(1, Math.max(aw.size, bw.size));
}

function wordDiff(before: string, after: string) {
  const bw = before.split(/\s+/);
  const aw = after.split(/\s+/);
  const bSet = new Set(bw.map((w) => w.toLowerCase()));
  const aSet = new Set(aw.map((w) => w.toLowerCase()));
  return {
    beforeWords: bw.map((text) => ({ text, changed: !aSet.has(text.toLowerCase()) })),
    afterWords: aw.map((text) => ({ text, changed: !bSet.has(text.toLowerCase()) })),
  };
}

export interface DiffResult {
  lines: DiffLine[];
  addedCount: number;
  removedCount: number;
  changedCount: number;
  /** Words present in the newer version but not the older one. */
  newKeywords: string[];
  droppedKeywords: string[];
}

const STOP_WORDS = new Set(
  "a an the and or of to in for with on at by from as is are was were be been this that our your my we i you it its their".split(" "),
);

function keywordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w)),
  );
}

export function diffResumes(beforeText: string, afterText: string): DiffResult {
  const a = splitLines(beforeText);
  const b = splitLines(afterText);
  const table = lcs(a, b);

  const raw: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (key(a[i]!) === key(b[j]!)) {
      raw.push({ kind: "unchanged", before: a[i], after: b[j] });
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      raw.push({ kind: "removed", before: a[i] });
      i++;
    } else {
      raw.push({ kind: "added", after: b[j] });
      j++;
    }
  }
  while (i < a.length) raw.push({ kind: "removed", before: a[i++] });
  while (j < b.length) raw.push({ kind: "added", after: b[j++] });

  // Pair adjacent remove/add that are clearly a rewrite of the same line.
  const lines: DiffLine[] = [];
  for (let k = 0; k < raw.length; k++) {
    const cur = raw[k]!;
    const next = raw[k + 1];
    if (cur.kind === "removed" && next?.kind === "added" && wordSimilarity(cur.before!, next.after!) >= 0.4) {
      const { beforeWords, afterWords } = wordDiff(cur.before!, next.after!);
      lines.push({ kind: "changed", before: cur.before, after: next.after, beforeWords, afterWords });
      k++;
    } else {
      lines.push(cur);
    }
  }

  const beforeKeywords = keywordSet(beforeText);
  const afterKeywords = keywordSet(afterText);
  const newKeywords = [...afterKeywords].filter((w) => !beforeKeywords.has(w)).slice(0, 24);
  const droppedKeywords = [...beforeKeywords].filter((w) => !afterKeywords.has(w)).slice(0, 24);

  return {
    lines,
    addedCount: lines.filter((l) => l.kind === "added").length,
    removedCount: lines.filter((l) => l.kind === "removed").length,
    changedCount: lines.filter((l) => l.kind === "changed").length,
    newKeywords,
    droppedKeywords,
  };
}

export interface ScoreDelta {
  label: string;
  before: number | null;
  after: number | null;
  delta: number | null;
}

export function scoreDeltas(
  before: Record<string, number | null>,
  after: Record<string, number | null>,
): ScoreDelta[] {
  const fields: [string, string][] = [
    ["ats_score", "ATS score"],
    ["keyword_match", "Keyword match"],
    ["formatting_score", "Formatting"],
    ["impact_score", "Impact"],
    ["readability_score", "Readability"],
  ];
  return fields.map(([field, label]) => {
    const b = before[field] ?? null;
    const a = after[field] ?? null;
    return { label, before: b, after: a, delta: b != null && a != null ? a - b : null };
  });
}
