/*
 * Library browsing state: URL parameters, filters and facet counts. Pure
 * functions so they can be tested against the real data pack.
 */

import { statusFromParam } from "./format";
import { search, type Indexed } from "./search";
import type { DisplayStatus, EntryBase, LibraryTopic } from "./types";

export type Collection = "guidance" | "reviews";

export interface LibraryParams {
  view: Collection;
  q: string;
  topic: string | null;
  book: string | null;
  status: DisplayStatus | null;
  entry: string | null;
  /** Parameters present in the URL but not understood. */
  invalid: string[];
}

const ID = /^[A-Za-z0-9_:.-]{1,64}$/;

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
  const view = pick("view", (v) => v === "guidance" || v === "reviews");
  const status = pick("status", (v) => statusFromParam(v) !== null);
  return {
    view: view === "reviews" ? "reviews" : "guidance",
    q: sp.get("q") ?? "",
    topic: pick("topic", (v) => ID.test(v)),
    book: pick("book", (v) => ID.test(v)),
    status: statusFromParam(status),
    entry: pick("entry", (v) => ID.test(v)),
    invalid,
  };
}

export interface Filters {
  topic: string | null;
  book: string | null;
  status: DisplayStatus | null;
}

const matches = (e: EntryBase, f: Filters, skip?: keyof Filters) =>
  (skip === "topic" || !f.topic || e.topic_ids.includes(f.topic)) &&
  (skip === "book" || !f.book || e.source_id === f.book) &&
  (skip === "status" || !f.status || e.status === f.status);

export interface Browse<T> {
  /** Filtered and ranked results; unique entries. */
  results: T[];
  /** Total entries in the collection. */
  total: number;
  /** Per-facet counts under the query and the *other* active filters. */
  topicCounts: Map<string, number>;
  bookCounts: Map<string, number>;
  statusCounts: Map<DisplayStatus, number>;
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
 * Searches the whole collection, then applies every filter, so filtering and
 * ranking cover all loaded entries before any pagination.
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
    bookCounts: countBy(
      matched.filter((e) => matches(e, f, "book")),
      (e) => [e.source_id],
    ),
    statusCounts: countBy(
      matched.filter((e) => matches(e, f, "status")),
      (e) => [e.status],
    ),
    topics: topics.filter((t) => present.has(t.id)),
  };
}

export const PAGE_SIZE = 24;
