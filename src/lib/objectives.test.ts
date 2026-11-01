import { describe, expect, it } from "vitest";
import {
  categoryGuidance,
  DEFAULT_OBJECTIVE,
  MILESTONES,
  OBJECTIVE_ESSENTIALS,
  objectiveEssentials,
  objectiveStatuses,
  projectReadiness,
  targets,
} from "./readiness";
import { confirmedState } from "../test/requirement-state";
import { TASK_TEMPLATES } from "./seed";
import type { InventoryItem, MilestoneKey, Task } from "./types";

const TODAY = "2026-10-30";
let n = 0;
const item = (p: Partial<InventoryItem>): InventoryItem => ({
  id: `i${++n}`,
  name: "Item",
  category: "Water",
  quantity: 1,
  unit: "gal",
  location: "",
  expiresOn: null,
  notes: "",
  ...p,
});
const done = (seedKey: string, milestone: MilestoneKey = "72h"): Task => ({
  id: seedKey,
  title: seedKey,
  notes: "",
  category: "Water",
  milestone,
  priority: 2,
  status: "complete",
  seedKey,
});

describe("objective targets", () => {
  it("defaults to 72 hours", () => {
    expect(DEFAULT_OBJECTIVE).toBe("72h");
  });

  it("matches the five-person table", () => {
    expect(MILESTONES.map((m) => targets(5, m.days))).toEqual([
      { waterGal: 15, meals: 45 },
      { waterGal: 35, meals: 105 },
      { waterGal: 150, meals: 450 },
      { waterGal: 300, meals: 900 },
      { waterGal: 450, meals: 1350 },
    ]);
  });

  it("scales with household size", () => {
    expect(targets(2, 30)).toEqual({ waterGal: 60, meals: 180 });
    const water = objectiveEssentials("7d", [], [], 3, TODAY)[0];
    expect(water.detail).toBe("0 / 21 gal");
  });
});

