/*
 * Library browsing state: URL parameters, filters and facet counts. Pure
 * functions so they can be tested against the real data pack.
 */

import { search, type Indexed } from "./search";
import type { EntryBase, LibraryTopic } from "./types";

export interface LibraryParams {
  q: string;
  topic: string | null;
  entry: string | null;
  /**
   * The link was for the retired Book reviews collection (`view=reviews`,
   * `book`, `status`, or a book-review entry ID). It falls back to Guidance.
   */
  retiredReviews: boolean;
  /** Parameters present in the URL but not understood. */
  invalid: string[];
}

const ID = /^[A-Za-z0-9_:.-]{1,64}$/;
/** Book-review entry IDs, e.g. `B001-027`. Core cards use `HP-…`. */
const BOOK_ENTRY = /^B\d{3}-\d{3}$/;
/** Parameters of the retired Book reviews collection. */
export const RETIRED_PARAMS = ["view", "book", "status"] as const;

/** Reads Library state from a query string; bad values are ignored, not trusted. */
export function readParams(sp: URLSearchParams): LibraryParams {
  const invalid: string[] = [];
  const pick = (key: string, ok: (v: string) => boolean) => {
    const v = sp.get(key);
    if (v === null || v === "") return null;
    if (ok(v)) return v;
    invalid.push(key);
    return null;
  };
  const rawEntry = sp.get("entry");
  const bookEntry = !!rawEntry && BOOK_ENTRY.test(rawEntry);
  const retiredReviews =
    bookEntry ||
    sp.get("view") === "reviews" ||
    RETIRED_PARAMS.some((k) => k !== "view" && !!sp.get(k));
  const view = sp.get("view");
  if (view && view !== "guidance" && view !== "reviews") invalid.push("view");
  return {
    q: sp.get("q") ?? "",
    topic: pick("topic", (v) => ID.test(v)),
    entry: bookEntry ? null : pick("entry", (v) => ID.test(v)),
    retiredReviews,
    invalid,
  };
}

export interface Filters {
  topic: string | null;
}

const matches = (e: EntryBase, f: Filters, skip?: keyof Filters) =>
  skip === "topic" || !f.topic || e.topic_ids.includes(f.topic);

export interface Browse<T> {
  /** Filtered and ranked results; unique entries. */
  results: T[];
  /** Total entries in the collection. */
  total: number;
  /** Per-topic counts under the query (ignoring the topic filter). */
  topicCounts: Map<string, number>;
  /** Topics that have any entry in this collection. */
  topics: LibraryTopic[];
}

function countBy<T extends EntryBase, K>(
  items: T[],
  keys: (e: T) => K[],
): Map<K, number> {
  const m = new Map<K, number>();
  for (const e of items) for (const k of keys(e)) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

/**
 * Searches the whole collection, then applies the filter, so filtering and
 * ranking cover all loaded entries before any pagination. Topics without
 * entries (research-only topics) never get a pill; counts come from the data.
 */
export function browse<T extends EntryBase>(
  index: Indexed<T>[],
  topics: LibraryTopic[],
  query: string,
  f: Filters,
): Browse<T> {
  const matched = search(index, query);
  const present = new Set(index.flatMap((d) => d.item.topic_ids));
  return {
    results: matched.filter((e) => matches(e, f)),
    total: index.length,
    topicCounts: countBy(
      matched.filter((e) => matches(e, f, "topic")),
      (e) => e.topic_ids,
    ),
    topics: topics.filter((t) => present.has(t.id)),
  };
}

/** Cards per page. Guidance is small enough to show whole. */
export const PAGE_SIZE = 48;
