import type { DisplayStatus, SourceCitation } from "./types";

/** Review labels. They travel with an entry everywhere it is shown. */
export const STATUS_LABEL: Record<DisplayStatus, string> = {
  authority_supported: "Authority-supported guidance",
  verified_principle: "Verified principle — limited scope",
  source_reference: "Source reference — not independently verified",
  needs_review: "Needs review — not approved instructions",
  unavailable: "Review status unavailable — not approved instructions",
};

export const STATUS_TONE: Record<
  DisplayStatus,
  "good" | "info" | "neutral" | "warn" | "bad"
> = {
  authority_supported: "good",
  verified_principle: "info",
  source_reference: "neutral",
  needs_review: "warn",
  unavailable: "bad",
};

/** URL values for the book-review status filter. */
export const STATUS_PARAM: Partial<Record<DisplayStatus, string>> = {
  verified_principle: "verified",
  source_reference: "reference",
  needs_review: "needs-review",
  unavailable: "unavailable",
};

export const statusFromParam = (p: string | null): DisplayStatus | null =>
  (Object.entries(STATUS_PARAM).find(([, v]) => v === p)?.[0] as
    DisplayStatus | undefined) ?? null;

/** How an evidence record relates to the entry. None verifies the whole claim. */
export const RELATIONSHIP_LABEL: Record<string, string> = {
  supports: "Supports the reviewed guidance, within its scope",
  supports_with_editorial_application:
    "Supports, with HomePrep editorial application",
  correction_or_constraint: "Correction or constraint",
  context: "Context only",
};

export const relationshipLabel = (r: string) =>
  RELATIONSHIP_LABEL[r] ?? humanize(r);

/** `water_safety` → "water safety". */
export const humanize = (s: string) => s.replace(/[_.]+/g, " ").trim();

/** Milestone keys as recorded; 14 days and off-grid are not app objectives. */
export const milestoneLabel = (m: string) =>
  ({
    "72_hours": "72 hours",
    "14_days": "14 days",
    "30_days": "30 days",
    "90_days": "90 days",
    off_grid: "Off-grid",
  })[m] ?? humanize(m);

/**
 * One numbering system's page range. A null endpoint is "unnumbered"; it is
 * never filled in from the other numbering system.
 */
export function pageRange(start: number | null, end: number | null): string {
  const p = (n: number | null) => (n === null ? "unnumbered" : String(n));
  if (start === end) return p(start);
  return `${p(start)}–${p(end)}`;
}

export interface CitationParts {
  book: string;
  pdf: string;
  section: string | null;
}

export function citationParts(c: SourceCitation): CitationParts {
  return {
    book: `Book p. ${pageRange(c.book_page_start, c.book_page_end)}`,
    pdf: `PDF p. ${pageRange(c.pdf_page_start, c.pdf_page_end)}`,
    section: c.section,
  };
}

/** `2026-10-30` → "Oct 30, 2026" (as a calendar date, not a local time). */
export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString(
    "en-US",
    { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" },
  );
}
