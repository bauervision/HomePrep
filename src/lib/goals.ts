import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { Essential } from "./readiness";
import { withOverride, type QuantityRequirementId } from "./requirements";
import type { Household, MilestoneKey, Task } from "./types";

/**
 * Sets (number) or resets (null) one household target. Runs as a transaction
 * on the household document so concurrent edits to other targets are kept.
 * Only `targetOverrides` and `updatedAt` change; inventory is never touched.
 */
export async function saveTargetOverride(
  householdId: string,
  milestone: MilestoneKey,
  id: QuantityRequirementId,
  value: number | null,
) {
  const ref = doc(db(), "households", householdId);
  await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Household not found.");
    const h = snap.data() as Household;
    tx.update(ref, {
      targetOverrides: withOverride(h.targetOverrides, milestone, id, value),
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Tasks that move an essential forward: its verifying starter task, plus open
 * tasks for the same milestone and inventory category.
 */
export function relatedTasks(e: Essential, tasks: Task[]): Task[] {
  return tasks.filter(
    (t) =>
      (e.seedKey !== undefined && t.seedKey === e.seedKey) ||
      (e.category !== undefined &&
        t.milestone === e.milestone &&
        t.category === e.category),
  );
}
