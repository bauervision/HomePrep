"use client";

import { useEffect, useState } from "react";
import { LibraryDataError, parseGuidance } from "./validate";
import { LIBRARY_VERSION, type GuidancePack } from "./types";

/*
 * Loads the versioned static Library guidance. It is the only published
 * Library payload; book reviews stay in the private research archive.
 */

export const LIBRARY_BASE = `/library-data/v${LIBRARY_VERSION}/`;
export const GUIDANCE_URL = `${LIBRARY_BASE}guidance.json`;

export class LibraryLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryLoadError";
  }
}

/** Successfully parsed files, reused for the rest of the session. */
const cache = new Map<string, unknown>();

/** Test hook: forget loaded files. */
export function clearLibraryCache() {
  cache.clear();
}

export async function loadLibraryFile<T>(
  url: string,
  parse: (raw: unknown) => T,
  signal?: AbortSignal,
): Promise<T> {
  if (cache.has(url)) return cache.get(url) as T;
  const res = await fetch(url, { signal, credentials: "same-origin" });
  if (!res.ok) throw new LibraryLoadError(`The server answered ${res.status}.`);
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new LibraryDataError("The file is not valid JSON.");
  }
  const value = parse(raw);
  cache.set(url, value);
  return value;
}

export type Resource<T> =
  | { status: "idle"; data: null; error: null; retry: () => void }
  | { status: "loading"; data: null; error: null; retry: () => void }
  | { status: "error"; data: null; error: string; retry: () => void }
  | { status: "ready"; data: T; error: null; retry: () => void };

type Settled<T> = {
  key: string;
  attempt: number;
  result: { ok: true; data: T } | { ok: false; error: string };
};

/**
 * Loads `url` (null = not needed yet). The returned state always belongs to
 * the current `url`: a slow response for a previous URL is discarded.
 */
export function useLibraryFile<T>(
  url: string | null,
  parse: (raw: unknown) => T,
): Resource<T> {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    if (!url || cache.has(url)) return;
    const ctrl = new AbortController();
    loadLibraryFile(url, parse, ctrl.signal).then(
      (data) => {
        if (!ctrl.signal.aborted)
          setSettled({ key: url, attempt, result: { ok: true, data } });
      },
      (e: unknown) => {
        if (ctrl.signal.aborted) return;
        const error =
          e instanceof LibraryDataError
            ? `The Library data is not in the expected format. ${e.message}`
            : e instanceof LibraryLoadError
              ? `The Library data could not be loaded. ${e.message}`
              : "The Library data could not be loaded. Check your connection.";
        setSettled({ key: url, attempt, result: { ok: false, error } });
      },
    );
    return () => ctrl.abort();
  }, [url, parse, attempt]);

  const retry = () => setAttempt((n) => n + 1);
  if (!url) return { status: "idle", data: null, error: null, retry };
  if (cache.has(url))
    return { status: "ready", data: cache.get(url) as T, error: null, retry };
  if (settled?.key === url && settled.attempt === attempt) {
    const r = settled.result;
    return r.ok
      ? { status: "ready", data: r.data, error: null, retry }
      : { status: "error", data: null, error: r.error, retry };
  }
  return { status: "loading", data: null, error: null, retry };
}

export const useGuidance = (enabled = true) =>
  useLibraryFile<GuidancePack>(enabled ? GUIDANCE_URL : null, parseGuidance);
