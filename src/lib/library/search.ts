/*
 * Local, typo-tolerant Library search. Runs entirely in the browser over the
 * reviewed fields of the already-filtered collection: title, reviewed summary,
 * topic tags and supplied search terms. Original source claims and nested
 * source material are not indexed.
 *
 * Ranking: exact and prefix title matches, then other title words, then the
 * reviewed summary and topic tags, then the weaker topic aliases. Every
 * significant query word must match somewhere, so a multiword query isn't
 * satisfied by one common word. Short words match more tightly.
 */

import type { EntryBase, LibraryTopic } from "./types";

/** Lowercase, strip accents and punctuation; `farmer’s` → `farmers`. */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const tokenize = (s: string) => {
  const n = normalize(s);
  return n ? n.split(" ") : [];
};

/** Words too common to carry intent on their own. */
const STOPWORDS = new Set(
  "a an and are as at be by for from how i in is it my of on or the to what when with your".split(
    " ",
  ),
);

/** Optimal-string-alignment distance, giving up beyond `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

/** Typos allowed for a query word of this length. */
const allowedEdits = (n: number) => (n <= 3 ? 0 : n <= 5 ? 1 : 2);

/**
 * How well query word `q` matches document word `w`, 0–1.
 * Exact 1; prefix 0.85; typo 0.7 (one edit) / 0.55 (two); stem 0.6; inside
 * a longer word 0.5. Words under four letters only match exactly or as a
 * prefix.
 */
export function wordMatch(q: string, w: string): number {
  if (q === w) return 1;
  if (w.startsWith(q)) return q.length >= 2 ? 0.85 : 0;
  if (q.length < 4) return 0;
  // The word is the stem of a longer query word: "boil" for "boiling".
  if (w.length >= 4 && q.length - w.length <= 3 && q.startsWith(w)) return 0.6;
  const max = allowedEdits(q.length);
  // Compare against the whole word and its same-length prefix (still typing).
  const d = Math.min(
    editDistance(q, w, max),
    w.length > q.length ? editDistance(q, w.slice(0, q.length), max) : max + 1,
  );
  if (d <= max) return d === 1 ? 0.7 : 0.55;
  if (q.length >= 5 && w.length > q.length && w.includes(q)) return 0.5;
  return 0;
}

/** Field weights: title words outrank summary/topics, which outrank aliases. */
const WEIGHT = { title: 10, summary: 5, topic: 4, alias: 2 } as const;
type Field = keyof typeof WEIGHT;

export interface Indexed<T> {
  item: T;
  title: string;
  fields: [Field, string[]][];
}

/** Precomputes normalized fields for an entry list. */
export function buildIndex<T extends EntryBase>(
  entries: T[],
  topics: LibraryTopic[],
): Indexed<T>[] {
  const label = new Map(topics.map((t) => [t.id, t.label]));
  return entries.map((e) => {
    const uniq = (words: string[]) => Array.from(new Set(words));
    return {
      item: e,
      title: normalize(e.title),
      fields: [
        ["title", uniq(tokenize(e.title))],
        ["summary", uniq(tokenize(e.summary))],
        [
          "topic",
          uniq(
            [
              ...e.source_topics,
              ...e.topic_ids.map((t) => label.get(t) ?? t),
            ].flatMap(tokenize),
          ),
        ],
        ["alias", uniq(e.search_terms.flatMap(tokenize))],
      ],
    };
  });
}

function scoreWord(
  q: string,
  doc: Indexed<unknown>,
  memo: Map<string, number>,
): number {
  let best = 0;
  for (const [field, words] of doc.fields) {
    // One- and two-letter words only match the start of a title word.
    if (q.length < 3 && field !== "title") continue;
    const w = WEIGHT[field];
    if (w <= best) continue;
    for (const word of words) {
      let m = memo.get(word);
      if (m === undefined) memo.set(word, (m = wordMatch(q, word)));
      m *= w;
      if (m > best) best = m;
    }
  }
  return best;
}

/**
 * Entries matching `query`, best first (stable for ties). An empty query
 * returns the input order unchanged.
 */
export function search<T>(index: Indexed<T>[], query: string): T[] {
  const phrase = normalize(query);
  if (!phrase) return index.map((d) => d.item);
  const all = phrase.split(" ");
  const words = all.filter((w) => !STOPWORDS.has(w));
  const terms = words.length ? words : all;
  // Entries share most of their vocabulary; score each word once per term.
  const memos = terms.map(() => new Map<string, number>());
  const scored: { item: T; score: number; i: number }[] = [];
  index.forEach((doc, i) => {
    let score = 0;
    for (let t = 0; t < terms.length; t++) {
      const s = scoreWord(terms[t], doc, memos[t]);
      if (s === 0) return; // every significant word must match
      score += s;
    }
    if (doc.title === phrase) score += 100;
    else if (doc.title.startsWith(phrase)) score += 50;
    else if (` ${doc.title} `.includes(` ${phrase} `)) score += 25;
    scored.push({ item: doc.item, score, i });
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map((s) => s.item);
}
