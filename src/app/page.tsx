"use client";

import { DashboardView } from "@/components/DashboardView";
import { useHousehold } from "@/components/SessionProvider";
import { useInventory, usePurchases, useTasks } from "@/lib/data";
import { localToday } from "@/lib/readiness";

export default function Dashboard() {
  const { household } = useHousehold();
  const inv = useInventory();
  const tasks = useTasks();
  const purchases = usePurchases();

  if (inv.loading || tasks.loading)
    return <p className="text-sm text-slate">Loading…</p>;

  return (
    <DashboardView
      householdSize={household.householdSize}
      inventory={inv.data}
      tasks={tasks.data}
      purchases={purchases.data}
      today={localToday()}
      error={inv.error || tasks.error || purchases.error}
    />
  );
}
