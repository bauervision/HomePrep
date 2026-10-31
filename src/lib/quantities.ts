import type { InventoryItem } from "./types";

/*
 * Inventory quantities
 * --------------------
 * An item records `quantity` of `unit`. Packaged goods may also record what one
 * unit contains (`contains`), e.g. 8 "case" each containing 40 "pt", or 30
 * "pack" each containing 8 "roll". The package count stays in `quantity`; the
 * contained total is derived here and never stored, so nothing is counted
 * twice.
 *
 * Readiness counts Water as stored volume (US gallons) and Food as
 * meal-equivalents. Anything that cannot be converted safely is excluded from
 * numeric totals and reported with a reason the user can act on.
 */

/** Exact US liquid conversions to gallons (1 US gal = 3.785411784 L). */
export const US_GALLONS_PER: Record<string, number> = {
  gal: 1,
  qt: 1 / 4,
  pt: 1 / 8,
  "fl oz": 1 / 128,
  L: 1 / 3.785411784,
};

export const MEALS_PER: Record<string, number> = {
  meals: 1,
  "person-days": 3,
};

export const VOLUME_UNITS = Object.keys(US_GALLONS_PER);
export const MEAL_UNITS = Object.keys(MEALS_PER);

export type ReadinessRole = "supply" | "equipment";

export interface ItemContents {
  /** Amount contained in ONE unit of the item (e.g. 40 per case). */
  amount: number;
  unit: string;
}

type Quantified = Pick<InventoryItem, "quantity" | "unit"> & {
  contains?: ItemContents | null;
};

/** Total recorded amount in its most specific unit (contents when packaged). */
export function totalQuantity(item: Quantified): {
  amount: number;
  unit: string;
} {
  const c = item.contains;
  if (c && Number.isFinite(c.amount) && c.amount > 0 && c.unit) {
    return { amount: item.quantity * c.amount, unit: c.unit };
  }
  return { amount: item.quantity, unit: item.unit };
}

/** Converts a volume to US gallons, or null when the unit is not a volume. */
export function toGallons(amount: number, unit: string): number | null {
  const f = US_GALLONS_PER[unit];
  return f === undefined ? null : amount * f;
}

/** Converts to meal-equivalents, or null when the unit is not a meal measure. */
export function toMeals(amount: number, unit: string): number | null {
  const f = MEALS_PER[unit];
  return f === undefined ? null : amount * f;
}

export type Measure = "water" | "food";

export type ItemClassification =
  /** Counts toward the measure; `amount` is gallons or meals. */
  | { kind: "counted"; measure: Measure; amount: number }
  /** Water-treatment or cooking equipment: a capability, not stored supply. */
  | { kind: "equipment"; measure: Measure }
  /** A supply whose amount cannot be converted safely. */
  | { kind: "unconvertible"; measure: Measure; fix: string }
  | { kind: "expired"; measure: Measure }
  | { kind: "empty"; measure: Measure }
  /** Categories without a numeric readiness model. */
  | { kind: "not-measured" };

type Classifiable = Pick<
  InventoryItem,
  "category" | "quantity" | "unit" | "expiresOn"
> & {
  contains?: ItemContents | null;
  readinessRole?: ReadinessRole;
};

export function isExpired(
  item: Pick<InventoryItem, "expiresOn">,
  today: string,
) {
  return !!item.expiresOn && item.expiresOn < today;
}

const WATER_FIX =
  "Record its volume (gal, qt, pt, fl oz or L), set the volume each unit contains, or mark it as water-treatment equipment.";
const FOOD_FIX =
  "Record it in meals or person-days, or set the meals each unit contains.";

/**
 * The single classification used by readiness totals, warnings and previews.
 * Dashboard, Goals, Inventory and Budget all derive their figures from it.
 */
export function classifyItem(
  item: Classifiable,
  today: string,
): ItemClassification {
  const measure: Measure | null =
    item.category === "Water"
      ? "water"
      : item.category === "Food"
        ? "food"
        : null;
  if (!measure) return { kind: "not-measured" };
  if (item.readinessRole === "equipment") return { kind: "equipment", measure };
  if (!Number.isFinite(item.quantity) || item.quantity <= 0)
    return { kind: "empty", measure };
  if (isExpired(item, today)) return { kind: "expired", measure };
  const total = totalQuantity(item);
  const amount =
    measure === "water"
      ? toGallons(total.amount, total.unit)
      : toMeals(total.amount, total.unit);
  if (amount === null)
    return {
      kind: "unconvertible",
      measure,
      fix: measure === "water" ? WATER_FIX : FOOD_FIX,
    };
  return { kind: "counted", measure, amount };
}

/** Heuristic hint only — never applied automatically. */
export function looksLikeWaterEquipment(name: string) {
  return /\b(straw|filter|purif|tablet|steriliz|uv pen|treatment)/i.test(name);
}

const trim = (n: number) =>
  Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));

/** "8 case × 40 pt = 320 pt", or "26 gal". */
export function describeQuantity(item: Quantified) {
  const c = item.contains;
  if (c && c.amount > 0 && c.unit) {
    const t = totalQuantity(item);
    return `${trim(item.quantity)} ${item.unit} × ${trim(c.amount)} ${c.unit} = ${trim(t.amount)} ${t.unit}`;
  }
  return `${trim(item.quantity)} ${item.unit}`;
}
