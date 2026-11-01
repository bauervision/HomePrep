import { describe, expect, it } from "vitest";
import {
  classifyItem,
  describeQuantity,
  looksLikeWaterEquipment,
  toGallons,
  totalQuantity,
} from "./quantities";
import {
  essentials72h,
  foodMeals,
  projectReadiness,
  readinessFeedback,
  waterGallons,
} from "./readiness";
import type { InventoryItem } from "./types";

const TODAY = "2026-10-31";

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

describe("US volume conversions", () => {
  it("converts gallons, quarts, pints, fluid ounces and liters exactly", () => {
    expect(toGallons(1, "gal")).toBe(1);
    expect(toGallons(4, "qt")).toBe(1);
    expect(toGallons(8, "pt")).toBe(1);
    expect(toGallons(128, "fl oz")).toBe(1);
    expect(toGallons(3.785411784, "L")).toBeCloseTo(1, 12);
    expect(toGallons(1, "each")).toBeNull();
  });

  it("does not round before summing", () => {
    // 3 × 16.9 fl oz bottles = 50.7 fl oz = 0.39609375 gal
    const r = waterGallons(
      [
        item({
          quantity: 3,
          unit: "bottle",
          contains: { amount: 16.9, unit: "fl oz" },
        }),
      ],
      TODAY,
    );
    expect(r.amount).toBeCloseTo(0.39609375, 12);
  });
});

describe("acceptance fixtures", () => {
  const jugs = item({ name: "1-gallon jugs", quantity: 26, unit: "gal" });
  const cases = item({
    name: "Bottled water",
    quantity: 8,
    unit: "case",
    contains: { amount: 40, unit: "pt" },
  });
  const straw = item({
    name: "Water straw",
    quantity: 2,
    unit: "each",
    readinessRole: "equipment",
  });
  const tp = item({
    name: "Toilet paper",
    category: "Sanitation",
    quantity: 30,
    unit: "pack",
    contains: { amount: 8, unit: "roll" },
  });

  it("totals 66 US gallons of stored water", () => {
    const r = waterGallons([jugs, cases, straw, tp], TODAY);
    expect(r.amount).toBe(66);
    expect(r.counted.map((c) => c.amount)).toEqual([26, 40]);
    expect(r.unmeasured).toEqual([]);
    expect(r.equipment).toEqual([straw]);
  });

  it("totals 240 rolls of toilet paper without changing the pack count", () => {
    expect(totalQuantity(tp)).toEqual({ amount: 240, unit: "roll" });
    expect(tp.quantity).toBe(30);
    expect(describeQuantity(tp)).toBe("30 pack × 8 roll = 240 roll");
  });

  it("meets the 72-hour water target for five people", () => {
    const water = essentials72h([jugs, cases, straw], [], 5, TODAY)[0];
    expect(water).toMatchObject({ met: true, current: 66, target: 15 });
  });
});

describe("classification", () => {
  it("excludes water-treatment equipment from stored water", () => {
    expect(
      classifyItem(item({ unit: "each", readinessRole: "equipment" }), TODAY),
    ).toEqual({ kind: "equipment", measure: "water" });
  });

  it("explains unconvertible water and food instead of guessing", () => {
    const straw = item({ name: "Water Straw", quantity: 1, unit: "each" });
    const cans = item({ category: "Food", quantity: 12, unit: "can" });
    const w = classifyItem(straw, TODAY);
    const f = classifyItem(cans, TODAY);
    expect(w).toMatchObject({ kind: "unconvertible", measure: "water" });
    expect(f).toMatchObject({ kind: "unconvertible", measure: "food" });
    expect(w.kind === "unconvertible" && w.fix).toMatch(/equipment/);
    expect(looksLikeWaterEquipment(straw.name)).toBe(true);
    expect(looksLikeWaterEquipment("Water jugs")).toBe(false);
  });

  it("counts packaged food only when meals per package are recorded", () => {
    const cans = item({ category: "Food", quantity: 12, unit: "can" });
    expect(foodMeals([cans], TODAY).amount).toBe(0);
    const counted = { ...cans, contains: { amount: 2, unit: "meals" } };
    expect(foodMeals([counted], TODAY).amount).toBe(24);
  });

  it("derives warnings from the same pass as the totals", () => {
    const items = [
      item({ quantity: 10 }),
      item({ name: "Straw", unit: "each" }),
      item({ quantity: 5, expiresOn: "2026-01-01" }),
      item({ quantity: 0 }),
    ];
    const r = waterGallons(items, TODAY);
    expect(r.amount).toBe(10);
    expect(r.unmeasured.map((i) => i.name)).toEqual(["Straw"]);
  });

  it("ignores contents with a non-positive amount", () => {
    expect(
      totalQuantity({
        quantity: 3,
        unit: "gal",
        contains: { amount: 0, unit: "pt" },
      }),
    ).toEqual({ amount: 3, unit: "gal" });
  });
});

