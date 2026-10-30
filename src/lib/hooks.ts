"use client";

import {
  collection,
  limit as fsLimit,
  onSnapshot,
  orderBy as fsOrderBy,
  query,
  type DocumentData,
  type QueryConstraint,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "./firebase";

interface Snapshot<T> {
  key: string;
  base: string;
  data: T[];
  error: string | null;
}

/**
 * Live subscription to a collection path. Results are keyed by path so that a
 * path change reads as "loading" without resetting state inside the effect.
 * With `limit`, raising the limit ("load more") keeps showing the current rows
 * until the larger page arrives.
 */
export function useCollection<T extends { id: string }>(
  path: string[] | null,
  options: {
    orderBy?: string;
    direction?: "asc" | "desc";
    limit?: number;
  } = {},
) {
  const base = path
    ? `${path.join("/")}|${options.orderBy ?? ""}|${options.direction ?? ""}`
    : "";
  const key = base ? `${base}|${options.limit ?? ""}` : "";
  const [snap, setSnap] = useState<Snapshot<T> | null>(null);

  useEffect(() => {
    if (!key) return;
    const [p, ob, dir, lim] = key.split("|");
    const constraints: QueryConstraint[] = ob
      ? [fsOrderBy(ob, (dir || "asc") as "asc" | "desc")]
      : [];
    if (lim) constraints.push(fsLimit(Number(lim)));
    const [first, ...rest] = p.split("/");
    const q = query(collection(db(), first, ...rest), ...constraints);
    return onSnapshot(
      q,
      (s) =>
        setSnap({
          key,
          base: key.split("|").slice(0, 3).join("|"),
          data: s.docs.map(
            (d) => ({ id: d.id, ...(d.data() as DocumentData) }) as T,
          ),
          error: null,
        }),
      (err) =>
        setSnap({
          key,
          base: key.split("|").slice(0, 3).join("|"),
          data: [],
          error: err.message,
        }),
    );
  }, [key]);

  const current = snap?.key === key ? snap : null;
  const previousPage = !current && snap?.base === base ? snap : null;
  const data = current?.data ?? previousPage?.data ?? [];
  return {
    data,
    loading: !!key && !current && !previousPage,
    loadingMore: !!previousPage,
    /** True when a limited query filled its page, so more may exist. */
    hasMore: options.limit != null && data.length >= options.limit,
    error: current?.error ?? null,
  };
}
