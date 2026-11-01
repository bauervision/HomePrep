import type {
  BaselineReviews,
  MilestoneKey,
  RequirementState,
  TargetOverrides,
} from "./types";

/*
 * Preparedness requirements
 * -------------------------
 * Three separate concepts:
 *   1. Recommended baseline — calculated here from the policy below.
 *   2. Household target     — an explicit household override, else the baseline.
 *   3. Current inventory    — recorded supplies (lib/quantities.ts).
 * Changing household size changes (1) only. Overrides are never rewritten by a
 * size change, and inventory is never touched. A policy entry declares how it
 * scales, so later research-backed policies can replace or extend these
 * without changing callers.
 */

export type RequirementBasis =
  | "per-person-per-day"
  | "per-person"
  | "per-household"
  | "per-day"
  | "capability"
  | "planning"
  | "custom";

export const BASIS_LABEL: Record<RequirementBasis, string> = {
  "per-person-per-day": "Per person, per day",
  "per-person": "Per person",
  "per-household": "Per household",
  "per-day": "Per day",
  capability: "Equipment / capability",
  planning: "Planning / documentation",
  custom: "Custom / manual",
};

export interface QuantityPolicy {
  id: string;
  label: string;
  basis: Exclude<RequirementBasis, "capability" | "planning" | "custom">;
  /** Amount per basis unit (e.g. 1 gal per person per day). */
  rate: number;
  unit: string;
  unitLong: string;
  /** Plain statement of where the number comes from. */
  source: string;
  assumptions: string;
}

/** Initial planning baselines — not nutritional or medical requirements. */
export const QUANTITY_POLICIES = {
  water: {
    id: "water",
    label: "Water",
    basis: "per-person-per-day",
    rate: 1,
    unit: "gal",
    unitLong: "gallons",
    source: "Planning baseline: 1 gallon per person per day (Ready.gov).",
    assumptions:
      "Stored drinking and basic hygiene water only. Filters and treatment equipment are capabilities and are not counted as stored water. Hot climates, pregnancy, illness and pets may need more.",
  },
  food: {
    id: "food",
    label: "Food",
    basis: "per-person-per-day",
    rate: 3,
    unit: "meals",
    unitLong: "meals",
    source: "Planning baseline: 3 meal-equivalents per person per day.",
    assumptions:
      "Counts recorded meals or person-days (1 person-day = 3 meals). Packages count only when you record how many meals each contains. Not a nutritional assessment.",
  },
} as const satisfies Record<string, QuantityPolicy>;

export type QuantityRequirementId = keyof typeof QUANTITY_POLICIES;

export function isQuantityRequirement(id: string): id is QuantityRequirementId {
  return id in QUANTITY_POLICIES;
}

/** Recommended amount, or null when the basis needs an unknown member count. */
export function recommendedAmount(
  policy: QuantityPolicy,
  memberCount: number | null,
  days: number,
): number | null {
  switch (policy.basis) {
    case "per-person-per-day":
      return memberCount === null ? null : policy.rate * memberCount * days;
    case "per-person":
      return memberCount === null ? null : policy.rate * memberCount;
    case "per-day":
      return policy.rate * days;
    case "per-household":
      return policy.rate;
  }
}

/** "1 gal × 5 people × 3 days" */
export function recommendationFormula(
  policy: QuantityPolicy,
  memberCount: number | null,
  days: number,
) {
  const people =
    memberCount === null
      ? "household size"
      : `${memberCount} ${memberCount === 1 ? "person" : "people"}`;
  const d = `${days} ${days === 1 ? "day" : "days"}`;
  const r = `${policy.rate} ${policy.unit}`;
  switch (policy.basis) {
    case "per-person-per-day":
      return `${r} × ${people} × ${d}`;
    case "per-person":
      return `${r} × ${people}`;
    case "per-day":
      return `${r} × ${d}`;
    case "per-household":
      return `${r} per household`;
  }
}

/** Planning context derived from the household profile. */
export interface Plan {
  memberCount: number | null;
  overrides?: TargetOverrides;
  /** Household requirement records (lib/checklist.ts). */
  requirements?: RequirementState;
  /** Baseline versions the household acknowledged, per goal. */
  reviews?: BaselineReviews;
}

/** A bare number is treated as a member count with no custom targets. */
export type PlanInput = number | Plan;

export const toPlan = (p: PlanInput): Plan =>
  typeof p === "number" ? { memberCount: p } : p;

export interface ResolvedTarget {
  recommended: number | null;
  /** Custom household target, if one is set. */
  override: number | null;
  /** What progress is measured against: the override, else the recommendation. */
  target: number | null;
  source: "custom" | "recommended" | "unknown";
}

export function validOverride(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

export function resolveTarget(
  id: QuantityRequirementId,
  milestone: { key: MilestoneKey; days: number },
  plan: PlanInput,
): ResolvedTarget {
  const p = toPlan(plan);
  const recommended = recommendedAmount(
    QUANTITY_POLICIES[id],
    p.memberCount,
    milestone.days,
  );
  const raw = p.overrides?.[milestone.key]?.[id];
  const override = validOverride(raw) ? raw : null;
  if (override !== null)
    return { recommended, override, target: override, source: "custom" };
  if (recommended !== null)
    return {
      recommended,
      override,
      target: recommended,
      source: "recommended",
    };
  return { recommended, override, target: null, source: "unknown" };
}

export const MAX_TARGET = 1_000_000;

/** Validates a target typed by the user. */
export function parseTargetInput(raw: string): number {
  const n = Number(raw);
  if (!raw.trim() || !Number.isFinite(n) || n < 0 || n > MAX_TARGET)
    throw new Error("Enter a target of zero or more.");
  return Math.round(n * 100) / 100;
}

/**
 * Overrides with one target set (number) or reset to the recommendation
 * (null). Pure: returns a new map and drops emptied milestones.
 */
export function withOverride(
  overrides: TargetOverrides | undefined,
  milestone: MilestoneKey,
  id: QuantityRequirementId,
  value: number | null,
): TargetOverrides {
  const next: TargetOverrides = {};
  for (const [k, v] of Object.entries(overrides ?? {}))
    if (v) next[k as MilestoneKey] = { ...v };
  const m = { ...(next[milestone] ?? {}) };
  if (value === null) delete m[id];
  else m[id] = value;
  if (Object.keys(m).length) next[milestone] = m;
  else delete next[milestone];
  return next;
}
