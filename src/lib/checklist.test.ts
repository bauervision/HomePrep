import { describe, expect, it } from "vitest";
import { confirmedState } from "../test/requirement-state";
import {
  BASELINE,
  BASELINE_BY_ID,
  baselineFor,
  SOURCES,
  type RequirementDef,
} from "./baseline";
import {
  applyChange,
  confirm,
  createCustom,
  customizeText,
  editCustom,
  evaluateGoal,
  evaluateRequirement,
  linkItem,
  isDismissable,
  markNotApplicable,
  planAction,
  removeCustom,
  resetText,
  restoreApplicable,
  setNotes,
  unconfirm,
  unlinkItem,
  type EvalContext,
} from "./checklist";
import {
  goalCategory,
  MILESTONES,
  OBJECTIVE_ESSENTIALS,
  objectiveEssentials,
} from "./readiness";
import type { InventoryItem, RequirementState, Task } from "./types";

const TODAY = "2026-10-31";
const AT = "2026-10-31T10:00:00.000Z";
let n = 0;
const item = (p: Partial<InventoryItem>): InventoryItem => ({
  id: `i${++n}`,
  name: "Item",
  category: "Water",
  quantity: 1,
  unit: "each",
  location: "",
  expiresOn: null,
  notes: "",
  ...p,
});
const ctx = (p: Partial<EvalContext> = {}): EvalContext => ({
  items: [],
  tasks: [],
  today: TODAY,
  quantity: {},
  ...p,
});
const def = (id: string) => BASELINE_BY_ID.get(id)!;
const apply = (
  state: RequirementState | undefined,
  id: string,
  ...changes: Parameters<typeof applyChange>[2][]
) => changes.reduce((s, c) => applyChange(s, id, c, AT), state ?? {});
const essential = (
  milestone: Parameters<typeof objectiveEssentials>[0],
  key: string,
  items: InventoryItem[],
  requirements?: RequirementState,
  tasks: Task[] = [],
  memberCount = 5,
) =>
  objectiveEssentials(
    milestone,
    items,
    tasks,
    { memberCount, requirements },
    TODAY,
  ).find((e) => e.key === key)!;

