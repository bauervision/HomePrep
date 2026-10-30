"use client";

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, onSnapshot, type FirestoreError } from "firebase/firestore";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { auth, db, firebaseConfigured } from "@/lib/firebase";
import { seedHousehold } from "@/lib/seed";
import type { Household, Member } from "@/lib/types";

export type SessionState =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "signedOut" }
  | { status: "error"; user: User; message: string }
  | { status: "noHousehold"; user: User; notice: string | null }
  | {
      status: "ready";
      user: User;
      household: Household;
      member: Member;
      seedError: string | null;
    };

export interface SessionContextValue {
  state: SessionState;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

/** Exported for the development-only design preview (fixture sessions). */
export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

/** Only valid beneath the household gate in AppShell. */
export function useHousehold() {
  const { state } = useSession();
  if (state.status !== "ready") throw new Error("Household not loaded");
  return state;
}

const describe = (what: string, e: FirestoreError) =>
  `${what} failed (${e.code}): ${e.message}`;

// Each snapshot is tagged with the key it was loaded for, so stale results from a
// previous user or household are ignored without resetting state in effects.
interface Loaded<T> {
  key: string;
  value: T;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [pointer, setPointer] = useState<Loaded<string | null> | null>(null);
  const [member, setMember] = useState<Loaded<Member | null> | null>(null);
  const [household, setHousehold] = useState<Loaded<Household | null> | null>(
    null,
  );
  const [error, setError] = useState<Loaded<string> | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const seeded = useRef<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return onAuthStateChanged(auth(), (u) => {
      setUser(u);
      setError(null);
      setSeedError(null);
    });
  }, []);

  const uid = user?.uid ?? "";

  // users/{uid} → householdId. Only server-confirmed values are used: right after
  // creating or joining, the local (pending) write would otherwise trigger reads
  // that the server rejects until the batch has committed.
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db(), "users", uid),
      { includeMetadataChanges: true },
      (s) => {
        if (s.metadata.hasPendingWrites) return;
        setPointer({
          key: uid,
          value: s.exists() ? (s.data().householdId as string) : null,
        });
      },
      (e) => setError({ key: uid, value: describe("Loading your profile", e) }),
    );
  }, [uid]);

  const hid = pointer?.key === uid ? pointer.value : undefined;
  const hKey = `${uid}/${hid}`;

  // Own membership document (readable by its owner even when absent).
  useEffect(() => {
    if (!uid || !hid) return;
    const key = `${uid}/${hid}`;
    return onSnapshot(
      doc(db(), "households", hid, "members", uid),
      (s) =>
        setMember({ key, value: s.exists() ? (s.data() as Member) : null }),
      (e) => setError({ key: uid, value: describe("Checking membership", e) }),
    );
  }, [uid, hid]);

  const mine = member?.key === hKey ? member.value : undefined;
  const isMember = !!mine;

  // The household itself, only once membership is confirmed.
  useEffect(() => {
    if (!uid || !hid || !isMember) return;
    const key = `${uid}/${hid}`;
    return onSnapshot(
      doc(db(), "households", hid),
      (s) =>
        setHousehold({
          key,
          value: s.exists() ? ({ id: s.id, ...s.data() } as Household) : null,
        }),
      (e) => setError({ key: uid, value: describe("Loading household", e) }),
    );
  }, [uid, hid, isMember]);

  const home = household?.key === hKey ? household.value : undefined;

  // Seed the 72-hour task set once per household (idempotent, transactional).
  useEffect(() => {
    if (!home || home.seedVersion || seeded.current === home.id) return;
    seeded.current = home.id;
    seedHousehold(home.id).catch((e: FirestoreError) =>
      setSeedError(describe("Adding the starter 72-hour tasks", e)),
    );
  }, [home]);

  let state: SessionState;
  if (!firebaseConfigured) state = { status: "unconfigured" };
  else if (user === undefined) state = { status: "loading" };
  else if (user === null) state = { status: "signedOut" };
  else if (error?.key === uid)
    state = { status: "error", user, message: error.value };
  else if (hid === undefined) state = { status: "loading" };
  else if (hid === null) state = { status: "noHousehold", user, notice: null };
  else if (mine === undefined) state = { status: "loading" };
  else if (mine === null)
    state = {
      status: "noHousehold",
      user,
      notice:
        "You are no longer a member of your previous household. Create a new one or join with an invite.",
    };
  else if (home === undefined) state = { status: "loading" };
  else if (home === null)
    state = {
      status: "error",
      user,
      message: `Household ${hid} was not found.`,
    };
  else
    state = { status: "ready", user, household: home, member: mine, seedError };

  const value: SessionContextValue = {
    state,
    signIn: async () => {
      await signInWithPopup(auth(), new GoogleAuthProvider());
    },
    signOut: () => signOut(auth()),
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
