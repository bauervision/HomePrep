"use client";

import { DashboardView } from "@/components/DashboardView";
import { useHousehold } from "@/components/SessionProvider";
import { useInventory, usePurchases, useTasks } from "@/lib/data";
import { useObjective } from "@/lib/objective";
import { localToday } from "@/lib/readiness";

export default function Dashboard() {
  const { household, user } = useHousehold();
  const [objective, setObjective] = useObjective(user.uid, household.id);
  const inv = useInventory();
  const tasks = useTasks();
  const purchases = usePurchases();

  if (inv.loading || tasks.loading || purchases.loading)
    return <p className="text-sm text-slate">Loading…</p>;

  return (
    <DashboardView
      householdSize={household.householdSize}
      inventory={inv.data}
      tasks={tasks.data}
      purchases={purchases.data}
      today={localToday()}
      objective={objective}
      onObjectiveChange={setObjective}
      error={inv.error || tasks.error || purchases.error}
    />
  );
}
