import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "firebase/firestore",
  async () => (await import("@/test/fake-firestore")).firestoreModule,
);
vi.mock(
  "./firebase",
  async () => (await import("@/test/fake-firestore")).firebaseModule,
);

const { fakeDb } = await import("@/test/fake-firestore");
const {
  appliedTemplates,
  needsSeeding,
  seedHousehold,
  TASK_TEMPLATES,
  TEMPLATE_VERSIONS,
} = await import("./seed");

const H = "households/h1";
const tasks = (hid = "h1") => fakeDb.list(`households/${hid}/tasks`);
const byMilestone = (hid = "h1") =>
  tasks(hid).reduce<Record<string, number>>((acc, t) => {
    const m = (t as { milestone?: string }).milestone ?? "";
    acc[m] = (acc[m] ?? 0) + 1;
    return acc;
  }, {});

beforeEach(() => {
  fakeDb.reset();
  fakeDb.set(H, { name: "Home", ownerUid: "u1", householdSize: 5 });
});

describe("starter templates", () => {
  it("cover every milestone with stable, unique IDs and keys", () => {
    const ids = TASK_TEMPLATES.map((t) => t.id);
    const keys = TASK_TEMPLATES.map((t) => t.seedKey);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(keys).size).toBe(keys.length);
    for (const m of ["72h", "7d", "30d", "60d", "90d"]) {
      expect(
        TASK_TEMPLATES.filter((t) => t.milestone === m).length,
      ).toBeGreaterThanOrEqual(6);
    }
    // Original 72-hour IDs are unchanged.
    expect(ids).toContain("seed72-water");
    expect(ids).toContain("seed72-plan");
  });
});

describe("seedHousehold", () => {
  it("creates every milestone's starter tasks for a new household", async () => {
    const created = await seedHousehold("h1");
    expect(created).toHaveLength(TASK_TEMPLATES.length);
    expect(byMilestone()).toEqual({
      "72h": 6,
      "7d": 7,
      "30d": 7,
      "60d": 7,
      "90d": 7,
    });
    expect(fakeDb.get(H)).toMatchObject({
      seedTemplates: TEMPLATE_VERSIONS,
      seedVersion: 1,
    });
    const cooking = fakeDb.get(`${H}/tasks/seed7d-cooking`)!;
    expect(cooking).toMatchObject({
      milestone: "7d",
      status: "todo",
      seedKey: "7d:cooking",
      templateId: "seed7d-cooking",
      templateVersion: 1,
    });
    expect(cooking).not.toHaveProperty("dueDate");
    expect(needsSeeding(fakeDb.get(H)!)).toBe(false);
  });

  it("is idempotent across reloads", async () => {
    await seedHousehold("h1");
    expect(await seedHousehold("h1")).toEqual([]);
    expect(tasks()).toHaveLength(TASK_TEMPLATES.length);
  });

  it("never duplicates tasks when two devices initialize at once", async () => {
    await Promise.all([
      seedHousehold("h1"),
      seedHousehold("h1"),
      seedHousehold("h1"),
    ]);
    expect(tasks()).toHaveLength(TASK_TEMPLATES.length);
  });

  it("upgrades an existing household without touching its 72-hour tasks", async () => {
    // Legacy household: 72-hour set applied under the old marker.
    fakeDb.set(H, {
      name: "Home",
      ownerUid: "u1",
      householdSize: 5,
      seedVersion: 1,
    });
    fakeDb.set(`${H}/tasks/seed72-water`, {
      title: "Our own water goal (edited)",
      status: "complete",
      milestone: "72h",
      seedKey: "water",
      priority: 1,
    });
    fakeDb.set(`${H}/tasks/seed72-plan`, {
      title: "Family plan",
      status: "in_progress",
      milestone: "72h",
      seedKey: "plan",
      priority: 2,
    });
    // seed72-food etc. were deleted by the household.
    fakeDb.set(`${H}/tasks/mine`, {
      title: "Buy a tarp",
      status: "todo",
      milestone: "7d",
      priority: 3,
    });

    const created = await seedHousehold("h1");
    expect(created.some((id) => id.startsWith("seed72-"))).toBe(false);
    expect(created).toHaveLength(28);
    expect(fakeDb.get(`${H}/tasks/seed72-water`)).toMatchObject({
      title: "Our own water goal (edited)",
      status: "complete",
    });
    expect(fakeDb.get(`${H}/tasks/seed72-plan`)!.status).toBe("in_progress");
    expect(fakeDb.get(`${H}/tasks/seed72-food`)).toBeUndefined();
    expect(fakeDb.get(`${H}/tasks/mine`)!.title).toBe("Buy a tarp");
  });

  it("does not recreate starter tasks the household deleted", async () => {
    await seedHousehold("h1");
    fakeDb.remove(`${H}/tasks/seed30d-rotation`); // deleted by a member
    expect(await seedHousehold("h1")).toEqual([]);
    expect(fakeDb.get(`${H}/tasks/seed30d-rotation`)).toBeUndefined();
  });

  it("completes a partially initialized household without overwriting existing tasks", async () => {
    fakeDb.set(H, {
      name: "Home",
      ownerUid: "u1",
      householdSize: 5,
      seedVersion: 1,
      seedTemplates: { "72h": 1, "7d": 1 },
    });
    fakeDb.set(`${H}/tasks/seed30d-waste`, {
      title: "Waste plan (already started)",
      status: "in_progress",
      milestone: "30d",
      seedKey: "30d:waste",
      priority: 2,
    });
    const created = await seedHousehold("h1");
    expect(created.every((id) => /^seed(30d|60d|90d)-/.test(id))).toBe(true);
    expect(created).not.toContain("seed30d-waste");
    expect(fakeDb.get(`${H}/tasks/seed30d-waste`)!.title).toBe(
      "Waste plan (already started)",
    );
    expect(
      tasks().filter((t) => (t as { milestone?: string }).milestone === "7d"),
    ).toHaveLength(0);
  });

  it("writes only inside the given household and skips missing households", async () => {
    await seedHousehold("h1");
    expect(tasks("h2")).toHaveLength(0);
    expect(await seedHousehold("missing")).toEqual([]);
    expect(tasks("missing")).toHaveLength(0);
  });
});

describe("appliedTemplates", () => {
  it("treats the legacy marker as the 72-hour set", () => {
    expect(appliedTemplates({ seedVersion: 1 })).toEqual({
      "72h": 1,
      "7d": 0,
      "30d": 0,
      "60d": 0,
      "90d": 0,
    });
    expect(needsSeeding({ seedVersion: 1 })).toBe(true);
    expect(needsSeeding({ seedTemplates: { ...TEMPLATE_VERSIONS } })).toBe(
      false,
    );
  });
});
