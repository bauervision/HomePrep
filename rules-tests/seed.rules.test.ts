/*
 * Starter-template initialization under the existing (unchanged) rules,
 * against the local emulator (demo project). Run with `pnpm test:rules`.
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;
type TestDb = ReturnType<
  ReturnType<RulesTestEnvironment["unauthenticatedContext"]>["firestore"]
>;

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
    await setDoc(doc(db, "households/h1"), {
      name: "H1",
      ownerUid: "alice",
      householdSize: 5,
      seedVersion: 1,
    });
    await setDoc(doc(db, "households/h1/members/alice"), {
      uid: "alice",
      role: "owner",
    });
    await setDoc(doc(db, "households/h1/members/bob"), {
      uid: "bob",
      role: "member",
    });
    await setDoc(doc(db, "households/h2/members/eve"), {
      uid: "eve",
      role: "owner",
    });
  });
});

/** Same shape of transaction as lib/seed.ts seedHousehold(). */
const seed = (db: TestDb) =>
  runTransaction(db, async (tx) => {
    const h = doc(db, "households/h1");
    const t = doc(db, "households/h1/tasks/seed7d-cooking");
    await tx.get(h);
    await tx.get(t);
    tx.set(t, {
      title: "Establish an emergency cooking method",
      notes: "",
      category: "Safety",
      milestone: "7d",
      priority: 2,
      status: "todo",
      seedKey: "7d:cooking",
      templateId: "seed7d-cooking",
      templateVersion: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    tx.update(h, {
      seedTemplates: { "72h": 1, "7d": 1, "30d": 1, "60d": 1, "90d": 1 },
      seedVersion: 1,
    });
  });

describe("starter template initialization", () => {
  it("is allowed for any household member", async () => {
    await assertSucceeds(seed(env.authenticatedContext("bob").firestore()));
  });

  it("is denied to non-members and signed-out users", async () => {
    await assertFails(seed(env.authenticatedContext("eve").firestore()));
    await assertFails(seed(env.unauthenticatedContext().firestore()));
  });

  it("still cannot change the household owner while seeding", async () => {
    const db = env.authenticatedContext("bob").firestore();
    await assertFails(
      updateDoc(doc(db, "households/h1"), {
        seedTemplates: { "7d": 1 },
        ownerUid: "bob",
      }),
    );
  });
});
