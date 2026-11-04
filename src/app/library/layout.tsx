import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Library · HomePrep",
  description:
    "Read-only preparedness reference: authority-supported household guidance.",
};

export default function LibraryLayout({ children }: { children: ReactNode }) {
  return children;
}
