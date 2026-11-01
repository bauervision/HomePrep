/*
 * Baseline review (LPI 0.7.0A Phase 9) and inventory evidence (Phase 10):
 * "Needs review" means an unacknowledged baseline change, never "incomplete",
 * and a linked item is evidence the household selected, not proof.
 */
import { describe, expect, it } from "vitest";
import { BASELINE_BY_ID, BASELINE_VERSION, defVersion } from "./baseline";
import {
  applyChange,
  confirm,
  createCustom,
  evaluateRequirement,
  linkItem,
  planAction,
  unlinkItem,
  type EvalContext,
} from "./checklist";
import {
  essentialRequirements,
  goalBaselineVersion,
  objectiveEssentials,
  OBJECTIVE_ESSENTIALS,
} from "./readiness";
import type {
  BaselineReviews,
  InventoryItem,
  MilestoneKey,
  RequirementState,
  Task,
} from "./types";

const TODAY = "2026-10-31";
const AT = "2026-10-31T10:00:00.000Z";
const item = (p: Partial<InventoryItem>): InventoryItem => ({
  id: "i",
  name: "Item",
  category: "Sanitation",
  quantity: 1,
  unit: "each",
  location: "",
  expiresOn: null,
  notes: "",
  ...p,
});
const TP = item({
  id: "tp",
  name: "Bulk TP",
  quantity: 240,
  unit: "roll",
});
const ctx = (items: InventoryItem[] = []): EvalContext => ({
  items,
  tasks: [],
  today: TODAY,
  quantity: {},
});
const apply = (
  state: RequirementState,
  id: string,
  ...changes: Parameters<typeof applyChange>[2][]
) => changes.reduce((s, c) => applyChange(s, id, c, AT), state);
const goal = (
  milestone: MilestoneKey,
  key: string,
  items: InventoryItem[],
  requirements: RequirementState = {},
  reviews?: BaselineReviews,
) =>
  objectiveEssentials(
    milestone,
    items,
    [],
    { memberCount: 2, requirements, reviews },
    TODAY,
  ).find((e) => e.key === key)!;
const ack = (key: string, version: number): BaselineReviews => ({
  [key]: { version, at: AT, by: "Alex" },
});
const def = (id: string) => BASELINE_BY_ID.get(id)!;

