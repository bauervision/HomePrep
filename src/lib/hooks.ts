"use client";

import {
  collection,
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
  data: T[];
  error: string | null;
}

/**
 * Live subscription to a collection path. Results are keyed by path so that a
 * path change reads as "loading" without resetting state inside the effect.
 */
export function useCollection<T extends { id: string }>(
  path: string[] | null,
  options: { orderBy?: string; direction?: "asc" | "desc" } = {},
) {
  const key = path
    ? `${path.join("/")}|${options.orderBy ?? ""}|${options.direction ?? ""}`
    : "";
  const [snap, setSnap] = useState<Snapshot<T> | null>(null);

  useEffect(() => {
    if (!key) return;
    const [p, ob, dir] = key.split("|");
    const constraints: QueryConstraint[] = ob
      ? [fsOrderBy(ob, (dir || "asc") as "asc" | "desc")]
      : [];
    const [first, ...rest] = p.split("/");
    const q = query(collection(db(), first, ...rest), ...constraints);
    return onSnapshot(
      q,
      (s) =>
        setSnap({
          key,
          data: s.docs.map(
            (d) => ({ id: d.id, ...(d.data() as DocumentData) }) as T,
          ),
          error: null,
        }),
      (err) => setSnap({ key, data: [], error: err.message }),
    );
  }, [key]);

  const current = snap?.key === key ? snap : null;
  return {
    data: current?.data ?? [],
    loading: !!key && !current,
    error: current?.error ?? null,
  };
}
