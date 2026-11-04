import { evaluateGoal } from "./checklist";
import {
  libraryDestination,
  savedLibraryDestinations,
} from "./goal-destinations";
import type { Essential } from "./readiness";
import type {
  Household,
  InventoryItem,
  LibraryCategoryId,
  MilestoneKey,
  Task,
} from "./types";

/** Used only by Goals. Never adds essentials to Dashboard/readiness scoring. */
export function categoryGoalView(
  h: Household,
  categoryId: LibraryCategoryId,
  milestone: MilestoneKey,
  items: InventoryItem[],
  tasks: Task[],
  today: string,
): Essential {
  const dest = libraryDestination(categoryId, milestone);
  const checklist = evaluateGoal([], milestone, dest.key, h.requirementState, {
    items,
    tasks,
    today,
    quantity: {},
  });
  const met = checklist.core.applicable > 0 && checklist.complete;
  return {
    key: dest.key,
    label: dest.label,
    milestone,
    basis: "custom",
    met,
    status: met ? "met" : "open",
    detail: `${checklist.core.done} / ${checklist.core.applicable} done`,
    need: "Complete your household goals",
    checklist,
  };
}

export function householdCategoryGoals(
  h: Household,
  milestone: MilestoneKey,
  items: InventoryItem[],
  tasks: Task[],
  today: string,
) {
  return savedLibraryDestinations(h, milestone).map((d) =>
    categoryGoalView(h, d.categoryId, milestone, items, tasks, today),
  );
}
