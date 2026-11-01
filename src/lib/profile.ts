import type { Plan } from "./requirements";
import {
  CONSIDERATIONS,
  type Consideration,
  type Household,
  type PetInfo,
} from "./types";

/*
 * Household profile (v1)
 * ----------------------
 * The household document is the canonical profile. v1 adds optional `adults`,
 * `children`, `pets`, `considerations` and `profileVersion` alongside the
 * original `householdSize`, which is kept and always written as
 * adults + children so older clients and the security rules stay valid.
 *
 * Older households carry only `householdSize`; that recorded total is used
 * as-is ("total-only") and the household is asked to confirm its make-up.
 * Nothing is assumed when no size is recorded at all ("missing").
 */

export const PROFILE_VERSION = 1;
export const MAX_MEMBERS = 30;

export type ProfileStatus = "complete" | "total-only" | "missing";

export interface HouseholdProfile {
  status: ProfileStatus;
  adults: number | null;
  children: number | null;
  /** People the plan covers, or null when unknown. */
  memberCount: number | null;
  pets: PetInfo | null;
  considerations: Consideration[];
}

const count = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;

export function resolveProfile(
  h: Partial<
    Pick<
      Household,
      "householdSize" | "adults" | "children" | "pets" | "considerations"
    >
  >,
): HouseholdProfile {
  const adults = count(h.adults);
  const children = count(h.children);
  const legacy = count(h.householdSize);
  const pets = h.pets ?? null;
  const considerations = (h.considerations ?? []).filter(
    (c): c is Consideration => c in CONSIDERATIONS,
  );
  if (adults !== null && children !== null && adults + children > 0) {
    return {
      status: "complete",
      adults,
      children,
      memberCount: adults + children,
      pets,
      considerations,
    };
  }
  if (legacy !== null && legacy > 0) {
    return {
      status: "total-only",
      adults: null,
      children: null,
      memberCount: legacy,
      pets,
      considerations,
    };
  }
  return {
    status: "missing",
    adults: null,
    children: null,
    memberCount: null,
    pets,
    considerations,
  };
}

export interface ProfileInput {
  adults: number;
  children: number;
  pets: PetInfo;
  considerations: Consideration[];
}

const PET_MAX = 50;

/**
 * Validates profile input and returns the household fields to write. The
 * derived `householdSize` is always written with the counts it came from.
 */
export function profileFields(input: ProfileInput) {
  const { adults, children } = input;
  if (!Number.isInteger(adults) || adults < 1)
    throw new Error("At least one adult is required.");
  if (!Number.isInteger(children) || children < 0)
    throw new Error("Children must be zero or more.");
  if (adults + children > MAX_MEMBERS)
    throw new Error(`A household can have at most ${MAX_MEMBERS} people.`);
  const pets: PetInfo = { dogs: 0, cats: 0, other: 0 };
  for (const k of Object.keys(pets) as (keyof PetInfo)[]) {
    const n = input.pets[k];
    if (!Number.isInteger(n) || n < 0 || n > PET_MAX)
      throw new Error(`Pet counts must be between 0 and ${PET_MAX}.`);
    pets[k] = n;
  }
  const considerations = [...new Set(input.considerations)].filter(
    (c) => c in CONSIDERATIONS,
  );
  return {
    adults,
    children,
    householdSize: adults + children,
    pets: pets.dogs + pets.cats + pets.other > 0 ? pets : null,
    considerations,
    profileVersion: PROFILE_VERSION,
  };
}

export function describeMembers(p: HouseholdProfile) {
  if (p.memberCount === null) return "Household size not set";
  const people = `${p.memberCount} ${p.memberCount === 1 ? "person" : "people"}`;
  if (p.status !== "complete") return people;
  const parts = [`${p.adults} ${p.adults === 1 ? "adult" : "adults"}`];
  if (p.children)
    parts.push(`${p.children} ${p.children === 1 ? "child" : "children"}`);
  return `${people} (${parts.join(", ")})`;
}

/** Planning context (member count + custom targets) for the engine. */
export function householdPlan(h: Household): Plan {
  return {
    memberCount: resolveProfile(h).memberCount,
    overrides: h.targetOverrides,
    requirements: h.requirementState,
    reviews: h.baselineReviews,
  };
}
