import type { ItemContents, ReadinessRole } from "./quantities";
import {
  CATEGORIES,
  UNITS,
  type Category,
  type InventoryItem,
  type Purchase,
} from "./types";

/** Editable inventory fields, shared by the Inventory page and Budget transfers. */
export type InventoryDraft = Pick<
  InventoryItem,
  "name" | "category" | "quantity" | "unit" | "location" | "expiresOn" | "notes"
> & {
  contains: ItemContents | null;
  readinessRole: ReadinessRole;
};

/** Unit a new item starts with in each category (always editable). */
export const DEFAULT_UNIT: Record<Category, string> = {
  Water: "gal",
  Food: "meals",
  Medical: "each",
  Power: "each",
  Sanitation: "each",
  Communications: "each",
  Safety: "each",
  Evacuation: "each",
};

export const EMPTY_INVENTORY_DRAFT: InventoryDraft = {
  name: "",
  category: "Water",
  quantity: 1,
  unit: "gal",
  location: "",
  expiresOn: null,
  notes: "",
  contains: null,
  readinessRole: "supply",
};

/** A new-item draft preset to a category (from a category deep link). */
export function emptyDraftFor(category: Category = "Water"): InventoryDraft {
  return { ...EMPTY_INVENTORY_DRAFT, category, unit: DEFAULT_UNIT[category] };
}

/**
 * Changes a draft's category. A new item still on the previous category's
 * default unit follows the new category's default; anything else is kept.
 */
export function withCategory(
  d: InventoryDraft,
  category: Category,
  isNew: boolean,
): InventoryDraft {
  const unit =
    isNew && d.unit === DEFAULT_UNIT[d.category]
      ? DEFAULT_UNIT[category]
      : d.unit;
  return { ...d, category, unit };
}

export function draftFromItem(item: InventoryItem): InventoryDraft {
  return {
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    location: item.location,
    expiresOn: item.expiresOn,
    notes: item.notes,
    contains: item.contains ?? null,
    readinessRole: item.readinessRole ?? "supply",
  };
}

/** Prefill an inventory record from an acquired purchase (user confirms/edits). */
export function draftFromPurchase(p: Purchase): InventoryDraft {
  return {
    name: p.name,
    category: p.category,
    quantity: p.quantity,
    unit: p.unit,
    location: "",
    expiresOn: null,
    notes: "",
    contains: null,
    readinessRole: "supply",
  };
}

/**
 * Validates and normalizes an inventory draft. Mirrors the Firestore rule
 * (name 1–120 chars, numeric quantity ≥ 0) so errors surface before writing.
 */
export function normalizeInventoryDraft(d: InventoryDraft): InventoryDraft {
  const name = d.name.trim();
  if (!name) throw new Error("Name is required.");
  if (name.length > 120)
    throw new Error("Name must be 120 characters or fewer.");
  if (!Number.isFinite(d.quantity) || d.quantity < 0) {
    throw new Error("Quantity must be zero or more.");
  }
  if (!CATEGORIES.includes(d.category as Category))
    throw new Error("Choose a category.");
  if (d.expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(d.expiresOn)) {
    throw new Error("Expiration must be a valid date.");
  }
  const c = d.contains;
  if (
    c &&
    (!Number.isFinite(c.amount) ||
      c.amount <= 0 ||
      !(UNITS as readonly string[]).includes(c.unit))
  ) {
    throw new Error("Contents per unit must be a positive amount and unit.");
  }
  return {
    name,
    category: d.category,
    quantity: d.quantity,
    unit: d.unit,
    location: d.location.trim(),
    expiresOn: d.expiresOn || null,
    notes: d.notes.trim(),
    contains: c ? { amount: c.amount, unit: c.unit } : null,
    readinessRole: d.readinessRole === "equipment" ? "equipment" : "supply",
  };
}

/**
 * Number of inventory RECORDS per category (not quantities, volumes or
 * coverage). Every saved record counts, including empty or expired ones;
 * readiness applies its own qualifying rules separately.
 */
export function countRecordsByCategory(
  items: Pick<InventoryItem, "category">[],
) {
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<
    Category,
    number
  >;
  for (const i of items) if (i.category in counts) counts[i.category]++;
  return counts;
}

/** A canonical category from untrusted input (e.g. a URL), else null. */
export function parseCategory(v: string | null | undefined): Category | null {
  return CATEGORIES.find((c) => c === v) ?? null;
}
