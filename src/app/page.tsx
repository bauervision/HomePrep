"use client";

import { DashboardView } from "@/components/DashboardView";
import { useHousehold } from "@/components/SessionProvider";
import { useMemo } from "react";
import { useInventory, usePurchases, useTasks } from "@/lib/data";
import { useObjective } from "@/lib/objective";
import { householdPlan, resolveProfile } from "@/lib/profile";
import { localToday } from "@/lib/readiness";

export default function Dashboard() {
  const { household, user } = useHousehold();
  const [objective, setObjective] = useObjective(user.uid, household.id);
  const inv = useInventory();
  const tasks = useTasks();
  const purchases = usePurchases();
  const plan = useMemo(() => householdPlan(household), [household]);
  const profile = useMemo(() => resolveProfile(household), [household]);

  if (inv.loading || tasks.loading || purchases.loading)
    return <p className="text-sm text-slate">Loading…</p>;

  return (
    <DashboardView
      plan={plan}
      profile={profile}
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
