"use client";

import { GoalsView } from "@/components/goals/GoalsView";
import { useInventory, useTasks } from "@/lib/data";
import { localToday } from "@/lib/readiness";

/** Goal workspace: /goals/?milestone=72h&goal=water. */
export default function GoalsPage() {
  const inv = useInventory();
  const tasks = useTasks();
  return <GoalsView inv={inv} tasks={tasks} today={localToday()} />;
}