describe("baseline review", () => {
  it("flags a goal met under the earlier rule (legacy Met → Needs review)", () => {
    const e = goal("72h", "sanitation", [TP]);
    expect(e).toMatchObject({ met: false, status: "review" });
    expect(e.review).toMatchObject({
      key: "72h.sanitation",
      version: 2,
      acknowledged: 0,
    });
    expect(e.review!.why).toMatch(/you had recorded Sanitation items/);
    expect(e.review!.why).toMatch(/3 core requirements; 0 are done/);
    expect(e.review!.changes.map((c) => [c.id, c.kind])).toEqual([
      ["72h.sanitation.supplies", "added"],
      ["72h.sanitation.hygiene", "added"],
      ["72h.sanitation.toilet", "added"],
    ]);
    expect(planAction(e.checklist, e.status).label).toBe("Review Changes");
  });

  it("clears the warning on acknowledgment without completing anything", () => {
    const linked = apply({}, "72h.sanitation.supplies", linkItem("tp"));
    const e = goal("72h", "sanitation", [TP], linked, ack("72h.sanitation", 2));
    expect(e).toMatchObject({ met: false, status: "open" });
    expect(e.review).toBeUndefined();
    expect(e.reviewNote).toBeUndefined();
    // Incomplete requirements stay incomplete; the link is kept.
    expect(e.checklist.core).toEqual({ done: 0, applicable: 3 });
    expect(e.checklist.requirements[0]).toMatchObject({
      status: "needs-evidence",
      linked: [TP],
    });
    expect(planAction(e.checklist, e.status).label).toBe("Continue Plan");
  });

  it("asks again when a later baseline changes the goal", () => {
    // Acknowledged version 1; version 2 revised two requirements.
    const e = goal("72h", "sanitation", [TP], {}, ack("72h.sanitation", 1));
    expect(e.status).toBe("review");
    expect(e.review!.why).toMatch(/changed after you last reviewed them/);
    expect(e.review!.changes).toEqual([
      {
        id: "72h.sanitation.supplies",
        title: "Towelettes, garbage bags and plastic ties",
        kind: "changed",
        note: expect.stringMatching(/no longer completes this on its own/),
      },
      {
        id: "72h.sanitation.hygiene",
        title: "Soap, hand sanitizer and hygiene items",
        kind: "changed",
        note: expect.stringMatching(/no longer completes this on its own/),
      },
    ]);
    // A future version above the acknowledged one asks again.
    const reviews = ack("72h.sanitation", BASELINE_VERSION);
    expect(goal("72h", "sanitation", [TP], {}, reviews).status).toBe("open");
    const defs = essentialRequirements(
      "72h",
      OBJECTIVE_ESSENTIALS["72h"].find((d) => d.key === "sanitation")!,
    );
    expect(goalBaselineVersion(defs)).toBe(2);
    expect(
      goalBaselineVersion([
        ...defs,
        { ...defs[0], id: "future", since: BASELINE_VERSION + 1 },
      ]),
    ).toBe(BASELINE_VERSION + 1);
  });

  it("acknowledges per goal and per milestone", () => {
    const reviews = ack("72h.sanitation", 2);
    expect(goal("72h", "sanitation", [TP], {}, reviews).status).toBe("open");
    // Another goal met under the earlier rule still asks for its own review.
    const hygieneTask = {
      id: "t",
      seedKey: "7d:hygiene",
      status: "complete",
    } as Task;
    const hygiene = objectiveEssentials(
      "7d",
      [TP],
      [hygieneTask],
      { memberCount: 2, requirements: {}, reviews },
      TODAY,
    ).find((e) => e.key === "hygiene")!;
    expect(hygiene.status).toBe("review");
  });

  it("leaves never-met goals open and complete goals met", () => {
    expect(goal("72h", "sanitation", []).status).toBe("open");
    const done = [
      "72h.sanitation.supplies",
      "72h.sanitation.hygiene",
      "72h.sanitation.toilet",
    ].reduce(
      (s, id) => apply(s, id, confirm("Alex", AT)),
      {} as RequirementState,
    );
    expect(goal("72h", "sanitation", [TP], done)).toMatchObject({
      met: true,
      status: "met",
    });
  });

  it("keeps Water met by its quantity, with no review", () => {
    const water = item({
      id: "w",
      name: "Water",
      category: "Water",
      quantity: 6,
      unit: "gal",
    });
    // The quantity is Water's only core requirement: reaching it meets the
    // goal, so there is nothing to review.
    expect(goal("72h", "water", [water])).toMatchObject({
      met: true,
      status: "met",
    });
    const short = goal("72h", "water", [{ ...water, quantity: 2 }]);
    expect(short).toMatchObject({ met: false, status: "open" });
    expect(short.review).toBeUndefined();
  });

  it("versions every definition", () => {
    for (const d of BASELINE_BY_ID.values())
      expect(defVersion(d)).toBeLessThanOrEqual(BASELINE_VERSION);
  });
});

