"use client";

import {
  Check,
  ListChecks,
  Mountain,
  Package,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, type KeyboardEvent } from "react";
import { Badge, Bar, Card, cx, linkClass } from "@/components/ui";
import {
  awaitingInventoryCount,
  budgetSummary,
  formatCents,
} from "@/lib/budget";
import { countRecordsByCategory } from "@/lib/inventory";
import { sortTasks } from "@/lib/data";
import { describeMembers, type HouseholdProfile } from "@/lib/profile";
import type { PlanInput } from "@/lib/requirements";
import {
  daysOfSupply,
  daysUntil,
  foodMeals,
  MILESTONES,
  objectiveStatuses,
  waterGallons,
} from "@/lib/readiness";
import {
  CATEGORIES,
  PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  type InventoryItem,
  type MilestoneKey,
  type Purchase,
  type Task,
} from "@/lib/types";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const fmtTarget = (n: number | null) => (n === null ? "—" : fmt(n));

/** Goal detail for an essential (stable milestone + essential keys). */
export const goalHref = (milestone: MilestoneKey, goal?: string) =>
  `/goals/?milestone=${milestone}${goal ? `&goal=${encodeURIComponent(goal)}` : ""}`;

const sectionLabel =
  "mb-1.5 text-[11px] font-semibold tracking-[0.14em] text-sage uppercase";

