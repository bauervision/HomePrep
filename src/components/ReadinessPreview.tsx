"use client";

import { Gauge, Info } from "lucide-react";
import { useHousehold } from "@/components/SessionProvider";
import { cx } from "@/components/ui";
import { useObjective } from "@/lib/objective";
import {
  categoryGuidance,
  localToday,
  milestoneByKey,
  projectReadiness,
} from "@/lib/readiness";
import type { InventoryItem } from "@/lib/types";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const signed = (n: number) =>
  `${n > 0 ? "+" : n < 0 ? "−" : "±"}${fmt(Math.abs(n))}`;

/**
 * Informational preview of how an inventory entry would change readiness for
 * the viewer's selected objective. Never writes anything.
 */
export function ReadinessPreview({
  draft,
  items,
  editingId,
}: {
  draft: Pick<InventoryItem, "category" | "quantity" | "unit" | "expiresOn">;
  /** Current household inventory (authoritative records). */
  items: InventoryItem[];
  /** Item being edited, whose existing contribution is replaced. */
  editingId: string | null;
}) {
  const { household, user } = useHousehold();
  const [objective] = useObjective(user.uid, household.id);
  const m = milestoneByKey(objective);
  const p = projectReadiness(
    items,
    editingId,
    draft,
    household.householdSize,
    objective,
    localToday(),
  );

  if (!p) {
    const g = categoryGuidance(draft.category, objective);
    if (!g) return null;
    return (
      <p
        className="flex gap-2 rounded-md border border-line bg-well px-3 py-2 text-xs text-sage"
        data-testid="readiness-guidance"
      >
        <Info
          size={14}
          aria-hidden
          className="mt-px shrink-0 text-copper-light"
        />
        <span>{g}</span>
      </p>
    );
  }

  const unit = p.unitLabel === "gal" ? "gallons" : "meals";
  const ratio = p.target > 0 ? Math.min(1, p.projected / p.target) : 0;
  const note =
    p.notCounted === "unit"
      ? p.kind === "water"
        ? `“${draft.unit}” isn’t counted as potable water. Use gal, L or fl oz.`
        : `“${draft.unit}” isn’t counted as food. Use meals or person-days.`
      : p.notCounted === "expired"
        ? "Expired items don’t count toward readiness."
        : null;

  return (
    <section
      aria-label={`Projected ${p.kind} readiness`}
      data-testid="readiness-preview"
      className="rounded-md border border-line bg-well px-3 py-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-sage uppercase">
          <Gauge size={13} aria-hidden className="text-pine" />
          Projected {p.kind} readiness
        </h3>
        <span className="text-[11px] text-slate">{m.label} objective</span>
      </div>
      <p className="mt-1.5 text-sm text-ivory tabular-nums">
        <span className="text-base font-semibold">{fmt(p.projected)}</span> /{" "}
        {p.target} {unit}
      </p>
      <div
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p.percent}
        aria-label={`${p.percent}% of the ${m.label} ${p.kind} target`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-pine-deep to-pine"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-sage tabular-nums">
        {p.percent}% of objective ·{" "}
        {p.remaining > 0
          ? `${fmt(p.remaining)} ${unit} remaining`
          : "target met"}
      </p>
      <p className="mt-0.5 text-[11px] text-slate tabular-nums">
        Recorded now {fmt(p.current)} · this entry {signed(p.change)}{" "}
        {p.unitLabel}
      </p>
      {note && <p className={cx("mt-1 text-[11px] text-amber")}>{note}</p>}
    </section>
  );
}