describe("projection and feedback", () => {
  const plan = { memberCount: 5 };

  it("projects packaged water and flags equipment as not counted", () => {
    const p = projectReadiness(
      [],
      null,
      {
        category: "Water",
        quantity: 8,
        unit: "case",
        expiresOn: null,
        contains: { amount: 40, unit: "pt" },
      },
      plan,
      "72h",
      TODAY,
    );
    expect(p).toMatchObject({ projected: 40, target: 15, notCounted: null });
    const straw = projectReadiness(
      [],
      null,
      {
        category: "Water",
        quantity: 1,
        unit: "each",
        expiresOn: null,
        readinessRole: "equipment",
      },
      plan,
      "72h",
      TODAY,
    );
    expect(straw?.notCounted).toBe("equipment");
  });

  it("confirms a newly reached target once", () => {
    const before = [item({ id: "a", quantity: 26 })];
    const after = [
      ...before,
      item({
        id: "b",
        quantity: 8,
        unit: "case",
        contains: { amount: 40, unit: "pt" },
      }),
    ];
    const fb = readinessFeedback(
      before,
      after,
      [],
      { memberCount: 5 },
      "72h",
      TODAY,
    );
    expect(fb).toEqual([]); // 26 gal already met 15: no repeat confirmation

    const fromEmpty = readinessFeedback(
      [],
      after,
      [],
      { memberCount: 5 },
      "72h",
      TODAY,
    );
    expect(fromEmpty).toEqual([
      {
        tone: "met",
        text: "72-hour water target reached. 66 gallons recorded; 15 gallons required.",
      },
    ]);
  });

  it("reports the remaining quantity while a target is incomplete", () => {
    const after = [item({ category: "Food", quantity: 40, unit: "meals" })];
    expect(readinessFeedback([], after, [], plan, "72h", TODAY)).toEqual([
      {
        tone: "progress",
        text: "72-hour food: 40 of 45 meals recorded — 5 meals remaining.",
      },
    ]);
  });

  it("says nothing for an unchanged save or an uncountable item", () => {
    const same = [item({ id: "a", quantity: 20 })];
    expect(readinessFeedback(same, [...same], [], plan, "72h", TODAY)).toEqual(
      [],
    );
    const straw = [item({ unit: "each" })];
    expect(readinessFeedback([], straw, [], plan, "72h", TODAY)).toEqual([]);
  });

  it("confirms a capability essential the first time it is met", () => {
    const kit = [item({ id: "kit", category: "Medical", unit: "kit" })];
    // Recording a kit alone does not complete the essential.
    expect(readinessFeedback([], kit, [], plan, "72h", TODAY)).toEqual([]);
    const at = "2026-10-30T00:00:00.000Z";
    const linked = {
      ...plan,
      requirements: {
        "72h.medical.first-aid": { inventoryIds: ["kit"], updatedAt: at },
        "72h.medical.medications": {
          confirmed: { by: "A", at },
          updatedAt: at,
        },
        "72h.medical.info": { confirmed: { by: "A", at }, updatedAt: at },
        "72h.medical.power": {
          notApplicable: { reason: "", by: "A", at },
          updatedAt: at,
        },
      },
    };
    expect(readinessFeedback([], kit, [], linked, "72h", TODAY)).toEqual([
      { tone: "met", text: "72-hour medical & first aid essential met." },
    ]);
  });
});
