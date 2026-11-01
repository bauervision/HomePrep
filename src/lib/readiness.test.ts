import { describe, expect, it } from "vitest";
import {
  daysOfSupply,
  essentials72h,
  foodMeals,
  milestoneStatus,
  targets,
  waterGallons,
} from "./readiness";
import type { InventoryItem, Task } from "./types";

const TODAY = "2026-10-29";

function item(p: Partial<InventoryItem>): InventoryItem {
  return {
    id: Math.random().toString(36).slice(2),
    name: "x",
    category: "Water",
    quantity: 1,
    unit: "gal",
    location: "",
    expiresOn: null,
    notes: "",
    ...p,
  };
}

describe("targets", () => {
  it("matches the 72-hour, five-person baseline", () => {
    expect(targets(5, 3)).toEqual({ waterGal: 15, meals: 45 });
  });
});

describe("waterGallons", () => {
  it("converts units and excludes expired and unconvertible items", () => {
    const r = waterGallons(
      [
        item({ quantity: 10, unit: "gal" }),
        item({ quantity: 128, unit: "fl oz" }),
        item({ quantity: 5, unit: "gal", expiresOn: "2026-10-01" }),
        item({ quantity: 24, unit: "bottle" }),
        item({ quantity: 3, unit: "gal", category: "Food" }),
      ],
      TODAY,
    );
    expect(r.amount).toBeCloseTo(11);
    expect(r.unmeasured).toHaveLength(1);
  });
});

describe("foodMeals", () => {
  it("counts meals and person-days", () => {
    const r = foodMeals(
      [
        item({ category: "Food", quantity: 12, unit: "meals" }),
        item({ category: "Food", quantity: 5, unit: "person-days" }),
      ],
      TODAY,
    );
    expect(r.amount).toBe(27);
  });
});

describe("essentials72h", () => {
  it("reports nothing met for an empty household", () => {
    const e = essentials72h([], [], 5, TODAY);
    expect(e.every((x) => !x.met)).toBe(true);
    expect(e.find((x) => x.key === "water")?.detail).toBe("0 / 15 gal");
  });

  it("marks essentials met only from recorded data", () => {
    const items = [
      item({ quantity: 15 }),
      item({ category: "Food", quantity: 45, unit: "meals" }),
      item({ category: "Medical", unit: "kit" }),
      item({ category: "Power", quantity: 0, unit: "each" }),
    ];
    const tasks = [{ seedKey: "plan", status: "complete" } as Task];
    const status = Object.fromEntries(
      essentials72h(items, tasks, 5, TODAY).map((x) => [x.key, x.status]),
    );
    expect(status).toEqual({
      water: "met",
      food: "met",
      // A kit or a completed plan task met the earlier rule; the current
      // baseline has more core requirements, so these need review.
      medical: "review",
      power: "open", // zero quantity does not count
      comms: "open",
      sanitation: "open",
      plan: "review",
    });
  });
});

describe("milestones", () => {
  it("evaluates longer milestones on water and food", () => {
    const items = [
      item({ quantity: 40 }),
      item({ category: "Food", quantity: 120, unit: "meals" }),
    ];
    const met = milestoneStatus(items, 5, TODAY).map((m) => m.met);
    expect(met).toEqual([true, true, false, false, false]);
    expect(daysOfSupply(items, 5, TODAY)?.overall).toBe(8);
  });
});
