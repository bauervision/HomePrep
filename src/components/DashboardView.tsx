"use client";

import {
  Check,
  ListChecks,
  Mountain,
  Package,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Badge, Bar, Card, cx, linkClass } from "@/components/ui";
import {
  awaitingInventoryCount,
  budgetSummary,
  formatCents,
} from "@/lib/budget";
import { countRecordsByCategory } from "@/lib/inventory";
import { sortTasks } from "@/lib/data";
import {
  daysOfSupply,
  daysUntil,
  essentials72h,
  foodMeals,
  milestoneStatus,
  waterGallons,
} from "@/lib/readiness";
import {
  CATEGORIES,
  PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  type InventoryItem,
  type Purchase,
  type Task,
} from "@/lib/types";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const sectionLabel =
  "mb-1.5 text-[11px] font-semibold tracking-[0.14em] text-sage uppercase";

/** Presentational dashboard; all figures derive from the supplied records. */
export function DashboardView({
  householdSize: size,
  inventory,
  tasks,
  purchases,
  today,
  error,
}: {
  householdSize: number;
  inventory: InventoryItem[];
  tasks: Task[];
  purchases: Purchase[];
  today: string;
  error?: string | null;
}) {
  const view = useMemo(() => {
    const water = waterGallons(inventory, today);
    const food = foodMeals(inventory, today);
    const expiring = inventory
      .filter((i) => i.expiresOn && daysUntil(i.expiresOn, today) <= 30)
      .sort((a, b) => (a.expiresOn! < b.expiresOn! ? -1 : 1));
    return {
      essentials: essentials72h(inventory, tasks, size, today),
      milestones: milestoneStatus(inventory, size, today),
      supply: daysOfSupply(inventory, size, today),
      unmeasured: [...water.unmeasured, ...food.unmeasured],
      expiring,
      byCategory: (() => {
        const counts = countRecordsByCategory(inventory);
        return CATEGORIES.map((c) => ({ category: c, count: counts[c] }));
      })(),
      openTasks: sortTasks(tasks).filter((t) => t.status !== "complete"),
      doneTasks: tasks.filter((t) => t.status === "complete").length,
      budget: budgetSummary(purchases),
      awaitingInventory: awaitingInventoryCount(
        purchases,
        new Set(inventory.map((i) => i.id)),
      ),
    };
  }, [inventory, tasks, purchases, size, today]);

  const metCount = view.essentials.filter((e) => e.met).length;
  const missing = view.essentials.filter((e) => !e.met);

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-rust">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          72-hour readiness
          <span className="ml-2.5 text-sm font-normal text-sage">
            {metCount} of {view.essentials.length} essentials met · {size}{" "}
            people
          </span>
        </h1>
        <p className="text-xs text-sage">
          Recorded water &amp; food cover{" "}
          <span className="font-medium text-copper-light">
            {fmt(Math.floor(view.supply.overall * 10) / 10)} days
          </span>{" "}
          for {size}
        </p>
      </div>

      <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {view.milestones.map((m, idx) => {
          const current = idx === 0;
          return (
            <li
              key={m.key}
              className={cx(
                "surface px-3.5 py-2.5",
                current &&
                  "border-pine/50 shadow-[inset_0_1px_0_rgb(120_230_180/0.12)]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Mountain
                    size={14}
                    aria-hidden
                    className={current ? "text-pine" : "text-copper-light/70"}
                  />
                  {m.label}
                </span>
                {current ? (
                  <Badge
                    tone={metCount === view.essentials.length ? "good" : "warn"}
                  >
                    {metCount}/{view.essentials.length}
                  </Badge>
                ) : (
                  <Badge tone={m.met ? "good" : "neutral"}>
                    {m.met ? "Met" : "Later"}
                  </Badge>
                )}
              </div>
              <dl className="mt-2 space-y-1.5 text-[11px] text-sage">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <dt>Water</dt>
                    <dd className="text-ivory-dim tabular-nums">
                      {fmt(m.waterGal)} / {m.waterTarget} gal
                    </dd>
                  </div>
                  <Bar value={m.waterGal} max={m.waterTarget} />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <dt>Meals</dt>
                    <dd className="text-ivory-dim tabular-nums">
                      {fmt(m.meals)} / {m.mealsTarget}
                    </dd>
                  </div>
                  <Bar value={m.meals} max={m.mealsTarget} />
                </div>
              </dl>
            </li>
          );
        })}
      </ol>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card title="72-hour essentials" icon={ShieldCheck}>
          <ul className="space-y-2">
            {view.essentials.map((e) => (
              <li key={e.key} className="flex items-start gap-2.5">
                <span
                  className={cx(
                    "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
                    e.met
                      ? "bg-gradient-to-b from-pine to-pine-deep text-ivory"
                      : "border border-line-strong text-transparent",
                  )}
                  role="img"
                  aria-label={e.met ? "Met" : "Not met"}
                >
                  <Check size={11} strokeWidth={3} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className={e.met ? "text-ivory-dim" : "text-ivory"}>
                      {e.label}
                    </span>
                    <span className="text-xs text-sage tabular-nums">
                      {e.detail}
                    </span>
                  </div>
                  {e.target !== undefined && (
                    <div className="mt-1">
                      <Bar value={e.current ?? 0} max={e.target} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {view.unmeasured.length > 0 && (
            <p className="mt-3 text-[11px] text-amber/80">
              {view.unmeasured.length} water/food item(s) use units that can’t
              be counted ({view.unmeasured.map((i) => i.name).join(", ")}). Use
              gal, L, fl oz, meals or person-days.
            </p>
          )}
        </Card>

        <Card
          title="Current priorities"
          icon={ListChecks}
          action={
            <Link href="/tasks/" className={cx("text-xs", linkClass)}>
              {view.doneTasks}/{tasks.length} done · All tasks
            </Link>
          }
        >
          {view.openTasks.length === 0 ? (
            <p className="text-sm text-slate">No open tasks.</p>
          ) : (
            <ul className="divide-y divide-line">
              {view.openTasks.slice(0, 6).map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 py-1.5 first:pt-0 last:pb-0"
                >
                  <Badge
                    tone={
                      t.priority === 1
                        ? "bad"
                        : t.priority === 2
                          ? "warn"
                          : "neutral"
                    }
                  >
                    {PRIORITY_LABEL[t.priority]}
                  </Badge>
                  <Link
                    href="/tasks/"
                    className="min-w-0 flex-1 truncate text-sm text-ivory outline-none hover:text-copper-light focus-visible:text-copper-light"
                  >
                    {t.title}
                  </Link>
                  {t.status === "in_progress" && (
                    <Badge tone="info">{TASK_STATUS_LABEL[t.status]}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
          {missing.length > 0 && (
            <div className="mt-3 border-t border-line pt-2.5">
              <h3 className={sectionLabel}>Missing essentials</h3>
              <ul className="space-y-1 text-sm">
                {missing.map((e) => (
                  <li key={e.key} className="flex gap-2">
                    <span
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-amber"
                      aria-hidden
                    />
                    <span>
                      <span className="text-ivory-dim">{e.label}:</span>{" "}
                      <span className="text-sage">{e.need}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card
          title="Inventory status"
          icon={Package}
          action={
            <Link href="/inventory/" className={cx("text-xs", linkClass)}>
              {inventory.length} items · Manage
            </Link>
          }
        >
          <ul className="grid grid-cols-2 gap-1.5">
            {view.byCategory.map((c) => (
              <li
                key={c.category}
                aria-label={`${c.category}: ${c.count} recorded ${c.count === 1 ? "item" : "items"}`}
                className="flex items-center justify-between rounded-md border border-line bg-well px-2.5 py-1.5 text-sm"
              >
                <span className="text-ivory-dim">{c.category}</span>
                <span
                  className={cx(
                    "tabular-nums",
                    c.count ? "text-ivory" : "text-slate/60",
                  )}
                >
                  {c.count}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-line pt-2.5">
            <h3 className={sectionLabel}>Expired / expiring within 30 days</h3>
            {view.expiring.length === 0 ? (
              <p className="text-xs text-slate">Nothing expiring soon.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {view.expiring.slice(0, 5).map((i) => {
                  const d = daysUntil(i.expiresOn!, today);
                  return (
                    <li key={i.id} className="flex justify-between gap-2">
                      <span className="truncate text-ivory-dim">{i.name}</span>
                      <Badge tone={d < 0 ? "bad" : "warn"}>
                        {d < 0
                          ? `Expired ${-d}d ago`
                          : d === 0
                            ? "Today"
                            : `${d}d`}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div
            className="mt-3 space-y-0.5 border-t border-line pt-2.5 text-xs text-sage"
            data-testid="dashboard-budget"
          >
            <div className="flex items-center justify-between gap-2">
              <span>
                Budget: {view.budget.plannedCount} planned · est.{" "}
                <span className="text-ivory-dim tabular-nums">
                  {formatCents(view.budget.remainingCents)}
                </span>{" "}
                remaining
              </span>
              <Link href="/purchases/" className={linkClass}>
                Budget
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-2">
              <span>
                {view.budget.acquiredCount} acquired ·{" "}
                <span className="text-ivory-dim tabular-nums">
                  {formatCents(view.budget.spentCents)}
                </span>{" "}
                spent
                {view.budget.acquiredWithoutCost > 0 && (
                  <span className="text-amber"> (incomplete)</span>
                )}
              </span>
              {view.awaitingInventory > 0 && (
                <span className="text-amber">
                  {view.awaitingInventory} not yet in inventory
                </span>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
