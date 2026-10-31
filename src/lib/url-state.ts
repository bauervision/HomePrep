"use client";

import { useSyncExternalStore } from "react";

/*
 * URL-backed page state (filters, selected goal) for the static export.
 * Updates use the native History API, which Next.js integrates with its
 * router; back/forward fire `popstate`, so the URL stays the single source of
 * truth across refresh and browser navigation.
 */

const EVENT = "homeprep:url-change";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/** The current query string (empty during static prerender). */
export function useSearch(): URLSearchParams {
  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => "",
  );
  return new URLSearchParams(search);
}

/** Query string with `changes` applied (null/"" removes a key). */
export function withParams(
  search: string,
  changes: Record<string, string | null>,
): string {
  const p = new URLSearchParams(search);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === "") p.delete(k);
    else p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * Updates query parameters on the current page. `push` adds a history entry
 * (a navigation the user may go back from); otherwise the entry is replaced.
 */
export function setParams(
  changes: Record<string, string | null>,
  { push = false }: { push?: boolean } = {},
) {
  const url = `${window.location.pathname}${withParams(window.location.search, changes)}`;
  if (push) window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event(EVENT));
}
