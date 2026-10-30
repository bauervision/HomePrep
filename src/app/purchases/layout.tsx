import type { Metadata } from "next";
import type { ReactNode } from "react";

// The route stays /purchases for compatibility; the page is presented as "Budget".
export const metadata: Metadata = {
  title: "Budget · HomePrep",
  description: "Preparedness purchase planning and inventory development.",
};

export default function BudgetLayout({ children }: { children: ReactNode }) {
  return children;
}
