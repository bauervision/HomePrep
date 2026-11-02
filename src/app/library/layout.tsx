import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Library · HomePrep",
  description:
    "Read-only preparedness reference: authority-supported guidance and book reviews.",
};

export default function LibraryLayout({ children }: { children: ReactNode }) {
  return children;
}
