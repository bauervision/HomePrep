import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { MAX_CENTS } from "./budget";
import { db } from "./firebase";
import { normalizeInventoryDraft, type InventoryDraft } from "./inventory";
import type { InventoryItem, Purchase } from "./types";

/*
 * Budget → Inventory workflow
 *   1. recordAcquisition   marks a purchase acquired (+ optional actual cost).
 *                          Never touches inventory, so readiness is unchanged.
 *   2. addPurchaseToInventory  explicit, user-confirmed transfer. Creates a new
 *                          item (deterministic ID) or adds to a chosen existing
 *                          item, and links it on the purchase — atomically.
 * Both run as transactions that re-read the purchase, so repeated clicks,
 * retries and other devices cannot double-apply. All paths are scoped to the
 * household; Firestore rules enforce membership.
 */

export type PurchaseFlowErrorCode =
  | "not-found"
  | "already-acquired"
  | "not-acquired"
  | "already-linked"
  | "item-missing"
  | "unit-mismatch"
  | "invalid";

export class PurchaseFlowError extends Error {
  constructor(
    public code: PurchaseFlowErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PurchaseFlowError";
  }
}

/** Inventory ID for an item created from a purchase; makes creation idempotent. */
export const purchaseInventoryId = (purchaseId: string) =>
  `purchase-${purchaseId}`;

const purchaseRef = (hid: string, pid: string) =>
  doc(db(), "households", hid, "purchases", pid);
const inventoryRef = (hid: string, id: string) =>
  doc(db(), "households", hid, "inventory", id);

export async function recordAcquisition(
  householdId: string,
  purchaseId: string,
  opts: { actualCostCents: number | null; byName: string },
) {
  const cost = opts.actualCostCents;
  if (
    cost != null &&
    (!Number.isSafeInteger(cost) || cost < 0 || cost > MAX_CENTS)
  ) {
    throw new PurchaseFlowError(
      "invalid",
      "Actual cost must be a valid amount.",
    );
  }
  const ref = purchaseRef(householdId, purchaseId);
  await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists())
      throw new PurchaseFlowError(
        "not-found",
        "This purchase no longer exists.",
      );
    const p = snap.data() as Purchase;
    if (p.status === "acquired") {
      throw new PurchaseFlowError(
        "already-acquired",
        "This purchase is already marked acquired.",
      );
    }
    tx.update(ref, {
      status: "acquired",
      actualCostCents: cost,
      acquiredAt: serverTimestamp(),
      acquiredByName: opts.byName,
      updatedAt: serverTimestamp(),
    });
  });
}

export type InventoryTarget =
  { mode: "new"; draft: InventoryDraft } | { mode: "existing"; itemId: string };

/** Returns the linked inventory item ID once Firestore has committed. */
export async function addPurchaseToInventory(
  householdId: string,
  purchaseId: string,
  target: InventoryTarget,
  byName: string,
): Promise<string> {
  const draft =
    target.mode === "new" ? normalizeInventoryDraft(target.draft) : null;
  const pRef = purchaseRef(householdId, purchaseId);

  return runTransaction(db(), async (tx) => {
    // Reads first (Firestore transactions require reads before writes).
    const pSnap = await tx.get(pRef);
    if (!pSnap.exists())
      throw new PurchaseFlowError(
        "not-found",
        "This purchase no longer exists.",
      );
    const p = pSnap.data() as Purchase;
    if (p.status !== "acquired") {
      throw new PurchaseFlowError(
        "not-acquired",
        "Mark the purchase acquired first.",
      );
    }
    if (p.inventoryItemId) {
      const linked = await tx.get(inventoryRef(householdId, p.inventoryItemId));
      // A link to a since-deleted item may be re-established; a live link may not.
      if (linked.exists()) {
        throw new PurchaseFlowError(
          "already-linked",
          "This purchase is already in inventory.",
        );
      }
    }

    let itemId: string;
    if (target.mode === "new") {
      itemId = purchaseInventoryId(purchaseId);
      const iRef = inventoryRef(householdId, itemId);
      if ((await tx.get(iRef)).exists()) {
        throw new PurchaseFlowError(
          "already-linked",
          "This purchase is already in inventory.",
        );
      }
      tx.set(iRef, {
        ...draft!,
        sourcePurchaseId: purchaseId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedByName: byName,
      });
    } else {
      itemId = target.itemId;
      const iRef = inventoryRef(householdId, itemId);
      const iSnap = await tx.get(iRef);
      if (!iSnap.exists()) {
        throw new PurchaseFlowError(
          "item-missing",
          "That inventory item no longer exists.",
        );
      }
      const item = iSnap.data() as InventoryItem;
      if (item.unit !== p.unit || item.category !== p.category) {
        throw new PurchaseFlowError(
          "unit-mismatch",
          "Only items with the same category and unit can be combined.",
        );
      }
      tx.update(iRef, {
        quantity: (item.quantity ?? 0) + p.quantity,
        updatedAt: serverTimestamp(),
        updatedByName: byName,
      });
    }
    tx.update(pRef, { inventoryItemId: itemId, updatedAt: serverTimestamp() });
    return itemId;
  });
}