describe("objective essentials", () => {
  it("defines water, food and qualitative essentials for every objective", () => {
    for (const m of MILESTONES) {
      const keys = OBJECTIVE_ESSENTIALS[m.key].map((e) => e.key);
      expect(keys.slice(0, 2)).toEqual(["water", "food"]);
      expect(keys.length).toBeGreaterThanOrEqual(7);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("references only starter tasks that exist", () => {
    const seedKeys = new Set(TASK_TEMPLATES.map((t) => t.seedKey));
    for (const defs of Object.values(OBJECTIVE_ESSENTIALS)) {
      for (const d of defs) {
        if (d.evidence.kind === "task")
          expect(seedKeys).toContain(d.evidence.seedKey);
      }
    }
  });

  it("verifies qualitative essentials through every core requirement", () => {
    const cooking = (
      tasks: Task[],
      plan: Parameters<typeof objectiveEssentials>[3] = 5,
    ) =>
      objectiveEssentials("7d", [], tasks, plan, TODAY).find(
        (e) => e.key === "cooking",
      )!;
    const method = (e: ReturnType<typeof cooking>) =>
      e.checklist.requirements.find((r) => r.id === "7d.cooking.method")!;

    const open = { ...done("7d:cooking", "7d"), status: "todo" as const };
    expect(cooking([open])).toMatchObject({ met: false, status: "open" });
    expect(method(cooking([open])).reason).toBe("Task open");
    expect(method(cooking([])).reason).toBe("No task");

    // The completed task supports one requirement, not the whole goal.
    const taskOnly = cooking([done("7d:cooking", "7d")]);
    expect(method(taskOnly).status).toBe("evidence");
    expect(taskOnly.met).toBe(false);
    expect(taskOnly.status).toBe("review");
    expect(taskOnly.reviewNote).toMatch(/its starter task was complete/);

    const confirmed = cooking([done("7d:cooking", "7d")], {
      memberCount: 5,
      requirements: confirmedState(["7d"]),
    });
    expect(confirmed).toMatchObject({ met: true, status: "met" });
  });
});

describe("objective statuses", () => {
  const stock = [
    item({ quantity: 40, unit: "gal" }),
    item({ category: "Food", quantity: 120, unit: "meals" }),
  ];

  it("uses the same cumulative inventory for every objective", () => {
    const s = objectiveStatuses(stock, [], 5, TODAY);
    expect(new Set(s.map((x) => x.waterGal))).toEqual(new Set([40]));
    expect(s.map((x) => x.waterTarget)).toEqual([15, 35, 150, 300, 450]);
    const water = s.map((x) => x.essentials[0].met);
    expect(water).toEqual([true, true, false, false, false]);
  });

  it("never completes an objective on water and food alone", () => {
    const s = objectiveStatuses(stock, [], 5, TODAY);
    expect(s[1].essentials.slice(0, 2).every((e) => e.met)).toBe(true);
    expect(s[1].complete).toBe(false);
  });

  it("requires every earlier objective to be complete", () => {
    const tasks7d = OBJECTIVE_ESSENTIALS["7d"]
      .filter((d) => d.evidence.kind === "task")
      .map((d) => done((d.evidence as { seedKey: string }).seedKey, "7d"));
    const plan7d = { memberCount: 5, requirements: confirmedState(["7d"]) };
    const s = objectiveStatuses(stock, tasks7d, plan7d, TODAY);
    expect(s[1].metCount).toBe(s[1].total); // all 7-day essentials met …
    expect(s[0].complete).toBe(false); // … but 72-hour supplies aren't recorded
    expect(s[1].earlierComplete).toBe(false);
    expect(s[1].complete).toBe(false);

    const full = [
      ...stock,
      item({ category: "Medical", unit: "kit" }),
      item({ category: "Power", unit: "each" }),
      item({ category: "Communications", unit: "each" }),
      item({ category: "Sanitation", unit: "kit" }),
    ];
    const both = {
      memberCount: 5,
      requirements: confirmedState(["72h", "7d"]),
    };
    // Recorded category items alone no longer complete 72 hours …
    expect(
      objectiveStatuses(full, [...tasks7d, done("plan")], 5, TODAY)[0].complete,
    ).toBe(false);
    // … every core requirement must be satisfied.
    const all = objectiveStatuses(
      full,
      [...tasks7d, done("plan")],
      both,
      TODAY,
    );
    expect(all[0].complete).toBe(true);
    expect(all[1].complete).toBe(true);
    expect(all[2].complete).toBe(false);
  });
});

describe("unit handling", () => {
  it("converts water units and ignores unsupported ones", () => {
    const s = objectiveStatuses(
      [
        item({ quantity: 10, unit: "gal" }),
        item({ quantity: 3.78541, unit: "L" }),
        item({ quantity: 128, unit: "fl oz" }),
        item({ name: "Water Barrel", quantity: 1, unit: "each" }),
        item({ quantity: 24, unit: "bottle" }),
      ],
      [],
      5,
      TODAY,
    );
    expect(s[0].waterGal).toBeCloseTo(12, 3);
  });

  it("converts person-days to meals", () => {
    const s = objectiveStatuses(
      [
        item({ category: "Food", quantity: 9, unit: "meals" }),
        item({ category: "Food", quantity: 2, unit: "person-days" }),
        item({ category: "Food", quantity: 4, unit: "can" }),
      ],
      [],
      5,
      TODAY,
    );
    expect(s[0].meals).toBe(15);
  });
});

describe("projectReadiness", () => {
  const base = [item({ id: "jugs", quantity: 8, unit: "gal" })];

  it("projects an addition against the objective", () => {
    const p = projectReadiness(
      base,
      null,
      { category: "Water", quantity: 2, unit: "gal", expiresOn: null },
      5,
      "72h",
      TODAY,
    )!;
    expect(p).toMatchObject({
      current: 8,
      projected: 10,
      change: 2,
      target: 15,
      percent: 67,
      remaining: 5,
    });
    expect(p.notCounted).toBeNull();
  });

  it("uses the selected objective's target", () => {
    const p = projectReadiness(
      base,
      null,
      { category: "Water", quantity: 2, unit: "gal", expiresOn: null },
      5,
      "30d",
      TODAY,
    )!;
    expect(p).toMatchObject({ target: 150, percent: 7, remaining: 140 });
  });

  it("replaces an edited item's contribution instead of double-counting", () => {
    const p = projectReadiness(
      base,
      "jugs",
      { category: "Water", quantity: 10, unit: "gal", expiresOn: null },
      5,
      "72h",
      TODAY,
    )!;
    expect(p).toMatchObject({ current: 8, projected: 10, change: 2 });
  });

  it("removes the old contribution when an edit makes the item not count", () => {
    const p = projectReadiness(
      base,
      "jugs",
      { category: "Water", quantity: 1, unit: "each", expiresOn: null },
      5,
      "72h",
      TODAY,
    )!;
    expect(p).toMatchObject({ projected: 0, change: -8, notCounted: "unit" });
  });

  it("does not count unsupported units or expired items", () => {
    const barrel = projectReadiness(
      base,
      null,
      { category: "Water", quantity: 1, unit: "each", expiresOn: null },
      5,
      "72h",
      TODAY,
    )!;
    expect(barrel).toMatchObject({
      projected: 8,
      change: 0,
      notCounted: "unit",
    });
    const old = projectReadiness(
      base,
      null,
      { category: "Water", quantity: 5, unit: "gal", expiresOn: "2020-01-01" },
      5,
      "72h",
      TODAY,
    )!;
    expect(old).toMatchObject({ projected: 8, notCounted: "expired" });
  });

  it("projects food with person-day conversion and caps the percentage", () => {
    const p = projectReadiness(
      [item({ category: "Food", quantity: 40, unit: "meals" })],
      null,
      { category: "Food", quantity: 5, unit: "person-days", expiresOn: null },
      5,
      "72h",
      TODAY,
    )!;
    expect(p).toMatchObject({
      kind: "food",
      projected: 55,
      target: 45,
      percent: 100,
      remaining: 0,
    });
  });

  it("has no numeric model for qualitative categories", () => {
    expect(
      projectReadiness(
        [],
        null,
        { category: "Medical", quantity: 1, unit: "kit", expiresOn: null },
        5,
        "72h",
        TODAY,
      ),
    ).toBeNull();
  });
});

describe("categoryGuidance", () => {
  it("gives objective-aware text without completeness claims", () => {
    const g = categoryGuidance("Medical", "30d")!;
    expect(g).toContain("first-aid");
    expect(g).toContain("30 days");
    expect(g).not.toMatch(/%|complete/i);
    for (const c of [
      "Power",
      "Communications",
      "Sanitation",
      "Safety",
      "Evacuation",
    ] as const) {
      expect(categoryGuidance(c, "7d")).toBeTruthy();
    }
    expect(categoryGuidance("Water", "7d")).toBeNull();
  });
});
