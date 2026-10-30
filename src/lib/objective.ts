"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_OBJECTIVE, isMilestoneKey } from "./readiness";
import type { MilestoneKey } from "./types";

/*
 * Active readiness objective: a personal VIEWING preference, not household
 * data. It is stored per user and per household on this device (no Firestore
 * writes), so exploring 30 days never changes what other members see. The
 * small store interface below can later be backed by a per-user Firestore
 * document without changing callers.
 */

export interface ObjectivePreferenceStore {
  read(uid: string, householdId: string): MilestoneKey;
  write(uid: string, householdId: string, objective: MilestoneKey): void;
  subscribe(onChange: () => void): () => void;
}

const CHANGE_EVENT = "homeprep:objective-change";

export const objectiveStorageKey = (uid: string, householdId: string) =>
  `homeprep:objective:${uid}:${householdId}`;

export const localObjectiveStore: ObjectivePreferenceStore = {
  read(uid, householdId) {
    try {
      const v = window.localStorage.getItem(
        objectiveStorageKey(uid, householdId),
      );
      return isMilestoneKey(v) ? v : DEFAULT_OBJECTIVE;
    } catch {
      return DEFAULT_OBJECTIVE;
    }
  },
  write(uid, householdId, objective) {
    try {
      window.localStorage.setItem(
        objectiveStorageKey(uid, householdId),
        objective,
      );
    } catch {
      // Storage unavailable (private mode); the choice simply won't persist.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  },
  subscribe(onChange) {
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onChange); // other tabs
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  },
};

/** The current user's selected objective for a household (default 72 hours). */
export function useObjective(
  uid: string,
  householdId: string,
  store: ObjectivePreferenceStore = localObjectiveStore,
): [MilestoneKey, (objective: MilestoneKey) => void] {
  const objective = useSyncExternalStore(
    store.subscribe,
    () => store.read(uid, householdId),
    () => DEFAULT_OBJECTIVE,
  );
  const setObjective = useCallback(
    (next: MilestoneKey) => store.write(uid, householdId, next),
    [store, uid, householdId],
  );
  return [objective, setObjective];
}
