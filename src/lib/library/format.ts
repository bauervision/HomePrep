import type { DisplayStatus } from "./types";

/** The authority label. It travels with an entry everywhere it is shown. */
export const STATUS_LABEL: Record<DisplayStatus, string> = {
  authority_supported: "Authority-supported guidance",
};

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
