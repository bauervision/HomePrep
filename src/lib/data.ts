"use client";

import { useHousehold } from "@/components/SessionProvider";
import { useCollection } from "./hooks";
import type { InventoryItem, Purchase, Task } from "./types";

export function useInventory() {
  const { household } = useHousehold();
  return useCollection<InventoryItem>(
    ["households", household.id, "inventory"],
    { orderBy: "name" },
  );
}

export function useTasks() {
  const { household } = useHousehold();
  return useCollection<Task>(["households", household.id, "tasks"]);
}

export function usePurchases() {
  const { household } = useHousehold();
  return useCollection<Purchase>(["households", household.id, "purchases"]);
}

const STATUS_ORDER = { in_progress: 0, todo: 1, complete: 2 } as const;

export function sortTasks(tasks: Task[]) {
  return [...tasks].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      a.priority - b.priority ||
      a.title.localeCompare(b.title),
  );
}

const PURCHASE_ORDER = { approved: 0, proposed: 1, acquired: 2 } as const;

export function sortPurchases(list: Purchase[]) {
  return [...list].sort(
    (a, b) =>
      PURCHASE_ORDER[a.status] - PURCHASE_ORDER[b.status] ||
      a.priority - b.priority ||
      a.name.localeCompare(b.name),
  );
}