/** Presentational dashboard; all figures derive from the supplied records. */
export function DashboardView({
  plan,
  profile,
  inventory,
  tasks,
  purchases,
  today,
  objective,
  onObjectiveChange,
  error,
}: {
  /** Member count and custom targets (see lib/profile.ts householdPlan). */
  plan: PlanInput;
  profile: HouseholdProfile;
  inventory: InventoryItem[];
  tasks: Task[];
  purchases: Purchase[];
  today: string;
  /** The viewer's selected readiness objective. */
  objective: MilestoneKey;
  onObjectiveChange: (objective: MilestoneKey) => void;
  error?: string | null;
}) {
  const view = useMemo(() => {
    const water = waterGallons(inventory, today);
    const food = foodMeals(inventory, today);
    const expiring = inventory
      .filter((i) => i.expiresOn && daysUntil(i.expiresOn, today) <= 30)
      .sort((a, b) => (a.expiresOn! < b.expiresOn! ? -1 : 1));
    return {
      statuses: objectiveStatuses(inventory, tasks, plan, today),
      supply: daysOfSupply(inventory, plan, today),
      unmeasured: [...water.unmeasured, ...food.unmeasured],
      expiring,
      byCategory: (() => {
        const counts = countRecordsByCategory(inventory);
        return CATEGORIES.map((c) => ({ category: c, count: counts[c] }));
      })(),
      budget: budgetSummary(purchases),
      awaitingInventory: awaitingInventoryCount(
        purchases,
        new Set(inventory.map((i) => i.id)),
      ),
    };
  }, [inventory, tasks, purchases, plan, today]);

  const selected =
    view.statuses.find((s) => s.key === objective) ?? view.statuses[0];
  const selectedIndex = view.statuses.indexOf(selected);
  const earlier = view.statuses.slice(0, selectedIndex);
  const missing = selected.essentials.filter((e) => !e.met);
  const objectiveTasks = tasks.filter((t) => t.milestone === selected.key);
  const openTasks = sortTasks(objectiveTasks).filter(
    (t) => t.status !== "complete",
  );
  const doneTasks = objectiveTasks.length - openTasks.length;

  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  function onCardKeyDown(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    const last = MILESTONES.length - 1;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? idx === last
          ? 0
          : idx + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? idx === 0
            ? last
            : idx - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : -1;
    if (next < 0) return;
    e.preventDefault();
    onObjectiveChange(MILESTONES[next].key);
    cardRefs.current[next]?.focus();
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-rust">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          {selected.adjective} readiness
          <span className="ml-2.5 text-sm font-normal text-sage">
            {selected.metCount} of {selected.total} essentials met ·{" "}
            {describeMembers(profile)}
          </span>
        </h1>
        {view.supply && (
          <p className="text-xs text-sage">
            Recorded water &amp; food cover{" "}
            <span className="font-medium text-copper-light">
              {fmt(Math.floor(view.supply.overall * 10) / 10)} days
            </span>{" "}
            for {profile.memberCount}
          </p>
        )}
      </div>

      {profile.status !== "complete" && (
        <p
          role="note"
          className="rounded-md border border-amber/30 bg-amber/6 px-3 py-2 text-xs text-ivory-dim"
        >
          {profile.status === "missing"
            ? "Your household size isn’t set, so water and food targets can’t be calculated. "
            : `Targets use the recorded household size (${profile.memberCount}). Confirm how many adults and children it includes. `}
          <Link href="/household/" className={linkClass}>
            Set up household profile
          </Link>
        </p>
      )}

      <div
        role="radiogroup"
        aria-label="Readiness objective"
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5"
      >
        {view.statuses.map((m, idx) => {
          const active = m.key === selected.key;
          return (
            <button
              key={m.key}
              ref={(el) => {
                cardRefs.current[idx] = el;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onObjectiveChange(m.key)}
              onKeyDown={(e) => onCardKeyDown(e, idx)}
              aria-label={`${m.label}: ${m.metCount} of ${m.total} essentials met${m.complete ? ", complete" : ""}`}
              className={cx(
                "surface px-3.5 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-amber motion-reduce:transition-none",
                active
                  ? "border-pine/60 shadow-[inset_0_1px_0_rgb(120_230_180/0.12),0_0_0_1px_rgb(47_163_122/0.35)]"
                  : "hover:border-line-strong hover:bg-white/[0.02]",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Mountain
                    size={14}
                    aria-hidden
                    className={active ? "text-pine" : "text-copper-light/70"}
                  />
                  {m.label}
                </span>
                <Badge tone={m.complete ? "good" : active ? "warn" : "neutral"}>
                  {m.metCount}/{m.total}
                </Badge>
              </span>
              <span
                className="mt-2 block space-y-1.5 text-[11px] text-sage"
                aria-hidden
              >
                <span className="block space-y-1">
                  <span className="flex justify-between">
                    <span>Water</span>
                    <span className="text-ivory-dim tabular-nums">
                      {fmt(m.waterGal)} / {fmtTarget(m.waterTarget)} gal
                    </span>
                  </span>
                  <Bar value={m.waterGal} max={m.waterTarget ?? 0} />
                </span>
                <span className="block space-y-1">
                  <span className="flex justify-between">
                    <span>Meals</span>
                    <span className="text-ivory-dim tabular-nums">
                      {fmt(m.meals)} / {fmtTarget(m.mealsTarget)}
                    </span>
                  </span>
                  <Bar value={m.meals} max={m.mealsTarget ?? 0} />
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card
          title={`${selected.adjective} essentials`}
          icon={ShieldCheck}
          action={
            <Link
              href={goalHref(selected.key)}
              className={cx("text-xs", linkClass)}
            >
              Goals
            </Link>
          }
        >
          <ul className="-mx-1.5 space-y-0.5">
            {selected.essentials.map((e) => (
              <li key={e.key}>
                <Link
                  href={goalHref(selected.key, e.key)}
                  data-testid={`essential-${e.key}`}
                  className="flex items-start gap-2.5 rounded-md px-1.5 py-1 outline-none hover:bg-white/3 focus-visible:ring-2 focus-visible:ring-amber"
                >
                  <span
                    className={cx(
                      "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                      e.met
                        ? "bg-gradient-to-b from-pine to-pine-deep text-ivory"
                        : e.status === "review"
                          ? "border border-amber text-amber"
                          : "border border-line-strong text-transparent",
                    )}
                    role="img"
                    aria-label={
                      e.met
                        ? "Met"
                        : e.status === "review"
                          ? "Needs review"
                          : "Not met"
                    }
                  >
                    {e.status === "review" ? (
                      "!"
                    ) : (
                      <Check size={11} strokeWidth={3} aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className={e.met ? "text-ivory-dim" : "text-ivory"}>
                        {e.label}
                      </span>
                      <span className="text-xs text-sage tabular-nums">
                        {e.status === "review" ? (
                          <span className="text-amber">Needs review</span>
                        ) : (
                          e.detail
                        )}
                      </span>
                    </div>
                    {e.target !== undefined && (
                      <div className="mt-1">
                        <Bar value={e.current ?? 0} max={e.target} />
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {earlier.length > 0 && (
            <p className="mt-3 border-t border-line pt-2.5 text-[11px] text-sage">
              Builds on{" "}
              {earlier.map((s, i) => (
                <span key={s.key}>
                  {i > 0 && " · "}
                  <span
                    className={
                      s.metCount === s.total ? "text-[#7fd8ad]" : "text-amber"
                    }
                  >
                    {s.label} {s.metCount}/{s.total}
                  </span>
                </span>
              ))}
              {!selected.earlierComplete && " — earlier essentials still open"}
            </p>
          )}
          {view.unmeasured.length > 0 && (
            <div
              className="mt-3 text-[11px] text-amber/80"
              data-testid="unmeasured-warning"
            >
              <p>
                {view.unmeasured.length} water/food{" "}
                {view.unmeasured.length === 1 ? "item isn’t" : "items aren’t"}{" "}
                counted because the amount can’t be converted. Record a volume
                or meals, set what each unit contains, or mark treatment
                equipment as equipment:
              </p>
              <ul className="mt-0.5">
                {view.unmeasured.map((i) => (
                  <li key={i.id}>
                    <Link
                      href={`/inventory/?item=${encodeURIComponent(i.id)}`}
                      className={linkClass}
                    >
                      Fix {i.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card
          title="Current priorities"
          icon={ListChecks}
          action={
            <Link
              href={`/tasks/?milestone=${selected.key}`}
              className={cx("text-xs", linkClass)}
            >
              {doneTasks}/{objectiveTasks.length} done · {selected.label} tasks
            </Link>
          }
        >
          {openTasks.length === 0 ? (
            <p className="text-sm text-slate">
              {objectiveTasks.length
                ? "All tasks for this objective are complete."
                : "No tasks for this objective yet."}
            </p>
          ) : (
            <ul
              className="divide-y divide-line"
              aria-label={`${selected.label} priorities`}
            >
              {openTasks.slice(0, 6).map((t) => (
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
                    href={`/tasks/?task=${encodeURIComponent(t.id)}`}
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
              <li key={c.category}>
                <Link
                  href={`/inventory/?category=${encodeURIComponent(c.category)}`}
                  aria-label={`${c.category}: ${c.count} recorded ${c.count === 1 ? "item" : "items"}`}
                  className="flex min-h-9 items-center justify-between rounded-md border border-line bg-well px-2.5 py-1.5 text-sm outline-none hover:border-line-strong focus-visible:ring-2 focus-visible:ring-amber"
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
                </Link>
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
