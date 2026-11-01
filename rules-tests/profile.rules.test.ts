/*
 * Household profile v1, custom targets and packaged inventory under the
 * existing (unchanged) rules, against the local emulator (demo project).
 * Run with `pnpm test:rules`.
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

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
    // A household created before profile v1: only a recorded total.
    await setDoc(doc(db, "households/h1"), {
      name: "H1",
      ownerUid: "alice",
      householdSize: 5,
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

const db = (uid: string) => env.authenticatedContext(uid).firestore();
const profile = {
  adults: 2,
  children: 3,
  householdSize: 5,
  pets: null,
  considerations: ["infants"],
  profileVersion: 1,
};

describe("household profile", () => {
  it("lets members save the profile with its derived total", async () => {
    await assertSucceeds(
      updateDoc(doc(db("bob"), "households/h1"), {
        ...profile,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("keeps the existing size bounds", async () => {
    await assertFails(
      updateDoc(doc(db("alice"), "households/h1"), {
        ...profile,
        adults: 20,
        children: 11,
        householdSize: 31,
      }),
    );
  });

  it("denies other households and signed-out users", async () => {
    await assertFails(
      updateDoc(doc(db("eve"), "households/h1"), { ...profile }),
    );
    await assertFails(getDoc(doc(db("eve"), "households/h1")));
    await assertFails(
      updateDoc(
        doc(env.unauthenticatedContext().firestore(), "households/h1"),
        { ...profile },
      ),
    );
  });

  // Since 0.7.0 households are founded only from an owner invitation
  // (registration.rules.test.ts); a bare founding batch is denied.
  it("denies founding a household without an invitation", async () => {
    const d = db("carol");
    const batch = writeBatch(d);
    batch.set(doc(d, "households/h3"), {
      name: "H3",
      ownerUid: "carol",
      ...profile,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(d, "households/h3/members/carol"), {
      uid: "carol",
      displayName: "Carol",
      email: "carol@example.test",
      photoURL: null,
      role: "owner",
      joinedAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });
});

describe("custom targets", () => {
  /** Same shape of transaction as lib/goals.ts saveTargetOverride(). */
  const save = (uid: string, overrides: unknown) => {
    const d = db(uid);
    return runTransaction(d, async (tx) => {
      const ref = doc(d, "households/h1");
      await tx.get(ref);
      tx.update(ref, {
        targetOverrides: overrides,
        updatedAt: serverTimestamp(),
      });
    });
  };

  it("lets members set and reset targets", async () => {
    await assertSucceeds(save("alice", { "72h": { water: 40 } }));
    await assertSucceeds(save("bob", {}));
  });

  it("denies non-members", async () => {
    await assertFails(save("eve", { "72h": { water: 40 } }));
  });
});

describe("packaged inventory", () => {
  it("accepts contents and readiness role on items", async () => {
    await assertSucceeds(
      setDoc(doc(db("bob"), "households/h1/inventory/case"), {
        name: "Bottled water",
        category: "Water",
        quantity: 8,
        unit: "case",
        contains: { amount: 40, unit: "pt" },
        readinessRole: "supply",
        location: "",
        expiresOn: null,
        notes: "",
      }),
    );
    await assertFails(
      setDoc(doc(db("eve"), "households/h1/inventory/x"), {
        name: "Intruder",
        quantity: 1,
      }),
    );
  });
});

describe("household requirements", () => {
  /** Same shape of transaction as lib/goals.ts updateRequirement(). */
  const save = (uid: string, hid: string, state: unknown) => {
    const d = db(uid);
    return runTransaction(d, async (tx) => {
      const ref = doc(d, `households/${hid}`);
      await tx.get(ref);
      tx.update(ref, {
        requirementState: state,
        updatedAt: serverTimestamp(),
      });
    });
  };
  const at = "2026-10-31T00:00:00.000Z";
  const state = {
    "72h.plan.meeting": { confirmed: { by: "Bob", at }, updatedAt: at },
    "72h.medical.power": {
      notApplicable: { reason: "None", by: "Bob", at },
      updatedAt: at,
    },
    "custom-abc123": {
      custom: {
        milestone: "72h",
        goal: "comms",
        title: "Charge radios",
        explanation: "",
        createdAt: at,
      },
      inventoryIds: ["radio"],
      updatedAt: at,
    },
  };

  it("lets members save household requirement decisions", async () => {
    await assertSucceeds(save("bob", "h1", state));
    await assertSucceeds(save("alice", "h1", {}));
  });

  it("isolates households", async () => {
    await assertFails(save("eve", "h1", state));
    await assertFails(save("alice", "h2", state));
  });
});
