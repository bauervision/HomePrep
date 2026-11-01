import {
  baselineFor,
  defVersion,
  taskRequirement,
  type RequirementDef,
} from "./baseline";
import {
  evaluateGoal,
  type EvalContext,
  type GoalChecklist,
} from "./checklist";
import {
  classifyItem,
  isExpired,
  type ItemContents,
  type Measure,
  type ReadinessRole,
} from "./quantities";
import {
  QUANTITY_POLICIES,
  recommendedAmount,
  resolveTarget,
  toPlan,
  type PlanInput,
  type QuantityRequirementId,
  type RequirementBasis,
  type ResolvedTarget,
} from "./requirements";
import type {
  BaselineReviews,
  Category,
  InventoryItem,
  MilestoneKey,
  Task,
} from "./types";

export { isExpired };

// Planning baselines (see lib/requirements.ts for basis and assumptions).
export const GALLONS_PER_PERSON_DAY = QUANTITY_POLICIES.water.rate;
export const MEALS_PER_PERSON_DAY = QUANTITY_POLICIES.food.rate;

export interface Milestone {
  key: MilestoneKey;
  label: string;
  /** Used in headings, e.g. "30-day readiness". */
  adjective: string;
  days: number;
}

export const MILESTONES: Milestone[] = [
  { key: "72h", label: "72 hours", adjective: "72-hour", days: 3 },
  { key: "7d", label: "7 days", adjective: "7-day", days: 7 },
  { key: "30d", label: "30 days", adjective: "30-day", days: 30 },
  { key: "60d", label: "60 days", adjective: "60-day", days: 60 },
  { key: "90d", label: "90 days", adjective: "90-day", days: 90 },
];

export const DEFAULT_OBJECTIVE: MilestoneKey = "72h";

export function isMilestoneKey(v: unknown): v is MilestoneKey {
  return MILESTONES.some((m) => m.key === v);
}

export function milestoneByKey(key: MilestoneKey): Milestone {
  return MILESTONES.find((m) => m.key === key) ?? MILESTONES[0];
}

