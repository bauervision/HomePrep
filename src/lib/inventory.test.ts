import { describe, expect, it } from "vitest";
import {
  countRecordsByCategory,
  draftFromPurchase,
  normalizeInventoryDraft,
} from "./inventory";
import { essentials72h } from "./readiness";
import type { InventoryItem, Purchase } from "./types";

const item = (p: Partial<InventoryItem>): InventoryItem => ({
  id: Math.random().toString(36).slice(2),
  name: "Item",
  category: "Water",
  quantity: 1,
  unit: "each",
  location: "",
  expiresOn: null,
  notes: "",
  ...p,
});

describe("countRecordsByCategory", () => {
  it("counts records, not quantities, volume or coverage", () => {
    const counts = countRecordsByCategory([
      item({ name: "Water Barrel", quantity: 1, unit: "each" }),
      item({ name: "Water jugs", quantity: 40, unit: "gal" }),
      item({ name: "Empty barrel", quantity: 0 }),
      item({ name: "Old water", expiresOn: "2020-01-01" }),
      item({ name: "Soup", category: "Food", quantity: 24, unit: "meals" }),
    ]);
    expect(counts.Water).toBe(4);
    expect(counts.Food).toBe(1);
    expect(counts.Medical).toBe(0);
    expect(Object.keys(counts)).toHaveLength(8);
  });
});

describe("readiness from inventory records", () => {
  const today = "2026-10-30";
  const water = (items: InventoryItem[]) =>
    essentials72h(items, [], 5, today)[0];

  it("an empty or non-volume water container does not satisfy potable water", () => {
    expect(
      water([item({ name: "Water Barrel", quantity: 1, unit: "each" })]).met,
    ).toBe(false);
    expect(
      water([item({ name: "Water Barrel", quantity: 0, unit: "gal" })]).met,
    ).toBe(false);
  });

  it("qualifying gallons do", () => {
    expect(water([item({ quantity: 15, unit: "gal" })]).met).toBe(true);
  });
});

describe("inventory drafts", () => {
  it("prefills from a purchase and validates like the rules", () => {
    const d = draftFromPurchase({
      name: " Water Barrel ",
      category: "Water",
      quantity: 1,
      unit: "each",
    } as Purchase);
    expect(normalizeInventoryDraft(d).name).toBe("Water Barrel");
    expect(() => normalizeInventoryDraft({ ...d, name: "" })).toThrow();
    expect(() =>
      normalizeInventoryDraft({ ...d, quantity: Number.NaN }),
    ).toThrow();
  });
});
