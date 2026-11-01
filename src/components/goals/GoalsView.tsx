"use client";

import {
  Check,
  ChevronRight,
  ClipboardList,
  Package,
  Plus,
  RotateCcw,
  Save,
  Target,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { RequirementChecklist } from "@/components/goals/RequirementChecklist";
import { InventoryItemForm } from "@/components/InventoryItemForm";
import { useHousehold } from "@/components/SessionProvider";
import { TaskForm } from "@/components/TaskForm";
import {
  Badge,
  Bar,
  Button,
  Card,
  cx,
  Empty,
  ErrorText,
  Input,
  linkClass,
  Modal,
  PageHeader,
  Select,
} from "@/components/ui";
import { GOAL_PURPOSE } from "@/lib/baseline";
import { planAction, STATUS_LABEL } from "@/lib/checklist";
import { displayNameOf } from "@/lib/household";
import {
  acknowledgeBaseline,
  relatedTasks,
  saveTargetOverride,
} from "@/lib/goals";
import { useObjective } from "@/lib/objective";
import { describeMembers, householdPlan, resolveProfile } from "@/lib/profile";
import { describeQuantity } from "@/lib/quantities";
import {
  goalCategory,
  isExpired,
  isMilestoneKey,
  measureInventory,
  milestoneByKey,
  MILESTONES,
  OBJECTIVE_ESSENTIALS,
  objectiveEssentials,
  type Essential,
} from "@/lib/readiness";
import {
  BASIS_LABEL,
  isQuantityRequirement,
  parseTargetInput,
  QUANTITY_POLICIES,
  recommendationFormula,
} from "@/lib/requirements";
import {
  TASK_STATUS_LABEL,
  type Category,
  type InventoryItem,
  type MilestoneKey,
  type Task,
} from "@/lib/types";
import { setParams, useSearch } from "@/lib/url-state";

const fmt = (n: number) =>
  Number.isInteger(n) ? String(n) : String(Number(n.toFixed(1)));

interface Loaded<T> {
  data: T[];
  loading: boolean;
  error: string | null;
}

export const GOAL_STATUS_LABEL: Record<Essential["status"], string> = {
  met: "Met",
  open: "Open",
  review: "Needs review",
};

/** Where the last goal viewed per milestone is remembered (per member). */
const lastGoalKey = (uid: string, householdId: string, m: MilestoneKey) =>
  `homeprep:goal:${uid}:${householdId}:${m}`;

function readLastGoal(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const goalUrl = (milestone: MilestoneKey, key: string) =>
  `/goals/?milestone=${milestone}&goal=${encodeURIComponent(key)}`;

/**
 * Goals workspace: /goals/?milestone=72h&goal=water. Identity is the stable
 * milestone key + essential key, never display text. Without a goal in the
 * URL the member's last goal for that milestone opens (else the first open
 * one), so a return visit resumes where they left off.
 */
export function GoalsView({
  inv,
  tasks,
  today,
}: {
  inv: Loaded<InventoryItem>;
  tasks: Loaded<Task>;
  today: string;
}) {
  const { household, user } = useHousehold();
  const [viewerObjective] = useObjective(user.uid, household.id);
  const params = useSearch();
  const m = params.get("milestone");
  const milestone: MilestoneKey = isMilestoneKey(m) ? m : viewerObjective;
  const requested = params.get("goal");
  const plan = useMemo(() => householdPlan(household), [household]);
  const profile = useMemo(() => resolveProfile(household), [household]);

  const essentials = useMemo(
    () => objectiveEssentials(milestone, inv.data, tasks.data, plan, today),
    [milestone, inv.data, tasks.data, plan, today],
  );
  const memoryKey = lastGoalKey(user.uid, household.id, milestone);
  const remembered =
    typeof window === "undefined" ? null : readLastGoal(memoryKey);
  const goalKey =
    requested ??
    (essentials.some((e) => e.key === remembered)
      ? remembered
      : (essentials.find((e) => !e.met) ?? essentials[0])?.key);
  const selected = essentials.find((e) => e.key === goalKey) ?? null;
  const ms = milestoneByKey(milestone);

  useEffect(() => {
    if (!selected) return;
    try {
      window.localStorage.setItem(memoryKey, selected.key);
    } catch {
      // Private browsing: resuming is a convenience only.
    }
  }, [memoryKey, selected]);

  const select = (key: string) =>
    setParams({ milestone, goal: key }, { push: true });

  return (
    <>
      <PageHeader
        title="Goals"
        sub={`${ms.adjective} essentials`}
        action={
          <Select
            aria-label="Milestone"
            className="w-auto"
            value={milestone}
            onChange={(ev) => {
              const next = ev.target.value as MilestoneKey;
              // Water and Food exist at every milestone: stay on them.
              const keep = OBJECTIVE_ESSENTIALS[next].some(
                (d) => d.key === selected?.key,
              );
              setParams({ milestone: next, goal: keep ? selected!.key : null });
            }}
          >
            {MILESTONES.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </Select>
        }
      />
      <ErrorText>{inv.error || tasks.error}</ErrorText>
      {inv.loading || tasks.loading ? (
        <Empty>Loading…</Empty>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[18rem_1fr] lg:items-start">
          {/* Desktop navigation. Phones use the compact picker instead. */}
          <Card
            title={`${ms.adjective} essentials`}
            icon={Target}
            className="hidden lg:block"
          >
            <nav aria-label="Goals">
              <ul className="-mx-1.5 space-y-0.5">
                {essentials.map((e) => {
                  const active = e.key === selected?.key;
                  return (
                    <li key={e.key}>
                      <a
                        href={goalUrl(milestone, e.key)}
                        aria-current={active ? "page" : undefined}
                        onClick={(ev) => {
                          if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
                          ev.preventDefault();
                          select(e.key);
                        }}
                        className={cx(
                          "flex min-h-10 items-center gap-2 rounded-md px-1.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-amber",
                          active ? "bg-white/5 text-ivory" : "hover:bg-white/3",
                        )}
                      >
                        <GoalStatusIcon essential={e} />
                        <span className="min-w-0 flex-1 truncate">
                          {e.label}
                        </span>
                        <span className="text-xs text-sage tabular-nums">
                          {e.detail}
                        </span>
                        <ChevronRight
                          size={14}
                          aria-hidden
                          className="shrink-0 text-slate"
                        />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </Card>
          <div className="min-w-0 space-y-3">
            <GoalPicker
              essentials={essentials}
              value={selected?.key ?? ""}
              onChange={select}
            />
            {selected ? (
              <GoalDetail
                key={`${milestone}:${selected.key}`}
                essential={selected}
                items={inv.data}
                tasks={tasks.data}
                memberCount={profile.memberCount}
                members={describeMembers(profile)}
                today={today}
              />
            ) : (
              <Card>
                <p className="py-4 text-center text-sm text-slate">
                  That goal isn’t part of this milestone.
                </p>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Phone goal selector: the selected goal comes first, not a long list. */
function GoalPicker({
  essentials,
  value,
  onChange,
}: {
  essentials: Essential[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="lg:hidden">
      <Select
        aria-label="Goal"
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
      >
        {value === "" && <option value="">Choose a goal</option>}
        {essentials.map((e) => (
          <option key={e.key} value={e.key}>
            {e.label} · {e.status === "review" ? "Needs review" : e.detail}
          </option>
        ))}
      </Select>
    </div>
  );
}

function GoalStatusIcon({ essential: e }: { essential: Essential }) {
  return (
    <span
      className={cx(
        "grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold",
        e.status === "met"
          ? "bg-pine text-ivory"
          : e.status === "review"
            ? "border border-amber text-amber"
            : "border border-line-strong text-transparent",
      )}
      role="img"
      aria-label={GOAL_STATUS_LABEL[e.status]}
    >
      {e.status === "review" ? (
        "!"
      ) : (
        <Check size={11} strokeWidth={3} aria-hidden />
      )}
    </span>
  );
}

const sectionLabel =
  "mb-1.5 text-[11px] font-semibold tracking-[0.14em] text-sage uppercase";

/**
 * "Needs review": the goal's recommendations changed since the household last
 * relied on them. Explains what changed and what remains, and lets the
 * household acknowledge the new baseline. Acknowledging changes no
 * requirement: incomplete ones stay incomplete.
 */
function BaselineReviewPanel({
  essential: e,
  items,
  today,
  open,
  onOpen,
  onClose,
}: {
  essential: Essential;
  items: InventoryItem[];
  today: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { household, user } = useHousehold();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const review = e.review!;
  const counted = e.checklist.requirements.filter((r) => r.counted);
  const remaining = counted.filter((r) => !r.satisfied);
  const contributing = counted.filter(
    (r) => r.satisfied || r.linked.length > 0 || r.tasks.length > 0,
  );
  const category = goalCategory(e);
  const recorded = category
    ? items.filter(
        (i) =>
          i.category === category && i.quantity > 0 && !isExpired(i, today),
      )
    : [];
  const next = remaining[0];

  async function acknowledge() {
    setBusy(true);
    setError(null);
    try {
      await acknowledgeBaseline(
        household.id,
        review.key,
        review.version,
        displayNameOf(user),
      );
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <section
      id="baseline-review"
      tabIndex={-1}
      aria-labelledby="baseline-review-title"
      data-testid="baseline-review"
      className="space-y-2 rounded-md border border-amber/30 bg-amber/6 px-3 py-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-amber"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="baseline-review-title" className="font-medium text-amber">
          Recommendations updated
        </h3>
        {!open && (
          <Button size="sm" onClick={onOpen} className="min-h-9 sm:min-h-0">
            Review Changes
          </Button>
        )}
      </div>
      <p className="text-ivory-dim">{review.why}</p>
      {open && (
        <div className="space-y-3 pt-1">
          {review.changes.length > 0 && (
            <div>
              <h4 className={sectionLabel}>What changed</h4>
              <ul className="space-y-1">
                {review.changes.map((c) => (
                  <li key={c.id}>
                    <span className="text-ivory">{c.title}</span>{" "}
                    <span className="text-slate">
                      {c.kind === "added" ? "· added" : "· changed"}
                    </span>
                    {c.note && (
                      <span className="block text-sage">{c.note}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h4 className={sectionLabel}>Still to do ({remaining.length})</h4>
            {remaining.length === 0 ? (
              <p className="text-sage">Nothing — every requirement is done.</p>
            ) : (
              <ul className="space-y-1" data-testid="review-remaining">
                {remaining.map((r) => (
                  <li key={r.id}>
                    <span className="text-ivory">{r.def.title}</span>{" "}
                    <span className="text-slate">
                      · {STATUS_LABEL[r.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {(contributing.length > 0 || recorded.length > 0) && (
            <div>
              <h4 className={sectionLabel}>Already contributing</h4>
              <ul className="space-y-1">
                {contributing.map((r) => (
                  <li key={r.id}>
                    <span className="text-ivory">{r.def.title}</span>
                    <span className="text-sage"> — {r.reason}</span>
                  </li>
                ))}
              </ul>
              {recorded.length > 0 && (
                <p className="mt-1 text-sage">
                  Recorded {category} items:{" "}
                  {recorded
                    .map((i) => `${i.name} (${describeQuantity(i)})`)
                    .join(", ")}
                  . Link an item to the requirement it supports; items aren’t
                  counted by category alone.
                </p>
              )}
            </div>
          )}
          {next && (
            <p className="text-sage">
              <span className="text-slate">Next: </span>
              {next.def.title} — {next.def.action}
            </p>
          )}
          <p className="text-slate">
            Acknowledging records that your household has seen these changes. It
            doesn’t mark anything complete; open requirements stay open.
          </p>
          <ErrorText>{error}</ErrorText>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="emerald"
              size="sm"
              icon={Check}
              loading={busy}
              onClick={acknowledge}
              className="min-h-10 sm:min-h-0"
            >
              Acknowledge changes
            </Button>
            <Button size="sm" onClick={onClose} className="min-h-10 sm:min-h-0">
              Not now
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function GoalDetail({
  essential: e,
  items,
  tasks,
  memberCount,
  members,
  today,
}: {
  essential: Essential;
  items: InventoryItem[];
  tasks: Task[];
  memberCount: number | null;
  members: string;
  today: string;
}) {
  const ms = milestoneByKey(e.milestone);
  const related = relatedTasks(e, tasks);
  const category = goalCategory(e);
  const quantityId = isQuantityRequirement(e.key) ? `${e.key}.supply` : null;
  const { core, confirmedOnly } = e.checklist;
  const action = planAction(e.checklist, e.status);

  // The quantity target starts open: it is the heart of Water and Food.
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(quantityId ? [quantityId] : []),
  );
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [adding, setAdding] = useState<Category | null>(null);
  const editingTask = tasks.find((t) => t.id === taskId) ?? null;

  const toggle = useCallback(
    (id: string) =>
      setOpen((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );

  // Scroll to and focus what the plan action opened, once it has rendered.
  useEffect(() => {
    if (!focusTarget) return;
    const el = document.getElementById(focusTarget.id);
    if (!el) return;
    el.scrollIntoView?.({
      block: "center",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    el.focus({ preventScroll: true });
  }, [focusTarget]);

  function runPlanAction() {
    if (action.kind === "review-changes") {
      setReviewing(true);
      setFocusTarget({ id: "baseline-review" });
    } else if (action.targetId) {
      const id = action.targetId;
      setOpen((s) => new Set(s).add(id));
      setFocusTarget({ id: `req-toggle-${id}` });
    } else {
      setOpen(new Set(e.checklist.requirements.map((r) => r.id)));
      setFocusTarget({ id: "goal-requirements" });
    }
  }

  const planningTask =
    related.find((t) => t.status !== "complete") ?? related[0];

  return (
    <Card
      title={e.label}
      icon={Target}
      action={
        <Badge
          tone={e.met ? "good" : e.status === "review" ? "warn" : "neutral"}
        >
          {GOAL_STATUS_LABEL[e.status]}
        </Badge>
      }
    >
      <div className="space-y-4" data-testid="goal-detail">
        {/* A. Goal header */}
        <div className="space-y-1">
          <p className="text-xs text-sage">
            {ms.label} · {members} · {BASIS_LABEL[e.basis]}
          </p>
          {GOAL_PURPOSE[e.key] && (
            <p className="text-sm text-ivory-dim">{GOAL_PURPOSE[e.key]}</p>
          )}
        </div>
        {e.review && (
          <BaselineReviewPanel
            essential={e}
            items={items}
            today={today}
            open={reviewing}
            onOpen={() => setReviewing(true)}
            onClose={() => setReviewing(false)}
          />
        )}

        {/* B. Progress, with D. the primary action beside it */}
        <div className="space-y-2" data-testid="goal-progress">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="text-sm text-ivory">
              <span data-testid="requirement-tally" className="tabular-nums">
                {core.applicable === 0
                  ? "No requirements apply"
                  : `${core.done} of ${core.applicable} done`}
              </span>
              {confirmedOnly > 0 && (
                <span className="text-xs text-sage">
                  {" "}
                  · {confirmedOnly} household-confirmed
                </span>
              )}
            </p>
            <Button
              variant="emerald"
              size="sm"
              className="min-h-10 px-4 sm:min-h-0"
              onClick={runPlanAction}
            >
              {action.label}
            </Button>
          </div>
          {core.applicable > 0 && (
            <Bar value={core.done} max={core.applicable} />
          )}
        </div>

        {/* C. Your preparedness goals */}
        <RequirementChecklist
          essential={e}
          items={items}
          tasks={tasks}
          related={related}
          today={today}
          open={open}
          onToggle={toggle}
          onOpenTask={setTaskId}
          onAddItem={setAdding}
          renderQuantity={() =>
            e.resolved && (
              <QuantitySection
                essential={e}
                items={items}
                memberCount={memberCount}
                today={today}
              />
            )
          }
        />

        {/* E. Supporting actions */}
        <div className="space-y-3 border-t border-line pt-3">
          {category ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="copper"
                size="sm"
                icon={Plus}
                className="min-h-10 sm:min-h-0"
                onClick={() => setAdding(category)}
              >
                Add {category} Item
              </Button>
              <Link
                href={`/inventory/?category=${encodeURIComponent(category)}&from=${encodeURIComponent(goalUrl(e.milestone, e.key))}`}
                className="btn btn-secondary h-8 min-h-10 px-3 text-xs sm:min-h-0"
              >
                <Package size={14} aria-hidden />
                View {category} Inventory
              </Link>
            </div>
          ) : (
            planningTask && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  icon={ClipboardList}
                  className="min-h-10 sm:min-h-0"
                  onClick={() => setTaskId(planningTask.id)}
                >
                  Work on the planning task
                </Button>
              </div>
            )
          )}

          <div>
            <h3 className={sectionLabel}>Related tasks</h3>
            {related.length === 0 ? (
              <p className="text-xs text-slate">No related tasks.</p>
            ) : (
              <ul className="divide-y divide-line">
                {related.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 py-1">
                    <button
                      type="button"
                      onClick={() => setTaskId(t.id)}
                      aria-haspopup="dialog"
                      className={cx(
                        "min-h-9 min-w-0 flex-1 truncate rounded text-left text-sm outline-none hover:text-copper-light focus-visible:ring-2 focus-visible:ring-amber",
                        t.status === "complete"
                          ? "text-slate line-through"
                          : "text-ivory",
                      )}
                    >
                      {t.title}
                    </button>
                    <Badge tone={t.status === "complete" ? "good" : "neutral"}>
                      {TASK_STATUS_LABEL[t.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={editingTask !== null}
        onClose={() => setTaskId(null)}
        title="Edit task"
      >
        {editingTask && (
          <TaskForm
            key={editingTask.id}
            initial={editingTask}
            inContext
            onDone={() => setTaskId(null)}
            hint={
              <p className="text-[11px] text-slate">
                {editingTask.category} ·{" "}
                {milestoneByKey(editingTask.milestone).label} · changes appear
                on the Tasks page too. Completing a task only counts toward
                requirements that use it.
              </p>
            }
          />
        )}
      </Modal>
      <Modal
        open={adding !== null}
        onClose={() => setAdding(null)}
        title={adding ? `Add ${adding} Item` : "Add item"}
      >
        {adding && (
          <InventoryItemForm
            initial={null}
            inventory={items}
            initialCategory={adding}
            onDone={() => setAdding(null)}
          />
        )}
      </Modal>
    </Card>
  );
}

function QuantitySection({
  essential: e,
  items,
  memberCount,
  today,
}: {
  essential: Essential;
  items: InventoryItem[];
  memberCount: number | null;
  today: string;
}) {
  const { household } = useHousehold();
  const id = e.key === "water" ? "water" : "food";
  const policy = QUANTITY_POLICIES[id];
  const r = e.resolved!;
  const measured = measureInventory(items, id, today);
  const current = e.current ?? 0;
  const [draft, setDraft] = useState(
    r.override !== null ? String(r.override) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function write(value: number | null) {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await saveTargetOverride(household.id, e.milestone, id, value);
      setSaved(
        value === null ? "Reset to the recommendation." : "Target saved.",
      );
      if (value === null) setDraft("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function save(ev: FormEvent) {
    ev.preventDefault();
    try {
      void write(parseTargetInput(draft));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1 text-xs text-sage">
        <p>{policy.source}</p>
        <p>{policy.assumptions}</p>
      </div>

      <dl className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-line bg-well px-3 py-2">
          <dt className="text-[11px] text-sage">Recommended baseline</dt>
          <dd className="text-sm text-ivory tabular-nums">
            {r.recommended === null ? (
              <Link href="/household/" className={linkClass}>
                Set household size
              </Link>
            ) : (
              `${fmt(r.recommended)} ${policy.unit}`
            )}
          </dd>
          <dd className="text-[11px] text-slate">
            {recommendationFormula(
              policy,
              memberCount,
              milestoneByKey(e.milestone).days,
            )}
          </dd>
        </div>
        <div className="rounded-md border border-line bg-well px-3 py-2">
          <dt className="text-[11px] text-sage">Household target</dt>
          <dd className="text-sm text-ivory tabular-nums">
            {r.target === null ? "—" : `${fmt(r.target)} ${policy.unit}`}
          </dd>
          <dd className="text-[11px] text-slate">
            {r.source === "custom"
              ? "Custom target"
              : "Uses the recommendation"}
          </dd>
        </div>
        <div className="rounded-md border border-line bg-well px-3 py-2">
          <dt className="text-[11px] text-sage">Recorded</dt>
          <dd className="text-sm text-ivory tabular-nums">
            {fmt(current)} {policy.unit}
          </dd>
          <dd className="text-[11px] text-slate">
            {r.target === null
              ? "Target unknown"
              : current >= r.target
                ? "Target met"
                : `${fmt(r.target - current)} ${policy.unit} remaining`}
          </dd>
        </div>
      </dl>
      {r.target !== null && <Bar value={current} max={r.target} />}

      <form onSubmit={save} className="space-y-1.5">
        <label
          htmlFor="goal-target"
          className="text-[13px] font-medium text-ivory-dim"
        >
          Custom household target ({policy.unit})
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="goal-target"
            type="number"
            min={0}
            step="any"
            className="w-32"
            placeholder={r.recommended === null ? "" : fmt(r.recommended)}
            value={draft}
            onChange={(ev) => setDraft(ev.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            variant="emerald"
            icon={Save}
            loading={busy}
            disabled={!draft.trim()}
          >
            Save target
          </Button>
          {r.override !== null && (
            <Button
              size="sm"
              icon={RotateCcw}
              disabled={busy}
              onClick={() => write(null)}
            >
              Reset to recommended
            </Button>
          )}
        </div>
        <p className="text-[11px] text-slate">
          A custom target is kept when your household size changes. Inventory is
          never changed by targets.
        </p>
        <ErrorText>{error}</ErrorText>
        {saved && (
          <p role="status" className="text-xs text-sage">
            {saved}
          </p>
        )}
      </form>

      <ItemList
        title="Counted toward this goal"
        rows={measured.counted.map(({ item, amount }) => ({
          item,
          note: `${describeQuantity(item)} → ${fmt(amount)} ${policy.unit}`,
        }))}
        empty="Nothing counted yet."
      />
      {measured.unmeasured.length > 0 && (
        <ItemList
          title="Not counted — amount can’t be converted"
          tone="warn"
          rows={measured.unmeasured.map((item) => ({
            item,
            note:
              id === "water"
                ? "Record a volume, set what each unit contains, or mark it as equipment"
                : "Record meals, or set the meals each unit contains",
          }))}
        />
      )}
      {measured.equipment.length > 0 && (
        <ItemList
          title="Equipment (capability, not counted)"
          rows={measured.equipment.map((item) => ({
            item,
            note: describeQuantity(item),
          }))}
        />
      )}
    </div>
  );
}

function ItemList({
  title,
  rows,
  empty,
  tone,
}: {
  title: string;
  rows: { item: InventoryItem; note: string }[];
  empty?: string;
  tone?: "warn";
}) {
  return (
    <div>
      <h3 className={cx(sectionLabel, tone === "warn" && "text-amber")}>
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs text-slate">{empty}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.map(({ item, note }) => (
            <li key={item.id} className="flex flex-wrap gap-x-2">
              <Link
                href={`/inventory/?item=${encodeURIComponent(item.id)}`}
                className="text-ivory outline-none hover:text-copper-light focus-visible:text-copper-light"
              >
                {item.name}
              </Link>
              <span className="text-xs text-sage tabular-nums">{note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
