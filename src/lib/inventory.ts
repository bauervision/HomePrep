import {
  CATEGORIES,
  type Category,
  type InventoryItem,
  type Purchase,
} from "./types";

/** Editable inventory fields, shared by the Inventory page and Budget transfers. */
export type InventoryDraft = Pick<
  InventoryItem,
  "name" | "category" | "quantity" | "unit" | "location" | "expiresOn" | "notes"
>;

export const EMPTY_INVENTORY_DRAFT: InventoryDraft = {
  name: "",
  category: "Water",
  quantity: 1,
  unit: "gal",
  location: "",
  expiresOn: null,
  notes: "",
};

export function draftFromItem(item: InventoryItem): InventoryDraft {
  return {
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    location: item.location,
    expiresOn: item.expiresOn,
    notes: item.notes,
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
  return {
    name,
    category: d.category,
    quantity: d.quantity,
    unit: d.unit,
    location: d.location.trim(),
    expiresOn: d.expiresOn || null,
    notes: d.notes.trim(),
  };
}
