"use client";

// User-facing name: "Budget". The /purchases route is kept for compatibility.

import { BudgetView } from "@/components/budget/BudgetView";
import { useInventory, usePurchases } from "@/lib/data";

export default function BudgetPage() {
  const { data, loading, error } = usePurchases();
  const inv = useInventory();
  return <BudgetView data={data} loading={loading} error={error} inv={inv} />;
}
