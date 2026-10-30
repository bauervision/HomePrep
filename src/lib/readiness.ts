import type { Category, InventoryItem, MilestoneKey, Task } from "./types";

// Planning baselines (FEMA / Ready.gov): 1 gallon of water per person per day,
// three meals per person per day.
export const GALLONS_PER_PERSON_DAY = 1;
export const MEALS_PER_PERSON_DAY = 3;

export const MILESTONES: { key: MilestoneKey; label: string; days: number }[] =
  [
    { key: "72h", label: "72 hours", days: 3 },
    { key: "7d", label: "7 days", days: 7 },
    { key: "30d", label: "30 days", days: 30 },
    { key: "60d", label: "60 days", days: 60 },
    { key: "90d", label: "90 days", days: 90 },
  ];

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

const PRESENCE_ESSENTIALS: {
  key: string;
  label: string;
  category: Category;
  need: string;
}[] = [
  {
    key: "medical",
    label: "Medical & first aid",
    category: "Medical",
    need: "Record a first aid kit and essential medications",
  },
  {
    key: "power",
    label: "Lighting & power",
    category: "Power",
    need: "Record flashlights/lanterns and batteries",
  },
  {
    key: "comms",
    label: "Communications",
    category: "Communications",
    need: "Record an emergency radio (battery or crank)",
  },
  {
    key: "sanitation",
    label: "Sanitation",
    category: "Sanitation",
    need: "Record bags, wipes, bleach and toilet supplies",
  },
];

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * 72-hour essentials, each derived only from recorded inventory or task status.
 * Quantity checks use the planning baselines; presence checks require at least
 * one usable item recorded in that category.
 */
export function essentials72h(
  items: InventoryItem[],
  tasks: Task[],
  householdSize: number,
  today: string,
): Essential[] {
  const t = targets(householdSize, 3);
  const water = waterGallons(items, today);
  const food = foodMeals(items, today);
  const live = usable(items, today);

  const list: Essential[] = [
    {
      key: "water",
      label: "Water",
      met: water.amount >= t.waterGal,
      detail: `${fmt(water.amount)} / ${t.waterGal} gal`,
      need: `${fmt(Math.max(0, t.waterGal - water.amount))} more gal of potable water`,
      current: water.amount,
      target: t.waterGal,
    },
    {
      key: "food",
      label: "Food",
      met: food.amount >= t.meals,
      detail: `${fmt(food.amount)} / ${t.meals} meals`,
      need: `${fmt(Math.max(0, t.meals - food.amount))} more meals (shelf-stable)`,
      current: food.amount,
      target: t.meals,
    },
  ];

  for (const p of PRESENCE_ESSENTIALS) {
    const count = live.filter((i) => i.category === p.category).length;
    list.push({
      key: p.key,
      label: p.label,
      met: count > 0,
      detail:
        count > 0
          ? `${count} item${count === 1 ? "" : "s"} recorded`
          : "None recorded",
      need: p.need,
    });
  }

  const plan = tasks.find((x) => x.seedKey === "plan");
  list.push({
    key: "plan",
    label: "Family plan",
    met: plan?.status === "complete",
    detail: plan
      ? plan.status === "complete"
        ? "Plan task complete"
        : "Plan task open"
      : "No plan task",
    need: "Complete the evacuation & communications plan task",
  });

  return list;
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
