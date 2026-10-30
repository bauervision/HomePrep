import { type BudgetSummary as Summary, formatCents } from "@/lib/budget";
import { cx } from "@/components/ui";

function Stat({
  label,
  value,
  note,
  short,
  warn,
}: {
  label: string;
  value: string;
  note: string;
  /** Compact note for narrow screens. */
  short: string;
  warn?: boolean;
}) {
  return (
    <div className="min-w-0 px-2.5 py-2 sm:px-4 sm:py-2.5">
      <dt className="text-[10px] leading-tight font-semibold tracking-[0.08em] text-sage uppercase sm:text-[11px] sm:tracking-[0.14em]">
        {label}
      </dt>
      <dd className="mt-0.5 text-base font-semibold text-ivory tabular-nums sm:text-lg">
        {value}
      </dd>
      <dd
        className={cx(
          "text-[11px] leading-snug",
          warn ? "text-amber" : "text-slate",
        )}
      >
        <span className="sm:hidden">{short}</span>
        <span className="hidden sm:inline">{note}</span>
      </dd>
    </div>
  );
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** Estimated / Spent / Remaining planned, from real purchase records only. */
export function BudgetSummary({ summary: s }: { summary: Summary }) {
  return (
    <dl className="surface grid grid-cols-3 divide-x divide-line">
      <Stat
        label="Estimated"
        value={formatCents(s.estimatedCents)}
        note={
          s.unpricedCount
            ? `${plural(s.unpricedCount, "item")} without estimate`
            : `${plural(s.plannedCount + s.acquiredCount, "item")} in plan`
        }
        short={
          s.unpricedCount
            ? `${s.unpricedCount} unpriced`
            : `${s.plannedCount + s.acquiredCount} items`
        }
        warn={s.unpricedCount > 0}
      />
      <Stat
        label="Spent"
        value={formatCents(s.spentCents)}
        note={
          s.acquiredWithoutCost
            ? `Incomplete: ${plural(s.acquiredWithoutCost, "acquired item")} without cost`
            : `${plural(s.acquiredCount, "acquired item")}`
        }
        short={
          s.acquiredWithoutCost
            ? `Incomplete (${s.acquiredWithoutCost})`
            : `${s.acquiredCount} acquired`
        }
        warn={s.acquiredWithoutCost > 0}
      />
      <Stat
        label="Remaining planned"
        value={formatCents(s.remainingCents)}
        note={
          s.remainingUnpriced
            ? `${plural(s.plannedCount, "item")} · ${s.remainingUnpriced} unpriced`
            : `${plural(s.plannedCount, "item")} to buy`
        }
        short={`${s.plannedCount} to buy`}
        warn={s.remainingUnpriced > 0}
      />
    </dl>
  );
}