describe("baseline catalog", () => {
  it("has unique, stable IDs and valid sources", () => {
    const ids = BASELINE.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of BASELINE) {
      for (const s of d.sources) expect(SOURCES[s]).toBeTruthy();
      // Only unverified requirements may lack a source.
      if (d.evidence !== "unverified")
        expect(d.sources.length).toBeGreaterThan(0);
      expect(d.title.length).toBeLessThanOrEqual(120);
    }
    for (const s of Object.values(SOURCES)) {
      expect(s.url).toMatch(/^https:\/\/www\.(ready|cdc)\.gov\//);
      expect(s.reviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("gives every 72-hour and 7-day goal researched requirements", () => {
    for (const m of ["72h", "7d"] as const) {
      for (const g of OBJECTIVE_ESSENTIALS[m]) {
        const defs = baselineFor(m, g.key);
        expect(defs.some((d) => d.level === "core")).toBe(true);
        expect(defs.every((d) => d.evidence !== "unverified")).toBe(true);
      }
    }
  });

  it("applies requirements by milestone", () => {
    expect(baselineFor("72h", "medical").map((d) => d.id)).toEqual([
      "72h.medical.first-aid",
      "72h.medical.medications",
      "72h.medical.info",
      "72h.medical.power",
    ]);
    expect(baselineFor("7d", "medical")).toEqual([]);
    expect(baselineFor("30d", "cooking")).toEqual([]);
    for (const m of MILESTONES) {
      expect(baselineFor(m.key, "water").map((d) => d.id)).toContain(
        "water.storage",
      );
    }
  });

  it("keeps quantitative targets only for water and food", () => {
    const q = BASELINE.filter((d) =>
      d.completion.conditions.some((c) => c.kind === "quantity"),
    );
    expect(q.map((d) => d.id)).toEqual(["water.supply", "food.supply"]);
  });

  it("warns against indoor fuel-burning cooking", () => {
    const d = def("7d.cooking.outdoors");
    expect(d.explanation).toMatch(/Never use charcoal grills, camp stoves/);
    expect(d.appliesIf).toBeUndefined(); // safety guidance can't be dismissed
    expect(d.sources).toContain("cdcCo");
  });

  it("gives later milestones their starter task, marked unverified", () => {
    const e = essential("30d", "treatment", []);
    expect(e.checklist.requirements).toHaveLength(1);
    expect(e.checklist.requirements[0].def).toMatchObject({
      id: "30d.treatment.task",
      evidence: "unverified",
      sources: [],
    });
  });
});

describe("requirement evaluation", () => {
  it("records household attestation as confirmed, not evidence", () => {
    const d = def("72h.medical.info");
    const state = apply({}, d.id, confirm("Alex", AT));
    const r = evaluateRequirement(d, d.id, state[d.id], ctx());
    expect(r).toMatchObject({ status: "confirmed", satisfied: true });
    expect(state[d.id].confirmed).toEqual({ by: "Alex", at: AT });
    const off = apply(state, d.id, unconfirm);
    expect(off[d.id]).toBeUndefined(); // empty system records are pruned
  });

  it("uses only explicitly linked, in-stock inventory as evidence", () => {
    const d = def("72h.medical.first-aid");
    const kit = item({ id: "kit", category: "Medical", unit: "kit" });
    // A Medical item that is not linked is only a suggestion.
    expect(
      evaluateRequirement(d, d.id, undefined, ctx({ items: [kit] })).status,
    ).toBe("not-started");
    const linked = apply({}, d.id, linkItem("kit"));
    expect(
      evaluateRequirement(d, d.id, linked[d.id], ctx({ items: [kit] })),
    ).toMatchObject({ status: "evidence", reason: "Item" });
    // Used up, expired, or deleted → needs review.
    const empty = { ...kit, quantity: 0 };
    const expired = { ...kit, expiresOn: "2026-01-01" };
    for (const items of [[empty], [expired], []]) {
      expect(
        evaluateRequirement(d, d.id, linked[d.id], ctx({ items })).status,
      ).toBe("needs-review");
    }
    expect(apply(linked, d.id, unlinkItem("kit"))[d.id]).toBeUndefined();
  });

  it("uses existing task completion state", () => {
    const d = def("72h.plan.evacuation");
    const t = (status: Task["status"]) =>
      ({ id: "t", seedKey: "plan", status }) as Task;
    const at = (status: Task["status"]) =>
      evaluateRequirement(d, d.id, undefined, ctx({ tasks: [t(status)] }))
        .status;
    expect(at("todo")).toBe("not-started");
    expect(at("in_progress")).toBe("in-progress");
    expect(at("complete")).toBe("evidence");
  });

  it("evaluates every mandatory condition of a combined requirement", () => {
    const combined: RequirementDef = {
      ...def("72h.medical.first-aid"),
      id: "test.combined",
      completion: {
        mode: "all",
        conditions: [
          { kind: "inventory", category: "Medical" },
          { kind: "task", seedKey: "medical" },
          { kind: "attest" },
        ],
      },
    };
    const kit = item({ id: "k", category: "Medical" });
    const done = { id: "t", seedKey: "medical", status: "complete" } as Task;
    const linked = apply({}, combined.id, linkItem("k"));
    const evalWith = (state: RequirementState, tasks: Task[]) =>
      evaluateRequirement(
        combined,
        combined.id,
        state[combined.id],
        ctx({ items: [kit], tasks }),
      );
    expect(evalWith({}, []).status).toBe("not-started");
    expect(evalWith(linked, []).status).toBe("in-progress");
    expect(evalWith(linked, [done]).status).toBe("in-progress");
    const all = apply(linked, combined.id, confirm("A", AT));
    // Satisfied, but only as strong as its weakest condition.
    expect(evalWith(all, [done]).status).toBe("confirmed");
  });
});

describe("household customization", () => {
  it("creates, edits and deletes a custom requirement with a stable ID", () => {
    const id = "custom-abc";
    let s = apply(
      {},
      id,
      createCustom({}, "72h", "medical", "  Spare   glasses ", "", AT),
    );
    expect(s[id].custom).toMatchObject({
      milestone: "72h",
      goal: "medical",
      title: "Spare glasses",
    });
    const before = essential("72h", "medical", [], s);
    const custom = before.checklist.requirements.at(-1)!;
    expect(custom).toMatchObject({ id, custom: true, counted: true });
    expect(custom.def.evidence).toBe("household");
    expect(before.checklist.core.applicable).toBe(5); // 4 system + custom

    s = apply(s, id, editCustom("Spare glasses and case", "In the car"));
    expect(s[id].custom).toMatchObject({
      title: "Spare glasses and case",
      explanation: "In the car",
      createdAt: AT,
    });
    s = apply(s, id, removeCustom);
    expect(s[id]).toBeUndefined();
    expect(() => createCustom({}, "72h", "medical", "  ", "", AT)).toThrow();
  });

  it("customizes a recommendation, keeps the original, and resets", () => {
    const d = def("72h.plan.meeting");
    const s = apply(
      {},
      d.id,
      customizeText(d, "Meet at Grandma’s house", d.explanation),
    );
    expect(s[d.id].text).toEqual({ title: "Meet at Grandma’s house" });
    const r = evaluateRequirement(d, d.id, s[d.id], ctx());
    expect(r).toMatchObject({ customized: true });
    expect(r.def.title).toBe("Meet at Grandma’s house");
    expect(r.original!.title).toBe("Household meeting place");
    // The global definition is never mutated.
    expect(def(d.id).title).toBe("Household meeting place");
    expect(apply(s, d.id, resetText)[d.id]).toBeUndefined();
  });

  it("excludes conditional requirements marked not applicable, and restores them", () => {
    const d = def("72h.medical.power");
    const s = apply({}, d.id, markNotApplicable(" No devices ", "A", AT));
    expect(s[d.id].notApplicable).toEqual({
      reason: "No devices",
      by: "A",
      at: AT,
    });
    const r = evaluateRequirement(d, d.id, s[d.id], ctx());
    expect(r).toMatchObject({
      status: "not-applicable",
      counted: false,
      satisfied: false,
    });
    expect(
      evaluateRequirement(
        d,
        d.id,
        apply(s, d.id, restoreApplicable)[d.id],
        ctx(),
      ).status,
    ).toBe("not-started");
  });

  it("never lets dismissing core guidance complete a goal", () => {
    const state = confirmedState(["72h"]);
    delete state["72h.medical.info"];
    const dismissed = apply(
      state,
      "72h.medical.info",
      markNotApplicable("", "A", AT),
    );
    const e = essential("72h", "medical", [], dismissed);
    const r = e.checklist.requirements.find(
      (x) => x.id === "72h.medical.info",
    )!;
    expect(r).toMatchObject({ status: "needs-review", counted: true });
    expect(e.met).toBe(false);
    expect(e.status).toBe("review");
    expect(e.checklist.core).toEqual({ done: 3, applicable: 4 });
  });

  it("tracks applicability separately from completion", () => {
    const d = def("7d.meds.storage");
    const s = apply({}, d.id, confirm("A", AT), markNotApplicable("", "A", AT));
    expect(s[d.id].confirmed).toBeTruthy();
    expect(evaluateRequirement(d, d.id, s[d.id], ctx()).status).toBe(
      "not-applicable",
    );
    const back = apply(s, d.id, restoreApplicable);
    expect(evaluateRequirement(d, d.id, back[d.id], ctx()).status).toBe(
      "confirmed",
    );
  });
});

describe("goal completion", () => {
  it("counts completed / applicable core requirements without weighting", () => {
    const at = AT;
    const s: RequirementState = {
      "72h.plan.meeting": { confirmed: { by: "A", at }, updatedAt: at },
    };
    const e = essential("72h", "plan", [], s);
    expect(e.checklist.core).toEqual({ done: 1, applicable: 4 });
    expect(e.checklist.supporting).toEqual({ done: 0, applicable: 2 });
    expect(e.detail).toBe("1 / 4 done");
    expect(e.need).toBe("Shelter plan and evacuation route");
  });

  it("does not complete sanitation from 240 rolls of toilet paper", () => {
    const tp = item({
      id: "tp",
      name: "Toilet paper",
      category: "Sanitation",
      quantity: 30,
      unit: "pack",
      contains: { amount: 8, unit: "roll" },
    });
    const e = essential("72h", "sanitation", [tp]);
    expect(e.met).toBe(false);
    expect(e.status).toBe("review"); // met the earlier any-item rule
    // Even linked, it supports one requirement only.
    const linked = apply({}, "72h.sanitation.hygiene", linkItem("tp"));
    const after = essential("72h", "sanitation", [tp], linked);
    expect(after.met).toBe(false);
    expect(after.checklist.core).toEqual({ done: 1, applicable: 3 });
  });

  it("does not treat a first aid kit as medication continuity", () => {
    const kit = item({ id: "kit", category: "Medical", unit: "kit" });
    const s = apply({}, "72h.medical.first-aid", linkItem("kit"));
    const e = essential("72h", "medical", [kit], s);
    const meds = e.checklist.requirements.find(
      (r) => r.id === "72h.medical.medications",
    )!;
    expect(meds.status).toBe("not-started");
    expect(e.met).toBe(false);
  });

  it("does not treat a flashlight as backup charging", () => {
    const light = item({ id: "fl", name: "Flashlight", category: "Power" });
    const s = apply({}, "72h.power.lighting", linkItem("fl"));
    expect(essential("72h", "power", [light], s).met).toBe(false);
    const charging = essential("7d", "charging", [light], s);
    expect(charging.met).toBe(false);
    expect(charging.checklist.core.done).toBe(0);
  });

  it("completes a goal when every applicable core requirement is satisfied", () => {
    const s = confirmedState(["72h"]);
    const e = essential("72h", "medical", [], s);
    expect(e).toMatchObject({ met: true, status: "met" });
    expect(e.checklist.confirmedOnly).toBe(4);
  });

  it.each([
    [3, 9, 27],
    [5, 15, 45],
    [9, 27, 81],
  ])(
    "keeps water and food quantitative for %i people",
    (people, gal, meals) => {
      const stock = [
        item({ quantity: gal, unit: "gal" }),
        item({ category: "Food", quantity: meals, unit: "meals" }),
      ];
      const short = [
        item({ quantity: gal - 1, unit: "gal" }),
        item({ category: "Food", quantity: meals - 1, unit: "meals" }),
      ];
      for (const key of ["water", "food"]) {
        const met = essential("72h", key, stock, undefined, [], people);
        expect(met).toMatchObject({
          met: true,
          status: "met",
          target: key === "water" ? gal : meals,
        });
        // Supporting considerations are tracked but never block the target.
        expect(met.checklist.supporting.done).toBe(0);
        expect(essential("72h", key, short, undefined, [], people).met).toBe(
          false,
        );
      }
    },
  );

  it("flags a water goal for review when a household requirement is open", () => {
    const s = apply(
      {},
      "custom-1",
      createCustom({}, "72h", "water", "Rotate the barrel", "", AT),
    );
    const e = essential(
      "72h",
      "water",
      [item({ quantity: 20, unit: "gal" })],
      s,
    );
    expect(e).toMatchObject({ met: false, status: "review" });
  });
});

describe("goal evaluation input", () => {
  it("only counts custom requirements for their own milestone and goal", () => {
    const s = apply(
      {},
      "custom-x",
      createCustom({}, "7d", "comms", "Ham radio license", "", AT),
    );
    const c72 = evaluateGoal(
      baselineFor("72h", "comms"),
      "72h",
      "comms",
      s,
      ctx(),
    );
    const c7 = evaluateGoal(
      baselineFor("7d", "comms"),
      "7d",
      "comms",
      s,
      ctx(),
    );
    expect(c72.requirements.some((r) => r.custom)).toBe(false);
    expect(c7.requirements.some((r) => r.id === "custom-x")).toBe(true);
  });
});

describe("safety guidance", () => {
  it("can't be dismissed or reworded", () => {
    for (const id of ["7d.cooking.outdoors", "7d.cooking.co-alarm"]) {
      const d = def(id);
      expect(d.safety).toBe(true);
      expect(isDismissable(d, false)).toBe(false);
      expect(() => customizeText(d, "Indoors is fine", "")).toThrow();
      // Stored wording (e.g. written by an older client) is ignored.
      const r = evaluateRequirement(
        d,
        d.id,
        { text: { title: "Indoors is fine" }, updatedAt: AT },
        ctx(),
      );
      expect(r.def.title).toBe(d.title);
      expect(r.customized).toBe(false);
    }
  });
});

describe("household goals linked to tasks", () => {
  const cooking = { id: "t1", seedKey: undefined, status: "todo" } as Task;
  const create = (method: "confirm" | "task") =>
    apply(
      {},
      "custom-t",
      createCustom({}, "7d", "cooking", "Practice", "", AT, {
        method,
        taskId: "t1",
        notes: " Saturday ",
      }),
    );

  it("completes a task-method goal only through its task", () => {
    const s = create("task");
    expect(s["custom-t"]).toMatchObject({
      custom: { taskId: "t1", method: "task" },
      notes: "Saturday",
    });
    const at = (status: Task["status"], state = s) =>
      evaluateRequirement(
        null,
        "custom-t",
        state["custom-t"],
        ctx({ tasks: [{ ...cooking, status }] }),
      ).status;
    expect(at("todo")).toBe("not-started");
    expect(at("complete")).toBe("evidence");
    // Confirming can't bypass the task.
    const confirmed = apply(s, "custom-t", confirm("A", AT));
    expect(at("todo", confirmed)).toBe("not-started");
    // A deleted task is flagged, not silently treated as done.
    expect(
      evaluateRequirement(null, "custom-t", s["custom-t"], ctx()).status,
    ).toBe("needs-review");
  });

  it("lets a confirm-method goal be confirmed or completed by its task", () => {
    const s = create("confirm");
    expect(s["custom-t"].custom).not.toHaveProperty("method");
    const done = { ...cooking, status: "complete" as const };
    expect(
      evaluateRequirement(
        null,
        "custom-t",
        s["custom-t"],
        ctx({ tasks: [done] }),
      ).status,
    ).toBe("evidence");
    const c = apply(s, "custom-t", confirm("A", AT));
    expect(
      evaluateRequirement(null, "custom-t", c["custom-t"], ctx()).status,
    ).toBe("confirmed");
  });

  it("requires a task for the task method and keeps links on edit", () => {
    expect(() =>
      createCustom({}, "7d", "cooking", "X", "", AT, { method: "task" }),
    ).toThrow(/Choose the task/);
    let s = apply(
      {},
      "custom-i",
      createCustom({}, "72h", "comms", "Radios", "", AT, {
        inventoryId: "kit",
      }),
    );
    expect(s["custom-i"].inventoryIds).toEqual(["kit"]);
    s = apply(s, "custom-i", editCustom("Radios", "", { notes: "" }));
    expect(s["custom-i"].inventoryIds).toEqual(["kit"]);
    expect(s["custom-i"]).not.toHaveProperty("notes");
  });

  it("keeps notes on a system recommendation until cleared", () => {
    const s = apply({}, "72h.plan.meeting", setNotes("Library steps"));
    expect(s["72h.plan.meeting"].notes).toBe("Library steps");
    expect(
      apply(s, "72h.plan.meeting", setNotes("  "))["72h.plan.meeting"],
    ).toBeUndefined();
  });
});

describe("plan action", () => {
  it("starts, continues, reviews and flags", () => {
    const start = essential("7d", "cooking", []);
    expect(planAction(start.checklist, start.status)).toEqual({
      kind: "start",
      label: "Start Plan",
      targetId: "7d.cooking.no-cook",
    });
    const s = apply({}, "7d.cooking.no-cook", confirm("A", AT));
    const cont = essential("7d", "cooking", [], s);
    expect(planAction(cont.checklist, cont.status)).toMatchObject({
      label: "Continue Plan",
      targetId: "7d.cooking.method",
    });
    const all = confirmedState(["7d"]);
    const done = essential("7d", "cooking", [], all);
    expect(planAction(done.checklist, done.status)).toEqual({
      kind: "review",
      label: "Review Plan",
      targetId: null,
    });
    const tp = item({ category: "Sanitation" });
    const flagged = essential("72h", "sanitation", [tp]);
    expect(planAction(flagged.checklist, flagged.status)).toMatchObject({
      label: "Review Requirements",
      targetId: "72h.sanitation.supplies",
    });
  });
});

describe("goal inventory category", () => {
  it("uses the goal's category, else its requirements' mapping", () => {
    const cat = (m: Parameters<typeof essential>[0], k: string) =>
      goalCategory(essential(m, k, []));
    expect(cat("72h", "sanitation")).toBe("Sanitation");
    expect(cat("72h", "water")).toBe("Water");
    expect(cat("7d", "cooking")).toBe("Safety");
    expect(cat("7d", "hygiene")).toBe("Sanitation");
    expect(cat("7d", "charging")).toBe("Power");
    // Planning-only goals have no inventory actions.
    expect(cat("72h", "plan")).toBeUndefined();
    expect(cat("7d", "meds")).toBeUndefined();
  });
});
