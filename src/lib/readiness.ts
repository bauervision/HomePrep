import type { Category, InventoryItem, MilestoneKey, Task } from "./types";

// Planning baselines (FEMA / Ready.gov): 1 gallon of water per person per day,
// three meals per person per day.
export const GALLONS_PER_PERSON_DAY = 1;
export const MEALS_PER_PERSON_DAY = 3;

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

const GALLONS_PER_UNIT: Record<string, number> = {
  gal: 1,
  L: 0.264172,
  "fl oz": 1 / 128,
};

const MEALS_PER_UNIT: Record<string, number> = {
  meals: 1,
  "person-days": MEALS_PER_PERSON_DAY,
};

/** Today's date as YYYY-MM-DD in local time. */
export function localToday(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isExpired(
  item: Pick<InventoryItem, "expiresOn">,
  today: string,
) {
  return !!item.expiresOn && item.expiresOn < today;
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
  amount: number;
  /** Usable items in the category whose unit cannot be converted (not counted). */
  unmeasured: InventoryItem[];
}

function measure(
  items: InventoryItem[],
  category: Category,
  factors: Record<string, number>,
  today: string,
): Measured {
  let amount = 0;
  const unmeasured: InventoryItem[] = [];
  for (const item of usable(items, today)) {
    if (item.category !== category) continue;
    const f = factors[item.unit];
    if (f === undefined) unmeasured.push(item);
    else amount += item.quantity * f;
  }
  return { amount, unmeasured };
}

export const waterGallons = (items: InventoryItem[], today: string) =>
  measure(items, "Water", GALLONS_PER_UNIT, today);

export const foodMeals = (items: InventoryItem[], today: string) =>
  measure(items, "Food", MEALS_PER_UNIT, today);

export function targets(householdSize: number, days: number) {
  return {
    waterGal: householdSize * days * GALLONS_PER_PERSON_DAY,
    meals: householdSize * days * MEALS_PER_PERSON_DAY,
  };
}

export interface Essential {
  key: string;
  label: string;
  met: boolean;
  /** Human-readable, verifiable status, e.g. "8 / 15 gal". */
  detail: string;
  /** What is still needed when unmet. */
  need: string;
  /** For quantity-based essentials: current / target, used to draw a bar. */
  current?: number;
  target?: number;
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

/** Essentials for one objective, each derived only from inventory or task status. */
export function objectiveEssentials(
  objective: MilestoneKey,
  items: InventoryItem[],
  tasks: Task[],
  householdSize: number,
  today: string,
): Essential[] {
  const m = milestoneByKey(objective);
  const t = targets(householdSize, m.days);
  const w = waterGallons(items, today).amount;
  const f = foodMeals(items, today).amount;
  const live = usable(items, today);

  return OBJECTIVE_ESSENTIALS[objective].map((def): Essential => {
    const ev = def.evidence;
    switch (ev.kind) {
      case "water":
        return {
          key: def.key,
          label: def.label,
          met: w >= t.waterGal,
          detail: `${fmt(w)} / ${t.waterGal} gal`,
          need: `${fmt(Math.max(0, t.waterGal - w))} more gal of potable water`,
          current: w,
          target: t.waterGal,
        };
      case "food":
        return {
          key: def.key,
          label: def.label,
          met: f >= t.meals,
          detail: `${fmt(f)} / ${t.meals} meals`,
          need: `${fmt(Math.max(0, t.meals - f))} more meals (shelf-stable)`,
          current: f,
          target: t.meals,
        };
      case "inventory": {
        const count = live.filter((i) => i.category === ev.category).length;
        return {
          key: def.key,
          label: def.label,
          met: count > 0,
          detail:
            count > 0
              ? `${count} item${count === 1 ? "" : "s"} recorded`
              : "None recorded",
          need: ev.need,
        };
      }
      case "task": {
        const tk = tasks.find((x) => x.seedKey === ev.seedKey);
        const done = tk?.status === "complete";
        return {
          key: def.key,
          label: def.label,
          met: done,
          detail: !tk ? "No task" : done ? "Task complete" : "Task open",
          need: ev.need,
        };
      }
    }
  });
}

/** 72-hour essentials (kept for existing callers). */
export function essentials72h(
  items: InventoryItem[],
  tasks: Task[],
  householdSize: number,
  today: string,
): Essential[] {
  return objectiveEssentials("72h", items, tasks, householdSize, today);
}

export interface ObjectiveStatus extends Milestone {
  essentials: Essential[];
  metCount: number;
  total: number;
  waterGal: number;
  waterTarget: number;
  meals: number;
  mealsTarget: number;
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
  householdSize: number,
  today: string,
): ObjectiveStatus[] {
  const w = waterGallons(items, today).amount;
  const f = foodMeals(items, today).amount;
  let earlierComplete = true;
  return MILESTONES.map((m) => {
    const essentials = objectiveEssentials(
      m.key,
      items,
      tasks,
      householdSize,
      today,
    );
    const metCount = essentials.filter((e) => e.met).length;
    const t = targets(householdSize, m.days);
    const own = metCount === essentials.length;
    const status: ObjectiveStatus = {
      ...m,
      essentials,
      metCount,
      total: essentials.length,
      waterGal: w,
      waterTarget: t.waterGal,
      meals: f,
      mealsTarget: t.meals,
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
  target: number;
  percent: number;
  remaining: number;
  /** Why the draft adds nothing toward readiness, if it doesn't. */
  notCounted: "unit" | "expired" | "empty" | null;
}

/**
 * Projects water or food readiness for an inventory draft against one
 * objective, using the same conversion rules as the dashboard. When editing,
 * the existing item's contribution is replaced, never double-counted.
 * Returns null for categories without a quantitative model.
 */
export function projectReadiness(
  items: InventoryItem[],
  editingId: string | null,
  draft: Pick<InventoryItem, "category" | "quantity" | "unit" | "expiresOn">,
  householdSize: number,
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
  const measured = measureFn([asItem], today);
  const contribution = measured.amount;
  const t = targets(householdSize, milestoneByKey(objective).days);
  const target = isWater ? t.waterGal : t.meals;
  const projected = base + contribution;
  return {
    kind: isWater ? "water" : "food",
    unitLabel: isWater ? "gal" : "meals",
    current,
    projected,
    change: projected - current,
    target,
    percent:
      target > 0 ? Math.min(100, Math.round((projected / target) * 100)) : 0,
    remaining: Math.max(0, target - projected),
    notCounted:
      contribution > 0
        ? null
        : isExpired(asItem, today)
          ? "expired"
          : measured.unmeasured.length > 0
            ? "unit"
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
  waterTarget: number;
  meals: number;
  mealsTarget: number;
  met: boolean;
}

/** Longer milestones are judged on water and food supply only. */
export function milestoneStatus(
  items: InventoryItem[],
  householdSize: number,
  today: string,
): MilestoneStatus[] {
  const water = waterGallons(items, today).amount;
  const meals = foodMeals(items, today).amount;
  return MILESTONES.map((m) => {
    const t = targets(householdSize, m.days);
    return {
      ...m,
      waterGal: water,
      waterTarget: t.waterGal,
      meals,
      mealsTarget: t.meals,
      met: water >= t.waterGal && meals >= t.meals,
    };
  });
}

/** Whole days of supply the recorded water and food cover for the household. */
export function daysOfSupply(
  items: InventoryItem[],
  householdSize: number,
  today: string,
) {
  const water =
    waterGallons(items, today).amount /
    (householdSize * GALLONS_PER_PERSON_DAY);
  const food =
    foodMeals(items, today).amount / (householdSize * MEALS_PER_PERSON_DAY);
  return { water, food, overall: Math.min(water, food) };
}