/** Today's date as YYYY-MM-DD in local time. */
export function localToday(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function daysUntil(dateStr: string, today: string) {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${dateStr}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Items that count toward readiness: positive quantity and not expired. */
export function usable(items: InventoryItem[], today: string) {
  return items.filter((i) => i.quantity > 0 && !isExpired(i, today));
}

export interface Measured {
  /** Gallons (water) or meal-equivalents (food), unrounded. */
  amount: number;
  /** Items that contribute, with their converted amounts. */
  counted: { item: InventoryItem; amount: number }[];
  /**
   * Usable supplies whose amount cannot be converted (not counted). Warnings
   * are derived from this list, so they always match the totals.
   */
  unmeasured: InventoryItem[];
  /** Treatment/cooking equipment: recorded, deliberately not counted. */
  equipment: InventoryItem[];
}

/** Totals for one measure, from the shared item classification. */
export function measureInventory(
  items: InventoryItem[],
  measure: Measure,
  today: string,
): Measured {
  const r: Measured = { amount: 0, counted: [], unmeasured: [], equipment: [] };
  for (const item of items) {
    const c = classifyItem(item, today);
    if (c.kind === "not-measured" || c.measure !== measure) continue;
    if (c.kind === "counted") {
      r.amount += c.amount;
      r.counted.push({ item, amount: c.amount });
    } else if (c.kind === "unconvertible") r.unmeasured.push(item);
    else if (c.kind === "equipment") r.equipment.push(item);
  }
  return r;
}

export const waterGallons = (items: InventoryItem[], today: string) =>
  measureInventory(items, "water", today);

export const foodMeals = (items: InventoryItem[], today: string) =>
  measureInventory(items, "food", today);

/** Recommended baselines for a member count (no custom targets applied). */
export function targets(householdSize: number, days: number) {
  return {
    waterGal: recommendedAmount(QUANTITY_POLICIES.water, householdSize, days)!,
    meals: recommendedAmount(QUANTITY_POLICIES.food, householdSize, days)!,
  };
}

export interface Essential {
  key: string;
  label: string;
  milestone: MilestoneKey;
  basis: RequirementBasis;
  /** Inventory category this essential draws on, if any. */
  category?: Category;
  /** Starter task that verifies this essential, if any. */
  seedKey?: string;
  met: boolean;
  /** Human-readable, verifiable status, e.g. "8 / 15 gal". */
  detail: string;
  /** What is still needed when unmet. */
  need: string;
  /** For quantity-based essentials: current / target, used to draw a bar. */
  current?: number;
  target?: number;
  /** Quantity essentials: recommendation vs. household target. */
  resolved?: ResolvedTarget;
  /**
   * met    — every applicable core requirement is satisfied
   * review — not met, and the recommendations changed since the household
   *          last relied on them (it was met under the earlier rule, or a
   *          later baseline changed it) and the household hasn't
   *          acknowledged the change yet
   * open   — not met
   * Review is about acknowledging the baseline, never about completion:
   * acknowledging it leaves every requirement as it is.
   */
  status: "met" | "open" | "review";
  /** Why the goal needs review, when it does. */
  reviewNote?: string;
  /** What changed, when the goal needs review. */
  review?: BaselineReview;
  /** Requirement-level evaluation shared by Dashboard and Goals. */
  checklist: GoalChecklist;
}

/** How an essential is verified. Only recorded data counts. */
export type Evidence =
  | { kind: "water" }
  | { kind: "food" }
  /** At least one usable inventory record in the category (72-hour supplies). */
  | { kind: "inventory"; category: Category; need: string }
  /** The matching starter task is marked complete. */
  | { kind: "task"; seedKey: string; need: string };

export interface EssentialDef {
  key: string;
  label: string;
  evidence: Evidence;
}

const WATER: EssentialDef = {
  key: "water",
  label: "Water",
  evidence: { kind: "water" },
};
const FOOD: EssentialDef = {
  key: "food",
  label: "Food",
  evidence: { kind: "food" },
};
const byTask = (
  key: string,
  label: string,
  seedKey: string,
  need: string,
): EssentialDef => ({
  key,
  label,
  evidence: { kind: "task", seedKey, need },
});

/**
 * Essentials per objective. Water and food are measured against the
 * objective's targets; the remaining items are verified by inventory (72 hours)
 * or by completing the matching starter task (later objectives). No numeric
 * targets are invented for qualitative essentials.
 */
export const OBJECTIVE_ESSENTIALS: Record<MilestoneKey, EssentialDef[]> = {
  "72h": [
    WATER,
    FOOD,
    {
      key: "medical",
      label: "Medical & first aid",
      evidence: {
        kind: "inventory",
        category: "Medical",
        need: "Record a first aid kit and essential medications",
      },
    },
    {
      key: "power",
      label: "Lighting & power",
      evidence: {
        kind: "inventory",
        category: "Power",
        need: "Record flashlights/lanterns and batteries",
      },
    },
    {
      key: "comms",
      label: "Communications",
      evidence: {
        kind: "inventory",
        category: "Communications",
        need: "Record an emergency radio (battery or crank)",
      },
    },
    {
      key: "sanitation",
      label: "Sanitation",
      evidence: {
        kind: "inventory",
        category: "Sanitation",
        need: "Record bags, wipes, bleach and toilet supplies",
      },
    },
    byTask(
      "plan",
      "Family plan",
      "plan",
      "Complete the evacuation & communications plan task",
    ),
  ],
  "7d": [
    WATER,
    FOOD,
    byTask(
      "cooking",
      "Cooking without power",
      "7d:cooking",
      "Complete the emergency cooking task",
    ),
    byTask(
      "hygiene",
      "Hygiene & sanitation",
      "7d:hygiene",
      "Complete the hygiene inventory task",
    ),
    byTask(
      "meds",
      "Medication continuity",
      "7d:medication",
      "Complete the medication review task",
    ),
    byTask(
      "charging",
      "Backup charging",
      "7d:charging",
      "Complete the backup charging task",
    ),
    byTask(
      "comms",
      "Communications redundancy",
      "7d:comms",
      "Complete the communications task",
    ),
  ],
  "30d": [
    WATER,
    FOOD,
    byTask(
      "treatment",
      "Water treatment",
      "30d:filtration",
      "Complete the filtration plan task",
    ),
    byTask(
      "rotation",
      "Food rotation",
      "30d:rotation",
      "Complete the food rotation task",
    ),
    byTask(
      "waste",
      "Waste management",
      "30d:waste",
      "Complete the waste management task",
    ),
    byTask(
      "energy",
      "Backup energy",
      "30d:power",
      "Complete the backup power task",
    ),
    byTask(
      "resupply",
      "Resupply strategy",
      "30d:resupply",
      "Complete the resupply plan task",
    ),
    byTask(
      "medical",
      "Medical endurance",
      "30d:medical",
      "Complete the medical supply task",
    ),
  ],
  "60d": [
    WATER,
    FOOD,
    byTask(
      "maintenance",
      "Equipment maintenance",
      "60d:maintenance",
      "Complete the maintenance task",
    ),
    byTask(
      "sanitation",
      "Sustainable sanitation",
      "60d:sanitation",
      "Complete the sanitation task",
    ),
    byTask(
      "power",
      "Power endurance",
      "60d:power",
      "Complete the power endurance task",
    ),
    byTask(
      "supply",
      "Resupply contingencies",
      "60d:supply",
      "Complete the alternative supply task",
    ),
    byTask(
      "drill",
      "Preparedness drill",
      "60d:drill",
      "Complete the household drill task",
    ),
    byTask(
      "seasonal",
      "Seasonal needs",
      "60d:seasonal",
      "Complete the seasonal review task",
    ),
  ],
  "90d": [
    WATER,
    FOOD,
    byTask(
      "water-resilience",
      "Long-term water",
      "90d:water",
      "Complete the water collection task",
    ),
    byTask(
      "food-production",
      "Food production",
      "90d:food-production",
      "Complete the food production task",
    ),
    byTask(
      "energy",
      "Energy resilience",
      "90d:energy",
      "Complete the energy resilience task",
    ),
    byTask(
      "sanitation",
      "Long-term sanitation",
      "90d:sanitation",
      "Complete the sanitation task",
    ),
    byTask(
      "rotation",
      "Seasonal rotation",
      "90d:rotation",
      "Complete the seasonal rotation task",
    ),
    byTask(
      "sustainability",
      "Self-sufficiency plan",
      "90d:sustainability",
      "Complete the self-sufficiency task",
    ),
  ],
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Key of a goal's acknowledgment in `Household.baselineReviews`. */
export const reviewKey = (milestone: MilestoneKey, goal: string) =>
  `${milestone}.${goal}`;

/** Latest baseline version that added or changed one of the goal's definitions. */
export const goalBaselineVersion = (defs: RequirementDef[]) =>
  defs.reduce((v, d) => Math.max(v, defVersion(d)), 1);

export interface BaselineChange {
  id: string;
  title: string;
  kind: "added" | "changed";
  note?: string;
}

export interface BaselineReview {
  key: string;
  /** Baseline version to acknowledge. */
  version: number;
  /** Version the household last acknowledged; 0 if never. */
  acknowledged: number;
  /** Why the status changed. */
  why: string;
  /** Requirements added or changed since the acknowledged version. */
  changes: BaselineChange[];
}

/**
 * Whether a goal needs its baseline reviewed. It does when it isn't met, the
 * household hasn't acknowledged the current version of its recommendations,
 * and it had relied on an earlier version: either it was met under the
 * earlier rule, or the household acknowledged an earlier baseline that has
 * since changed. A goal that was never met and never reviewed is just open.
 */
export function baselineReview(
  milestone: MilestoneKey,
  goal: string,
  defs: RequirementDef[],
  reviews: BaselineReviews | undefined,
  legacy: string | null,
  checklist: GoalChecklist,
): BaselineReview | null {
  const key = reviewKey(milestone, goal);
  const version = goalBaselineVersion(defs);
  const acknowledged = reviews?.[key]?.version ?? 0;
  if (
    checklist.complete ||
    acknowledged >= version ||
    (!legacy && acknowledged === 0)
  )
    return null;
  const { core } = checklist;
  const why =
    acknowledged === 0
      ? `Earlier versions of HomePrep marked this goal met because ${legacy}. The updated recommendations list ${core.applicable} core requirements; ${core.done} are done.`
      : `The recommendations for this goal changed after you last reviewed them. ${core.done} of ${core.applicable} core requirements are done.`;
  return {
    key,
    version,
    acknowledged,
    why,
    changes: defs
      .filter((d) => defVersion(d) > acknowledged)
      .map((d) => ({
        id: d.id,
        title: d.title,
        kind: d.since > acknowledged ? "added" : "changed",
        ...(d.since <= acknowledged && d.revised
          ? { note: d.revised.note }
          : {}),
      })),
  };
}

/** Status, note and review details for a goal (shared by every essential). */
function goalStatus(
  review: BaselineReview | null,
  met: boolean,
): Pick<Essential, "status" | "reviewNote" | "review"> {
  if (met) return { status: "met" };
  if (!review) return { status: "open" };
  return { status: "review", reviewNote: review.why, review };
}

/** Essentials for one objective, each derived only from inventory or task status. */
function quantityEssential(
  def: EssentialDef,
  id: QuantityRequirementId,
  m: Milestone,
  current: number,
  plan: PlanInput,
  checklist: GoalChecklist,
  review: (legacy: string | null) => BaselineReview | null,
): Essential {
  const policy = QUANTITY_POLICIES[id];
  const resolved = resolveTarget(id, m, plan);
  const base = {
    key: def.key,
    label: def.label,
    milestone: m.key,
    basis: policy.basis,
    category: (id === "water" ? "Water" : "Food") as Category,
    current,
    resolved,
    checklist,
  };
  const t = resolved.target;
  if (t === null) {
    return {
      ...base,
      met: false,
      status: "open",
      detail: `${fmt(current)} ${policy.unit} · size not set`,
      need: "Set your household size to calculate this target",
    };
  }
  const what = id === "water" ? "gal of potable water" : "meals (shelf-stable)";
  const met = checklist.complete;
  const quantityMet = current >= t;
  return {
    ...base,
    met,
    ...goalStatus(
      review(quantityMet ? `the ${policy.unit} target was reached` : null),
      met,
    ),
    detail: `${fmt(current)} / ${fmt(t)} ${policy.unit}`,
    need: quantityMet
      ? nextStep(checklist)
      : `${fmt(Math.max(0, t - current))} more ${what}`,
    target: t,
  };
}

/** Requirement definitions for one essential (system catalog). */
export function essentialRequirements(
  milestone: MilestoneKey,
  def: EssentialDef,
): RequirementDef[] {
  const defs = baselineFor(milestone, def.key);
  if (defs.length > 0) return defs;
  const ev = def.evidence;
  return ev.kind === "task"
    ? [taskRequirement(milestone, def.key, ev.need, ev.seedKey)]
    : [];
}

/** The first open core requirement, as a short next step. */
function nextStep(c: GoalChecklist): string {
  const open = c.requirements.find((r) => r.counted && !r.satisfied);
  return open ? open.def.title : "All core requirements done";
}

/**
 * Inventory category a goal's actions add to and filter by: the goal's own
 * category, else the one its requirements link from (e.g. CO detectors are
 * Safety items). Planning-only goals have none.
 */
export function goalCategory(e: Essential): Category | undefined {
  if (e.category) return e.category;
  for (const r of e.checklist.requirements) {
    for (const c of r.def.completion.conditions)
      if (c.kind === "inventory" && c.category) return c.category;
  }
  return undefined;
}

/** Essentials for one objective, each derived only from recorded data. */
export function objectiveEssentials(
  objective: MilestoneKey,
  items: InventoryItem[],
  tasks: Task[],
  plan: PlanInput,
  today: string,
): Essential[] {
  const m = milestoneByKey(objective);
  const w = waterGallons(items, today).amount;
  const f = foodMeals(items, today).amount;
  const live = usable(items, today);
  const { requirements: state, reviews } = toPlan(plan);
  const ctx: EvalContext = {
    items,
    tasks,
    today,
    quantity: {
      water: { current: w, target: resolveTarget("water", m, plan).target },
      food: { current: f, target: resolveTarget("food", m, plan).target },
    },
  };

  return OBJECTIVE_ESSENTIALS[objective].map((def): Essential => {
    const ev = def.evidence;
    const defs = essentialRequirements(objective, def);
    const checklist = evaluateGoal(defs, objective, def.key, state, ctx);
    const review = (legacy: string | null) =>
      baselineReview(objective, def.key, defs, reviews, legacy, checklist);
    if (ev.kind === "water")
      return quantityEssential(def, "water", m, w, plan, checklist, review);
    if (ev.kind === "food")
      return quantityEssential(def, "food", m, f, plan, checklist, review);

    // Earlier rule: any in-stock item in the category, or the starter task.
    const tk =
      ev.kind === "task" ? tasks.find((x) => x.seedKey === ev.seedKey) : null;
    const legacyMet =
      ev.kind === "inventory"
        ? live.some((i) => i.category === ev.category)
        : tk?.status === "complete";
    const met = checklist.complete;
    const { core } = checklist;
    return {
      key: def.key,
      label: def.label,
      milestone: m.key,
      basis: ev.kind === "inventory" ? "capability" : "planning",
      ...(ev.kind === "inventory"
        ? { category: ev.category }
        : { seedKey: ev.seedKey }),
      met,
      ...goalStatus(
        review(
          !legacyMet
            ? null
            : ev.kind === "inventory"
              ? `you had recorded ${ev.category} items`
              : "its starter task was complete",
        ),
        met,
      ),
      detail:
        core.applicable === 0
          ? "Not applicable"
          : `${core.done} / ${core.applicable} done`,
      need: nextStep(checklist),
      checklist,
    };
  });
}

/** 72-hour essentials (kept for existing callers). */
export function essentials72h(
  items: InventoryItem[],
  tasks: Task[],
  plan: PlanInput,
  today: string,
): Essential[] {
  return objectiveEssentials("72h", items, tasks, plan, today);
}

export interface ObjectiveStatus extends Milestone {
  essentials: Essential[];
  metCount: number;
  total: number;
  waterGal: number;
  /** Household target (custom or recommended); null when size is unknown. */
  waterTarget: number | null;
  meals: number;
  mealsTarget: number | null;
  /** Every essential of every earlier objective is met. */
  earlierComplete: boolean;
  /** This objective's essentials and all earlier objectives' essentials are met. */
  complete: boolean;
}

/**
 * Status of every objective from the same inventory and tasks. Inventory is
 * cumulative: the same water counts toward every objective. An objective is
 * complete only when all of its essentials and every earlier objective's are
 * met — never on water and food alone.
 */
export function objectiveStatuses(
  items: InventoryItem[],
  tasks: Task[],
  plan: PlanInput,
  today: string,
): ObjectiveStatus[] {
  const w = waterGallons(items, today).amount;
  const f = foodMeals(items, today).amount;
  let earlierComplete = true;
  return MILESTONES.map((m) => {
    const essentials = objectiveEssentials(m.key, items, tasks, plan, today);
    const metCount = essentials.filter((e) => e.met).length;
    const own = metCount === essentials.length;
    const status: ObjectiveStatus = {
      ...m,
      essentials,
      metCount,
      total: essentials.length,
      waterGal: w,
      waterTarget: resolveTarget("water", m, plan).target,
      meals: f,
      mealsTarget: resolveTarget("food", m, plan).target,
      earlierComplete,
      complete: own && earlierComplete,
    };
    earlierComplete = earlierComplete && own;
    return status;
  });
}

/** What an inventory draft would contribute, replacing the edited item's share. */
export interface ReadinessProjection {
  kind: "water" | "food";
  unitLabel: "gal" | "meals";
  current: number;
  projected: number;
  change: number;
  /** Household target; null when the household size is unknown. */
  target: number | null;
  percent: number;
  remaining: number;
  /** Why the draft adds nothing toward readiness, if it doesn't. */
  notCounted: "unit" | "expired" | "empty" | "equipment" | null;
}

export type ReadinessDraft = Pick<
  InventoryItem,
  "category" | "quantity" | "unit" | "expiresOn"
> & { contains?: ItemContents | null; readinessRole?: ReadinessRole };

/**
 * Projects water or food readiness for an inventory draft against one
 * objective, using the same conversion rules as the dashboard. When editing,
 * the existing item's contribution is replaced, never double-counted.
 * Returns null for categories without a quantitative model.
 */
export function projectReadiness(
  items: InventoryItem[],
  editingId: string | null,
  draft: ReadinessDraft,
  plan: PlanInput,
  objective: MilestoneKey,
  today: string,
): ReadinessProjection | null {
  if (draft.category !== "Water" && draft.category !== "Food") return null;
  const isWater = draft.category === "Water";
  const measureFn = isWater ? waterGallons : foodMeals;
  const others = items.filter((i) => i.id !== editingId);
  const current = measureFn(items, today).amount;
  const base = measureFn(others, today).amount;
  const asItem: InventoryItem = {
    id: "__draft__",
    name: "",
    location: "",
    notes: "",
    ...draft,
    quantity: Number.isFinite(draft.quantity) ? draft.quantity : 0,
  };
  const classified = classifyItem(asItem, today);
  const contribution = classified.kind === "counted" ? classified.amount : 0;
  const target = resolveTarget(
    isWater ? "water" : "food",
    milestoneByKey(objective),
    plan,
  ).target;
  const projected = base + contribution;
  return {
    kind: isWater ? "water" : "food",
    unitLabel: isWater ? "gal" : "meals",
    current,
    projected,
    change: projected - current,
    target,
    percent:
      target === null
        ? 0
        : target > 0
          ? Math.min(100, Math.round((projected / target) * 100))
          : 100,
    remaining: target === null ? 0 : Math.max(0, target - projected),
    notCounted:
      classified.kind === "counted"
        ? null
        : classified.kind === "unconvertible"
          ? "unit"
          : classified.kind === "expired" || classified.kind === "equipment"
            ? classified.kind
            : "empty",
  };
}

const GUIDANCE: Partial<Record<Category, string>> = {
  Medical:
    "Review first-aid supplies, essential medications, and continuity needs",
  Power: "Consider lighting, charging, and backup power endurance",
  Communications:
    "Confirm emergency radio access and household communication plans",
  Sanitation: "Review hygiene supplies, waste disposal, and water conservation",
  Safety: "Check smoke and CO alarms, extinguishers, and protective gear",
  Evacuation: "Keep go-bags, documents, and routes current",
};

/**
 * Short, objective-aware guidance for categories without a numeric model.
 * Deliberately makes no completeness claim.
 */
export function categoryGuidance(
  category: Category,
  objective: MilestoneKey,
): string | null {
  const g = GUIDANCE[category];
  return g ? `${g} for ${milestoneByKey(objective).label}.` : null;
}

export interface MilestoneStatus {
  key: MilestoneKey;
  label: string;
  days: number;
  waterGal: number;
  waterTarget: number | null;
  meals: number;
  mealsTarget: number | null;
  met: boolean;
}

/** Longer milestones are judged on water and food supply only. */
export function milestoneStatus(
  items: InventoryItem[],
  plan: PlanInput,
  today: string,
): MilestoneStatus[] {
  const water = waterGallons(items, today).amount;
  const meals = foodMeals(items, today).amount;
  return MILESTONES.map((m) => {
    const wt = resolveTarget("water", m, plan).target;
    const mt = resolveTarget("food", m, plan).target;
    return {
      ...m,
      waterGal: water,
      waterTarget: wt,
      meals,
      mealsTarget: mt,
      met: wt !== null && mt !== null && water >= wt && meals >= mt,
    };
  });
}

/**
 * Days the recorded water and food cover at the baseline rates for the
 * household's people; null when the household size is unknown.
 */
export function daysOfSupply(
  items: InventoryItem[],
  plan: PlanInput,
  today: string,
) {
  const n = toPlan(plan).memberCount;
  if (!n) return null;
  const water =
    waterGallons(items, today).amount / (n * GALLONS_PER_PERSON_DAY);
  const food = foodMeals(items, today).amount / (n * MEALS_PER_PERSON_DAY);
  return { water, food, overall: Math.min(water, food) };
}

export interface ReadinessFeedback {
  tone: "met" | "progress";
  text: string;
}

/**
 * Concise messages describing how an inventory change moved the essentials of
 * one objective. Only changes in counted amounts produce a message, so saving
 * an unchanged record says nothing, and items that cannot be counted never
 * produce a completion message.
 */
export function readinessFeedback(
  before: InventoryItem[],
  after: InventoryItem[],
  tasks: Task[],
  plan: PlanInput,
  objective: MilestoneKey,
  today: string,
): ReadinessFeedback[] {
  const m = milestoneByKey(objective);
  const was = objectiveEssentials(objective, before, tasks, plan, today);
  const now = objectiveEssentials(objective, after, tasks, plan, today);
  const out: ReadinessFeedback[] = [];
  now.forEach((e, i) => {
    const prev = was[i];
    if (e.resolved) {
      const t = e.target;
      if (t === undefined || e.current === prev.current) return;
      const unit =
        QUANTITY_POLICIES[e.key === "water" ? "water" : "food"].unitLong;
      const name = e.label.toLowerCase();
      const reached = e.current! >= t;
      const wasReached =
        prev.target !== undefined && prev.current! >= prev.target;
      if (reached && !wasReached) {
        out.push({
          tone: "met",
          text: `${m.adjective} ${name} target reached. ${fmt(e.current!)} ${unit} recorded; ${fmt(t)} ${unit} required.`,
        });
      } else if (!reached) {
        out.push({
          tone: "progress",
          text: `${m.adjective} ${name}: ${fmt(e.current!)} of ${fmt(t)} ${unit} recorded — ${fmt(t - e.current!)} ${unit} remaining.`,
        });
      }
    } else if (e.basis === "capability" && e.met && !prev.met) {
      out.push({
        tone: "met",
        text: `${m.adjective} ${e.label.toLowerCase()} essential met.`,
      });
    }
  });
  return out;
}
