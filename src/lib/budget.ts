import type { Purchase } from "./types";

/*
 * Budget money conventions
 * ------------------------
 * - `estimatedPrice` (existing field) is an estimated price PER UNIT in dollars.
 *   Estimated line total = estimatedPrice × quantity.
 * - `actualCostCents` (new, optional) is the TOTAL amount actually paid for the
 *   whole purchase, stored as integer cents to avoid floating-point drift.
 * All totals are computed in integer cents and formatted only for display.
 * Estimates are never counted as spending.
 */

export const MAX_CENTS = 100_000_000_00; // $100M sanity ceiling

export function dollarsToCents(dollars: number) {
  return Math.round(dollars * 100);
}

/** Estimated line total in cents, or null when the purchase has no estimate. */
export function estimatedTotalCents(
  p: Pick<Purchase, "estimatedPrice" | "quantity">,
) {
  if (p.estimatedPrice == null || !Number.isFinite(p.estimatedPrice))
    return null;
  const qty = Number.isFinite(p.quantity) ? p.quantity : 0;
  return Math.round(dollarsToCents(p.estimatedPrice) * qty);
}

export function formatCents(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Parses a user-entered dollar amount ("12", "$1,234.5", "0.99") into cents.
 * Empty input → null (not recorded). Throws on anything else that is invalid.
 */
export function parseMoneyInput(input: string): number | null {
  const raw = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (raw === "") return null;
  if (!/^\d+(\.\d{0,2})?$/.test(raw)) {
    throw new Error(
      "Enter an amount like 24.99 (no more than two decimal places).",
    );
  }
  const [whole, frac = ""] = raw.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS)
    throw new Error("Amount is too large.");
  return cents;
}

export function centsToInput(cents: number | null | undefined) {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

/**
 * Validates an optional product URL. Only absolute http(s) URLs with a host are
 * accepted; the trimmed original string is returned for storage.
 * Empty input → null. Throws with a user-facing message otherwise.
 */
export function parseProductUrl(input: string): string | null {
  const value = input.trim();
  if (value === "") return null;
  if (value.length > 2048) throw new Error("Product link is too long.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a full link starting with https:// or http://");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http:// and https:// product links are allowed.");
  }
  if (!url.hostname)
    throw new Error("Product link must include a website address.");
  return value;
}

/** Render-time guard: returns a safe href or null (never trust stored values). */
export function safeProductHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return parseProductUrl(value);
  } catch {
    return null;
  }
}

export interface BudgetSummary {
  /** Estimated cost of every purchase in the plan (planned + acquired). */
  estimatedCents: number;
  /** Purchases (any status) with no estimated price; excluded from estimates. */
  unpricedCount: number;
  /** Sum of recorded actual costs for acquired purchases. */
  spentCents: number;
  /** Acquired purchases with no recorded actual cost; spent is incomplete when > 0. */
  acquiredWithoutCost: number;
  /** Estimated cost of purchases not yet acquired. */
  remainingCents: number;
  /** Not-yet-acquired purchases with no estimate. */
  remainingUnpriced: number;
  plannedCount: number;
  acquiredCount: number;
}

export function budgetSummary(purchases: Purchase[]): BudgetSummary {
  const s: BudgetSummary = {
    estimatedCents: 0,
    unpricedCount: 0,
    spentCents: 0,
    acquiredWithoutCost: 0,
    remainingCents: 0,
    remainingUnpriced: 0,
    plannedCount: 0,
    acquiredCount: 0,
  };
  for (const p of purchases) {
    const est = estimatedTotalCents(p);
    if (est == null) s.unpricedCount++;
    else s.estimatedCents += est;

    if (p.status === "acquired") {
      s.acquiredCount++;
      if (
        typeof p.actualCostCents === "number" &&
        Number.isFinite(p.actualCostCents)
      ) {
        s.spentCents += Math.round(p.actualCostCents);
      } else {
        s.acquiredWithoutCost++;
      }
    } else {
      s.plannedCount++;
      if (est == null) s.remainingUnpriced++;
      else s.remainingCents += est;
    }
  }
  return s;
}

export type InventoryLinkState = "planned" | "linked" | "unlinked" | "unknown";

/**
 * Where an acquired purchase stands relative to Inventory. A link to an item
 * that has since been deleted counts as unlinked so it can be re-added.
 * `inventoryIds` is null while inventory is still loading.
 */
export function inventoryLinkState(
  p: Pick<Purchase, "status" | "inventoryItemId">,
  inventoryIds: ReadonlySet<string> | null,
): InventoryLinkState {
  if (p.status !== "acquired") return "planned";
  if (!inventoryIds) return "unknown";
  return p.inventoryItemId && inventoryIds.has(p.inventoryItemId)
    ? "linked"
    : "unlinked";
}
