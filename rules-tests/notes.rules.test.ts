/*
 * Firestore security-rules tests against the local emulator (demo project, no
 * production access). Run with `pnpm test:rules`.
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  collection,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

const note = (uid: string, extra: Record<string, unknown> = {}) => ({
  content: "Look into a rain barrel for garden water",
  createdBy: uid,
  createdByName: uid,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  linkedTaskIds: [],
  ...extra,
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-homeprep",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8085,
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const member = (hid: string, uid: string) =>
      setDoc(doc(db, "households", hid, "members", uid), {
        uid,
        role: "member",
      });
    await setDoc(doc(db, "households/h1"), {
      name: "H1",
      ownerUid: "alice",
      householdSize: 5,
    });
    await setDoc(doc(db, "households/h2"), {
      name: "H2",
      ownerUid: "eve",
      householdSize: 2,
    });
    await member("h1", "alice");
    await member("h1", "bob");
    await member("h2", "eve");
    await setDoc(doc(db, "households/h1/notes/n1"), {
      content: "Existing note",
      createdBy: "alice",
      createdByName: "alice",
      createdAt: Timestamp.fromMillis(1_700_000_000_000),
      updatedAt: Timestamp.fromMillis(1_700_000_000_000),
      linkedTaskIds: [],
    });
    await setDoc(doc(db, "households/h1/inventory/i1"), {
      name: "Water",
      quantity: 5,
    });
  });
});

describe("notes: household members", () => {
  it("can create a text-only note as themselves", async () => {
    await assertSucceeds(
      setDoc(doc(as("alice"), "households/h1/notes/new"), note("alice")),
    );
  });

  it("can read, list and edit notes written by another member", async () => {
    const bob = as("bob");
    await assertSucceeds(getDoc(doc(bob, "households/h1/notes/n1")));
    await assertSucceeds(getDocs(collection(bob, "households/h1/notes")));
    await assertSucceeds(
      updateDoc(doc(bob, "households/h1/notes/n1"), {
        content: "Edited by Bob",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("can link tasks without touching content or authorship", async () => {
    await assertSucceeds(
      updateDoc(doc(as("bob"), "households/h1/notes/n1"), {
        linkedTaskIds: ["t1", "t2"],
      }),
    );
  });

  it("can delete notes", async () => {
    await assertSucceeds(deleteDoc(doc(as("bob"), "households/h1/notes/n1")));
  });

  it("can create a task from a note and link it in one batch", async () => {
    const db = as("bob");
    const batch = writeBatch(db);
    batch.set(doc(db, "households/h1/tasks/t9"), {
      title: "Research rain barrels",
      notes: "Existing note",
      category: "Water",
      milestone: "72h",
      priority: 2,
      status: "todo",
      sourceNoteId: "n1",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, "households/h1/notes/n1"), { linkedTaskIds: ["t9"] });
    await assertSucceeds(batch.commit());
  });
});

describe("notes: validation and authorship", () => {
  const ref = () => doc(as("alice"), "households/h1/notes/bad");

  it("rejects empty or oversized content", async () => {
    await assertFails(setDoc(ref(), note("alice", { content: "" })));
    await assertFails(
      setDoc(ref(), note("alice", { content: "x".repeat(5001) })),
    );
  });

  it("rejects spoofed authors, client timestamps, pre-linked tasks and extra fields", async () => {
    await assertFails(setDoc(ref(), note("alice", { createdBy: "bob" })));
    await assertFails(
      setDoc(ref(), note("alice", { createdAt: Timestamp.fromMillis(0) })),
    );
    await assertFails(setDoc(ref(), note("alice", { linkedTaskIds: ["t1"] })));
    await assertFails(setDoc(ref(), note("alice", { pinned: true })));
  });

  it("keeps author and creation time immutable on update", async () => {
    const n1 = doc(as("bob"), "households/h1/notes/n1");
    await assertFails(updateDoc(n1, { createdBy: "bob" }));
    await assertFails(updateDoc(n1, { createdByName: "bob" }));
    await assertFails(updateDoc(n1, { createdAt: serverTimestamp() }));
    await assertFails(updateDoc(n1, { updatedAt: Timestamp.fromMillis(0) }));
    await assertFails(updateDoc(n1, { content: "   ".trim() }));
  });
});

describe("notes: isolation", () => {
  it("denies non-members of the household", async () => {
    const eve = as("eve");
    await assertFails(getDoc(doc(eve, "households/h1/notes/n1")));
    await assertFails(getDocs(collection(eve, "households/h1/notes")));
    await assertFails(setDoc(doc(eve, "households/h1/notes/x"), note("eve")));
    await assertFails(
      updateDoc(doc(eve, "households/h1/notes/n1"), { content: "hijack" }),
    );
    await assertFails(deleteDoc(doc(eve, "households/h1/notes/n1")));
  });

  it("denies signed-out access", async () => {
    await assertFails(getDoc(doc(anon(), "households/h1/notes/n1")));
    await assertFails(
      setDoc(doc(anon(), "households/h1/notes/x"), note("nobody")),
    );
  });

  it("still isolates existing household collections", async () => {
    const eve = as("eve");
    await assertFails(getDocs(collection(eve, "households/h1/inventory")));
    await assertFails(getDocs(collection(eve, "households/h1/tasks")));
    await assertFails(getDocs(collection(eve, "households/h1/purchases")));
    await assertSucceeds(
      getDocs(collection(as("bob"), "households/h1/inventory")),
    );
  });
});
