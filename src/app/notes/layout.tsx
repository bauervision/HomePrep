import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Notes · HomePrep",
  description: "Ideas, research, and future projects.",
};

export default function NotesLayout({ children }: { children: ReactNode }) {
  return children;
}
