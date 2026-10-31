import { describe, expect, it } from "vitest";
import {
  describeMembers,
  householdPlan,
  PROFILE_VERSION,
  profileFields,
  resolveProfile,
} from "./profile";
import type { Household } from "./types";

const NO_PETS = { dogs: 0, cats: 0, other: 0 };

describe("resolveProfile", () => {
  it("derives the member count from adults and children", () => {
    const p = resolveProfile({ adults: 2, children: 3, householdSize: 5 });
    expect(p).toMatchObject({ status: "complete", memberCount: 5 });
    expect(describeMembers(p)).toBe("5 people (2 adults, 3 children)");
  });

  it("prefers the counts over a stale total", () => {
    expect(
      resolveProfile({ adults: 1, children: 2, householdSize: 5 }).memberCount,
    ).toBe(3);
  });

  it("reports a missing size instead of assuming one", () => {
    const p = resolveProfile({});
    expect(p).toMatchObject({ status: "missing", memberCount: null });
    expect(describeMembers(p)).toBe("Household size not set");
  });

  it("drops unknown considerations from older or edited documents", () => {
    const p = resolveProfile({
      householdSize: 2,
      considerations: ["infants", "bogus" as never],
    });
    expect(p.considerations).toEqual(["infants"]);
  });
});

describe("profileFields", () => {
  it("writes the derived total alongside the counts", () => {
    expect(
      profileFields({
        adults: 2,
        children: 7,
        pets: { dogs: 1, cats: 0, other: 0 },
        considerations: ["olderAdults", "olderAdults"],
      }),
    ).toEqual({
      adults: 2,
      children: 7,
      householdSize: 9,
      pets: { dogs: 1, cats: 0, other: 0 },
      considerations: ["olderAdults"],
      profileVersion: PROFILE_VERSION,
    });
  });

  it("stores no pet record when there are no pets", () => {
    expect(
      profileFields({
        adults: 3,
        children: 0,
        pets: NO_PETS,
        considerations: [],
      }).pets,
    ).toBeNull();
  });

  it("enforces the same bounds as the security rules", () => {
    const base = { pets: NO_PETS, considerations: [] };
    expect(() => profileFields({ ...base, adults: 0, children: 3 })).toThrow();
    expect(() => profileFields({ ...base, adults: 1, children: -1 })).toThrow();
    expect(() =>
      profileFields({ ...base, adults: 20, children: 11 }),
    ).toThrow();
    expect(() =>
      profileFields({ ...base, adults: 1.5, children: 0 }),
    ).toThrow();
  });
});

describe("householdPlan", () => {
  it("passes custom targets through untouched", () => {
    const h = {
      id: "h",
      name: "h",
      ownerUid: "u",
      householdSize: 5,
      targetOverrides: { "72h": { water: 30 } },
    } as Household;
    expect(householdPlan(h)).toEqual({
      memberCount: 5,
      overrides: { "72h": { water: 30 } },
    });
  });
});
