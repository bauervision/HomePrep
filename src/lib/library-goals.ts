import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { applyChange, createCustom, type CustomOptions } from "./checklist";
import { db } from "./firebase";
import { isLibraryCategory, libraryDestination } from "./goal-destinations";
import { isMilestoneKey } from "./readiness";
import type { Household, LibraryCategoryId, MilestoneKey } from "./types";

/** One atomic household update: destination + goal, with a caller-stable retry ID. */
export async function saveLibraryGoal(
  hid: string,
  requirementId: string,
  categoryId: LibraryCategoryId,
  milestone: MilestoneKey,
  title: string,
  explanation: string,
  options: CustomOptions,
) {
  if (!isLibraryCategory(categoryId) || !isMilestoneKey(milestone))
    throw new Error("Unrecognized goal destination.");
  if (!/^custom-[A-Za-z0-9-]+$/.test(requirementId))
    throw new Error("Unrecognized goal ID.");
  const destination = libraryDestination(categoryId, milestone);
  const firestore = db();
  const ref = doc(firestore, "households", hid);
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Household not found.");
    const h = snap.data() as Household;
    const previous = h.requirementState?.[requirementId];
    if (previous) {
      if (
        previous.custom?.libraryEntryId !== options.libraryEntryId ||
        previous.custom?.milestone !== milestone ||
        previous.custom?.goal !== destination.key
      ) {
        throw new Error(
          "This save already completed in another destination. Reopen the saved goal.",
        );
      }
      return; // Successful retry: never overwrite user edits or progress.
    }
    const now = new Date().toISOString();
    const change = createCustom(
      h.requirementState,
      milestone,
      destination.key,
      title,
      explanation,
      now,
      options,
    );
    tx.update(ref, {
      requirementState: applyChange(
        h.requirementState,
        requirementId,
        change,
        now,
      ),
      ...(!destination.builtIn
        ? {
            goalDestinations: {
              ...h.goalDestinations,
              [destination.storageKey]: { milestone, categoryId },
            },
          }
        : {}),
      updatedAt: serverTimestamp(),
    });
  });
  return destination;
}
