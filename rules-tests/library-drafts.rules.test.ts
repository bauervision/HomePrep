/*
 * Saving a Library draft under the existing (unchanged) rules, against the
 * local emulator (demo project). A draft task or goal carries the card's ID
 * (`libraryEntryId`) and is otherwise an ordinary household record: members
 * may save it, nobody else may. Run with `pnpm test:rules`.
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { readFileSync } from "node:fs";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const service = vi.hoisted(() => ({ database: null as unknown }));
vi.mock("../src/lib/firebase", () => ({ db: () => service.database }));
import { saveLibraryGoal } from "../src/lib/library-goals";
import {
  libraryDestination,
  LIBRARY_CATEGORIES,
} from "../src/lib/goal-destinations";
import type { LibraryCategoryId, MilestoneKey } from "../src/lib/types";
import { createLibraryTask } from "../src/lib/library-tasks";
import { DEFAULT_TASK_DRAFT } from "../src/lib/tasks";

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
const task = {
  title: "Agree on two meeting places",
  notes: "Steps:\n1. Choose at least two meeting places…",
  category: "Communications",
  milestone: "72h",
  priority: 2,
  status: "todo",
  libraryEntryId: "HP-C02",
};
const goal = {
  "requirementState.custom-abc123": {
    custom: {
      milestone: "72h",
      goal: "plan",
      title: "Arrange an accessible backup place to stay",
      explanation: "Done when: Record at least two destinations…",
      createdAt: "2026-11-04T12:00:00.000Z",
      libraryEntryId: "HP-H02",
    },
    notes: "From the HomePrep Library…",
    updatedAt: "2026-11-04T12:00:00.000Z",
  },
};

describe("Library drafts", () => {
  it("lets any member save a task drafted from a card", async () => {
    await assertSucceeds(
      addDoc(collection(db("bob"), "households/h1/tasks"), {
        ...task,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("lets any member save a goal drafted from a card", async () => {
    await assertSucceeds(updateDoc(doc(db("bob"), "households/h1"), goal));
  });

  it("denies other households and signed-out users", async () => {
    await assertFails(
      addDoc(collection(db("eve"), "households/h1/tasks"), task),
    );
    await assertFails(updateDoc(doc(db("eve"), "households/h1"), goal));
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(anon, "households/h1/tasks"), task));
    await assertFails(updateDoc(doc(anon, "households/h1"), goal));
  });

  it("keeps the usual task validation", async () => {
    await assertFails(
      addDoc(collection(db("bob"), "households/h1/tasks"), {
        ...task,
        title: "",
      }),
    );
  });
});

describe("Library task transaction against real emulator", () => {
  it("rejects identical simultaneous submissions from two authorized sessions", async () => {
    const draft = {
      ...DEFAULT_TASK_DRAFT,
      title: "Contact plan",
      notes: "Done when: every member has current contacts.",
    };
    service.database = db("alice");
    const first = createLibraryTask("h1", "HP-C01", draft);
    service.database = db("bob");
    const second = createLibraryTask("h1", "HP-C01", {
      ...draft,
      milestone: "30d",
      status: "complete",
      priority: 1,
    });
    const results = await Promise.allSettled([first, second]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const stored = await getDocs(
      collection(db("alice"), "households/h1/tasks"),
    );
    expect(stored.docs).toHaveLength(1);
    await createLibraryTask("h1", "HP-C01", {
      ...draft,
      notes: "Done when: school pickup contact has tested the alternate route.",
    });
    service.database = db("eve");
    await expect(createLibraryTask("h1", "HP-C01", draft)).rejects.toBeTruthy();
    expect(
      (await getDocs(collection(db("alice"), "households/h1/tasks"))).docs,
    ).toHaveLength(2);
  });
});

describe("Library household category destinations", () => {
  it("saves every category/milestone with existing member authorization, retries and reuses destinations", async () => {
    service.database = db("bob");
    const milestones: MilestoneKey[] = ["72h", "7d", "30d", "60d", "90d"];
    for (const category of Object.keys(
      LIBRARY_CATEGORIES,
    ) as LibraryCategoryId[]) {
      for (const milestone of milestones) {
        const id = "custom-" + category + "-" + milestone;
        await assertSucceeds(
          saveLibraryGoal(
            "h1",
            id,
            category,
            milestone,
            "Reviewed plan",
            "Observable outcome",
            { libraryEntryId: "HP-C04" },
          ),
        );
        await assertSucceeds(
          saveLibraryGoal(
            "h1",
            id,
            category,
            milestone,
            "Reviewed plan",
            "Observable outcome",
            { libraryEntryId: "HP-C04" },
          ),
        );
      }
    }
    const snapshot = await getDoc(doc(db("bob"), "households/h1"));
    expect(Object.keys(snapshot.data()!.requirementState)).toHaveLength(30);
    const dest = libraryDestination("shelter", "7d");
    expect(snapshot.data()!.goalDestinations[dest.storageKey]).toEqual({
      categoryId: "shelter",
      milestone: "7d",
    });
    expect(
      snapshot.data()!.requirementState["custom-shelter-7d"].confirmed,
    ).toBeUndefined();
    const before = snapshot.data();
    service.database = db("eve");
    await assertFails(
      saveLibraryGoal(
        "h1",
        "custom-foreign",
        "communications",
        "30d",
        "No access",
        "No access",
        { libraryEntryId: "HP-C04" },
      ),
    );
    service.database = env.unauthenticatedContext().firestore();
    await assertFails(
      saveLibraryGoal(
        "h1",
        "custom-anon",
        "shelter",
        "7d",
        "No access",
        "No access",
        { libraryEntryId: "HP-H02" },
      ),
    );
    expect((await getDoc(doc(db("bob"), "households/h1"))).data()).toEqual(
      before,
    );
  });

  it("creates one destination when two member sessions save distinct goals concurrently", async () => {
    service.database = db("alice");
    const first = saveLibraryGoal(
      "h1",
      "custom-concurrent-one",
      "shelter",
      "7d",
      "First backup place",
      "Accessible",
      { libraryEntryId: "HP-H02" },
    );
    service.database = db("bob");
    const second = saveLibraryGoal(
      "h1",
      "custom-concurrent-two",
      "shelter",
      "7d",
      "Second backup place",
      "Transport",
      { libraryEntryId: "HP-H02" },
    );
    await Promise.all([first, second]);
    const h = (await getDoc(doc(db("bob"), "households/h1"))).data()!;
    expect(Object.keys(h.goalDestinations)).toEqual(["7d:library-shelter"]);
    expect(Object.keys(h.requirementState)).toHaveLength(2);
  });
});
