import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Goals · HomePrep",
  description: "Preparedness goals, household targets and progress.",
};

export default function GoalsLayout({ children }: { children: ReactNode }) {
  return children;
}