describe("inventory evidence", () => {
  it("does not let toilet paper satisfy garbage bags or soap", () => {
    for (const id of ["72h.sanitation.supplies", "72h.sanitation.hygiene"]) {
      const s = apply({}, id, linkItem("tp"));
      const r = evaluateRequirement(def(id), id, s[id], ctx([TP]));
      expect(r).toMatchObject({ status: "needs-evidence", satisfied: false });
      expect(r.reason).toMatch(/^Bulk TP linked\. Confirm you also have:/);
    }
    // The emergency toilet plan isn't completed by inventory at all.
    const toilet = def("72h.sanitation.toilet");
    expect(
      toilet.completion.conditions.some((c) => c.kind === "inventory"),
    ).toBe(false);
  });

  it("lets toilet paper support a household TP stockpile goal", () => {
    const s = applyChange(
      {},
      "custom-tp",
      createCustom({}, "72h", "sanitation", "TP stockpile", "", AT, {
        inventoryId: "tp",
      }),
      AT,
    );
    const r = evaluateRequirement(null, "custom-tp", s["custom-tp"], ctx([TP]));
    expect(r).toMatchObject({
      status: "evidence",
      satisfied: true,
      reason: "Bulk TP",
    });
    const e = goal("72h", "sanitation", [TP], s, ack("72h.sanitation", 2));
    expect(e.checklist.core).toEqual({ done: 1, applicable: 4 });
    expect(e.met).toBe(false);
  });

  it("distinguishes linked inventory from verified evidence", () => {
    const flashlight = item({
      id: "fl",
      name: "Flashlight",
      category: "Power",
    });
    const lighting = def("72h.power.lighting");
    const linked = apply({}, lighting.id, linkItem("fl"));
    expect(
      evaluateRequirement(
        lighting,
        lighting.id,
        linked[lighting.id],
        ctx([flashlight]),
      ),
    ).toMatchObject({ status: "linked", satisfied: false });
    // One kind of item, named by the requirement: the link supports it.
    const kit = item({ id: "kit", name: "First aid kit", category: "Medical" });
    const firstAid = def("72h.medical.first-aid");
    const s = apply({}, firstAid.id, linkItem("kit"));
    expect(
      evaluateRequirement(firstAid, firstAid.id, s[firstAid.id], ctx([kit])),
    ).toMatchObject({ status: "evidence", satisfied: true });
  });

  it("requires household confirmation for ambiguous evidence", () => {
    const id = "72h.sanitation.supplies";
    const s = apply({}, id, linkItem("tp"), confirm("Alex", AT));
    const r = evaluateRequirement(def(id), id, s[id], ctx([TP]));
    // Satisfied on the household's word, and labelled that way.
    expect(r).toMatchObject({ status: "confirmed", satisfied: true });
    expect(r.linked).toEqual([TP]);
  });

  it("evaluates combined requirements on every component", () => {
    const supplies = def("72h.sanitation.supplies");
    const inv = supplies.completion.conditions.find(
      (c) => c.kind === "inventory",
    );
    expect(inv).toMatchObject({
      covers: ["Moist towelettes", "Garbage bags", "Plastic ties"],
    });
    expect(inv).not.toHaveProperty("sufficient");
    const bags = item({ id: "bags", name: "Garbage bags" });
    const both = apply({}, supplies.id, linkItem("tp"), linkItem("bags"));
    // Even two linked items don't show all three components.
    expect(
      evaluateRequirement(
        supplies,
        supplies.id,
        both[supplies.id],
        ctx([TP, bags]),
      ).status,
    ).toBe("needs-evidence");
  });

  it("unlinks and relinks without losing other decisions", () => {
    const id = "72h.sanitation.supplies";
    const kit = item({ id: "kit", name: "Sanitation kit" });
    const s = apply({}, id, linkItem("tp"), confirm("Alex", AT));
    const unlinked = apply(s, id, unlinkItem("tp"));
    expect(unlinked[id]).toMatchObject({ confirmed: { by: "Alex" } });
    expect(unlinked[id].inventoryIds).toEqual([]);
    const relinked = apply(unlinked, id, linkItem("kit"));
    const r = evaluateRequirement(def(id), id, relinked[id], ctx([TP, kit]));
    expect(r.linked).toEqual([kit]);
    expect(r.status).toBe("confirmed");
    // Without confirmation, the replacement is still only linked.
    const fresh = apply({}, id, linkItem("kit"));
    expect(evaluateRequirement(def(id), id, fresh[id], ctx([kit])).status).toBe(
      "needs-evidence",
    );
  });

  it("agrees between the goal list and the goal detail", () => {
    const s = apply({}, "72h.sanitation.supplies", linkItem("tp"));
    const all = objectiveEssentials(
      "72h",
      [TP],
      [],
      { memberCount: 2, requirements: s },
      TODAY,
    );
    const one = goal("72h", "sanitation", [TP], s);
    const listed = all.find((e) => e.key === "sanitation")!;
    expect(listed.status).toBe(one.status);
    expect(listed.detail).toBe("0 / 3 done");
  });
});
