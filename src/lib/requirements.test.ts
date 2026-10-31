import { describe, expect, it } from "vitest";
import { householdPlan, resolveProfile } from "./profile";
import { MILESTONES, objectiveEssentials, targets } from "./readiness";
import {
  parseTargetInput,
  QUANTITY_POLICIES,
  recommendationFormula,
  recommendedAmount,
  resolveTarget,
  withOverride,
  type QuantityPolicy,
} from "./requirements";
import type { Household } from "./types";

const TODAY = "2026-10-31";
const DAYS = { "72h": 3, "7d": 7, "30d": 30, "60d": 60, "90d": 90 } as const;

describe("recommended baselines", () => {
  it.each([
    [3, 9, 27],
    [5, 15, 45],
    [9, 27, 81],
  ])("%i people for 72 hours: %i gal, %i meals", (n, gal, meals) => {
    expect(targets(n, 3)).toEqual({ waterGal: gal, meals });
  });

  it("scales every milestone for 3, 5 and 9 people", () => {
    for (const n of [3, 5, 9]) {
      for (const m of MILESTONES) {
        expect(m.days).toBe(DAYS[m.key]);
        expect(resolveTarget("water", m, n).recommended).toBe(n * m.days);
        expect(resolveTarget("food", m, n).recommended).toBe(3 * n * m.days);
      }
    }
  });

  it("does not multiply per-household or per-day requirements by people", () => {
    const base = { ...QUANTITY_POLICIES.water, rate: 2 };
    const perHousehold: QuantityPolicy = { ...base, basis: "per-household" };
    const perDay: QuantityPolicy = { ...base, basis: "per-day" };
    const perPerson: QuantityPolicy = { ...base, basis: "per-person" };
    expect(recommendedAmount(perHousehold, 9, 30)).toBe(2);
    expect(recommendedAmount(perDay, 9, 30)).toBe(60);
    expect(recommendedAmount(perPerson, 9, 30)).toBe(18);
    expect(recommendedAmount(perHousehold, null, 30)).toBe(2);
  });

  it("explains the calculation", () => {
    expect(recommendationFormula(QUANTITY_POLICIES.water, 5, 3)).toBe(
      "1 gal × 5 people × 3 days",
    );
  });
});

describe("household targets", () => {
  const m72 = MILESTONES[0];

  it("uses the recommendation until a custom target is set", () => {
    expect(resolveTarget("water", m72, 5)).toEqual({
      recommended: 15,
      override: null,
      target: 15,
      source: "recommended",
    });
  });

  it("keeps a custom target when the household size changes", () => {
    const overrides = withOverride(undefined, "72h", "water", 40);
    const five = resolveTarget("water", m72, { memberCount: 5, overrides });
    const nine = resolveTarget("water", m72, { memberCount: 9, overrides });
    expect(five).toMatchObject({
      recommended: 15,
      target: 40,
      source: "custom",
    });
    expect(nine).toMatchObject({
      recommended: 27,
      target: 40,
      source: "custom",
    });
    // Other milestones and requirements still follow the recommendation.
    expect(
      resolveTarget("food", m72, { memberCount: 9, overrides }).target,
    ).toBe(81);
    expect(
      resolveTarget("water", MILESTONES[1], { memberCount: 9, overrides })
        .target,
    ).toBe(63);
  });

  it("resets an override to the calculated recommendation", () => {
    const set = withOverride(undefined, "72h", "water", 40);
    const withFood = withOverride(set, "72h", "food", 60);
    const reset = withOverride(withFood, "72h", "water", null);
    expect(reset).toEqual({ "72h": { food: 60 } });
    expect(withOverride(reset, "72h", "food", null)).toEqual({});
    expect(
      resolveTarget("water", m72, { memberCount: 5, overrides: reset }),
    ).toMatchObject({ target: 15, source: "recommended" });
    // Pure: the input map is not modified.
    expect(set).toEqual({ "72h": { water: 40 } });
  });

  it("ignores invalid stored overrides", () => {
    const overrides = { "72h": { water: -3 } };
    expect(
      resolveTarget("water", m72, { memberCount: 5, overrides }).source,
    ).toBe("recommended");
  });

  it("validates typed targets", () => {
    expect(parseTargetInput("20")).toBe(20);
    expect(parseTargetInput("12.345")).toBe(12.35);
    expect(() => parseTargetInput("")).toThrow();
    expect(() => parseTargetInput("-1")).toThrow();
    expect(() => parseTargetInput("abc")).toThrow();
  });
});

describe("missing or incomplete household profile", () => {
  it("calculates nothing and asks for the size when no size is recorded", () => {
    const plan = householdPlan({} as Household);
    expect(plan.memberCount).toBeNull();
    const water = objectiveEssentials("72h", [], [], plan, TODAY)[0];
    expect(water.met).toBe(false);
    expect(water.target).toBeUndefined();
    expect(water.need).toMatch(/household size/);
    expect(resolveTarget("water", MILESTONES[0], plan)).toMatchObject({
      recommended: null,
      target: null,
      source: "unknown",
    });
  });

  it("keeps a custom target usable even when the size is unknown", () => {
    const plan = {
      memberCount: null,
      overrides: withOverride(undefined, "72h", "water", 10),
    };
    expect(resolveTarget("water", MILESTONES[0], plan).target).toBe(10);
  });

  it("uses a legacy recorded total without inventing a split", () => {
    const p = resolveProfile({ householdSize: 5 });
    expect(p).toMatchObject({
      status: "total-only",
      memberCount: 5,
      adults: null,
      children: null,
    });
  });
});
