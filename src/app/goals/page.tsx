"use client";

import {
  Check,
  ChevronRight,
  Plus,
  RotateCcw,
  Save,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useHousehold } from "@/components/SessionProvider";
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
  PageHeader,
  Select,
} from "@/components/ui";
import { useInventory, useTasks } from "@/lib/data";
import { relatedTasks, saveTargetOverride } from "@/lib/goals";
import { useObjective } from "@/lib/objective";
import { describeMembers, householdPlan, resolveProfile } from "@/lib/profile";
import { describeQuantity } from "@/lib/quantities";
import {
  categoryGuidance,
  isMilestoneKey,
  localToday,
  measureInventory,
  milestoneByKey,
  MILESTONES,
  objectiveEssentials,
  usable,
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
  type InventoryItem,
  type MilestoneKey,
  type Task,
} from "@/lib/types";
import { setParams, useSearch } from "@/lib/url-state";

const fmt = (n: number) =>
  Number.isInteger(n) ? String(n) : String(Number(n.toFixed(1)));

/**
 * Goal detail for each essential: /goals/?milestone=72h&goal=water.
 * Identity is the stable milestone key + essential key, never display text.
 */
export default function GoalsPage() {
  const { household, user } = useHousehold();
  const [viewerObjective] = useObjective(user.uid, household.id);
  const params = useSearch();
  const m = params.get("milestone");
  const milestone: MilestoneKey = isMilestoneKey(m) ? m : viewerObjective;
  const goalKey = params.get("goal");
  const inv = useInventory();
  const tasks = useTasks();
  const today = localToday();
  const plan = useMemo(() => householdPlan(household), [household]);
  const profile = useMemo(() => resolveProfile(household), [household]);

  const essentials = useMemo(
    () => objectiveEssentials(milestone, inv.data, tasks.data, plan, today),
    [milestone, inv.data, tasks.data, plan, today],
  );
  const selected = essentials.find((e) => e.key === goalKey) ?? null;
  const ms = milestoneByKey(milestone);
  const goalUrl = (key: string) =>
    `/goals/?milestone=${milestone}&goal=${encodeURIComponent(key)}`;

  return (
    <>
      <PageHeader
        title="Goals"
        sub={`${ms.adjective} essentials · ${describeMembers(profile)}`}
        action={
          <Select
            aria-label="Milestone"
            className="w-auto"
            value={milestone}
            onChange={(e) =>
              setParams({ milestone: e.target.value, goal: goalKey })
            }
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
        <div className="grid gap-3 lg:grid-cols-[18rem_1fr]">
          <Card
            title={`${ms.adjective} essentials`}
            icon={Target}
            className={selected ? "order-last lg:order-none" : undefined}
          >
            <ul className="-mx-1.5 space-y-0.5">
              {essentials.map((e) => {
                const active = e.key === selected?.key;
                return (
                  <li key={e.key}>
                    <a
                      href={goalUrl(e.key)}
                      aria-current={active ? "page" : undefined}
                      onClick={(ev) => {
                        if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
                        ev.preventDefault();
                        setParams({ goal: e.key }, { push: true });
                      }}
                      className={cx(
                        "flex min-h-10 items-center gap-2 rounded-md px-1.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-amber",
                        active ? "bg-white/5 text-ivory" : "hover:bg-white/3",
                      )}
                    >
                      <span
                        className={cx(
                          "grid size-4 shrink-0 place-items-center rounded-full",
                          e.met
                            ? "bg-pine text-ivory"
                            : "border border-line-strong text-transparent",
                        )}
                        role="img"
                        aria-label={e.met ? "Met" : "Not met"}
                      >
                        <Check size={11} strokeWidth={3} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{e.label}</span>
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
          </Card>
          {selected ? (
            <GoalDetail
              key={`${milestone}:${selected.key}`}
              essential={selected}
              items={inv.data}
              tasks={tasks.data}
              memberCount={profile.memberCount}
              today={today}
            />
          ) : (
            <Card>
              <p className="py-4 text-center text-sm text-slate">
                {goalKey
                  ? "That goal isn’t part of this milestone."
                  : "Select a goal to see its target, progress and supplies."}
              </p>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

const sectionLabel =
  "mb-1.5 text-[11px] font-semibold tracking-[0.14em] text-sage uppercase";

function GoalDetail({
  essential: e,
  items,
  tasks,
  memberCount,
  today,
}: {
  essential: Essential;
  items: InventoryItem[];
  tasks: Task[];
  memberCount: number | null;
  today: string;
}) {
  const ms = milestoneByKey(e.milestone);
  const related = relatedTasks(e, tasks);
  const category = e.category;
  const addHref = category
    ? `/inventory/?category=${encodeURIComponent(category)}&add=1`
    : null;

  return (
    <Card
      title={e.label}
      icon={Target}
      action={
        <Badge tone={e.met ? "good" : "warn"}>{e.met ? "Met" : "Open"}</Badge>
      }
    >
      <div className="space-y-4" data-testid="goal-detail">
        <p className="text-xs text-sage">
          {ms.label} · {BASIS_LABEL[e.basis]}
        </p>

        {isQuantityRequirement(e.key) && e.resolved ? (
          <QuantitySection
            essential={e}
            items={items}
            memberCount={memberCount}
            today={today}
          />
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-ivory-dim">{e.need}.</p>
            {category && (
              <p className="text-xs text-sage">
                {categoryGuidance(category, e.milestone)}
              </p>
            )}
            <p className="text-sm">
              <span className="text-sage">Status: </span>
              <span className="text-ivory">{e.detail}</span>
            </p>
            {category && e.basis === "capability" && (
              <ItemList
                title={`Recorded ${category} supplies`}
                rows={usable(items, today)
                  .filter((i) => i.category === category)
                  .map((i) => ({ item: i, note: describeQuantity(i) }))}
                empty={`No ${category} items recorded yet.`}
              />
            )}
          </div>
        )}

        {(addHref || category) && (
          <div className="flex flex-wrap gap-2">
            {addHref && (
              <Link href={addHref} className="btn btn-copper h-8 px-3 text-xs">
                <Plus size={14} aria-hidden />
                Add {category} item
              </Link>
            )}
            {category && (
              <Link
                href={`/inventory/?category=${encodeURIComponent(category)}`}
                className="btn btn-secondary h-8 px-3 text-xs"
              >
                View {category} inventory
              </Link>
            )}
          </div>
        )}

        <div>
          <h3 className={sectionLabel}>Related tasks</h3>
          {related.length === 0 ? (
            <p className="text-xs text-slate">No related tasks.</p>
          ) : (
            <ul className="divide-y divide-line">
              {related.map((t) => (
                <li key={t.id} className="flex items-center gap-2 py-1.5">
                  <Link
                    href={`/tasks/?task=${encodeURIComponent(t.id)}`}
                    className={cx(
                      "min-w-0 flex-1 truncate text-sm outline-none hover:text-copper-light focus-visible:text-copper-light",
                      t.status === "complete"
                        ? "text-slate line-through"
                        : "text-ivory",
                    )}
                  >
                    {t.title}
                  </Link>
                  <Badge tone={t.status === "complete" ? "good" : "neutral"}>
                    {TASK_STATUS_LABEL[t.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
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
