import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock(
  "firebase/firestore",
  async () => (await import("@/test/fake-firestore")).firestoreModule,
);
vi.mock(
  "./firebase",
  async () => (await import("@/test/fake-firestore")).firebaseModule,
);
import { fakeDb } from "@/test/fake-firestore";
import { LIBRARY_CATEGORIES, libraryDestination } from "./goal-destinations";
import { saveLibraryGoal } from "./library-goals";
import { householdCategoryGoals } from "./household-goal-view";
import { objectiveEssentials } from "./readiness";
import type { Household, LibraryCategoryId, MilestoneKey } from "./types";

const milestones: MilestoneKey[] = ["72h", "7d", "30d", "60d", "90d"];
const options = {
  libraryEntryId: "HP-C04",
  notes: "Done when: support contact receives the message.",
};
const home = () => fakeDb.get("households/h1") as unknown as Household;
beforeEach(() => {
  fakeDb.reset();
  fakeDb.set("households/h1", {
    householdSize: 2,
    requirementState: {
      "72h.plan.evacuation": {
        confirmed: { by: "Alex", at: "2026-11-01" },
        notes: "Our existing shelter plan",
        updatedAt: "2026-11-01",
      },
    },
  });
});

describe("Library category destination persistence", () => {
  it("saves every category at every milestone, reusing compatible built-ins and stable household destinations", async () => {
    const originalPlan = structuredClone(
      home().requirementState!["72h.plan.evacuation"],
    );
    for (const categoryId of Object.keys(
      LIBRARY_CATEGORIES,
    ) as LibraryCategoryId[]) {
      for (const milestone of milestones) {
        const dest = libraryDestination(categoryId, milestone);
        const id = `custom-${categoryId}-${milestone}`;
        await saveLibraryGoal(
          "h1",
          id,
          categoryId,
          milestone,
          "Practice",
          "Observable outcome",
          options,
        );
        await saveLibraryGoal(
          "h1",
          id,
          categoryId,
          milestone,
          "Practice",
          "Observable outcome",
          options,
        );
        expect(home().requirementState![id].custom).toMatchObject({
          milestone,
          goal: dest.key,
        });
        expect(home().requirementState![id].confirmed).toBeUndefined();
        if (dest.builtIn) {
          expect(home().goalDestinations?.[dest.storageKey]).toBeUndefined();
          expect(
            objectiveEssentials(
              milestone,
              [],
              [],
              { memberCount: 2, requirements: home().requirementState },
              "2026-11-04",
            ).some((e) => e.key === dest.key),
          ).toBe(true);
        } else {
          expect(home().goalDestinations![dest.storageKey]).toEqual({
            milestone,
            categoryId,
          });
          const e = householdCategoryGoals(
            home(),
            milestone,
            [],
            [],
            "2026-11-04",
          ).find((e) => e.key === dest.key)!;
          expect(e.label).toBe(LIBRARY_CATEGORIES[categoryId]);
          expect(e.met).toBe(false);
          expect(e.checklist.requirements).toHaveLength(1);
        }
      }
    }
    expect(Object.keys(home().requirementState!)).toHaveLength(31);
    expect(home().requirementState!["72h.plan.evacuation"]).toEqual(
      originalPlan,
    );
  });

  it("commits no destination or goal on invalid input or a failed save, then retries without duplicates", async () => {
    const before = structuredClone(home());
    await expect(
      saveLibraryGoal("h1", "custom-invalid", "shelter", "7d", "", "", options),
    ).rejects.toThrow();
    expect(home()).toEqual(before);
    fakeDb.failNext("commit");
    await expect(
      saveLibraryGoal(
        "h1",
        "custom-retry",
        "shelter",
        "7d",
        "Backup place",
        "Check access",
        options,
      ),
    ).rejects.toThrow();
    expect(home()).toEqual(before);
    await Promise.all([
      saveLibraryGoal(
        "h1",
        "custom-retry",
        "shelter",
        "7d",
        "Backup place",
        "Check access",
        options,
      ),
      saveLibraryGoal(
        "h1",
        "custom-retry",
        "shelter",
        "7d",
        "Backup place",
        "Check access",
        options,
      ),
      saveLibraryGoal(
        "h1",
        "custom-other",
        "shelter",
        "7d",
        "Alternate place",
        "Check transport",
        options,
      ),
    ]);
    expect(Object.keys(home().goalDestinations!)).toEqual([
      "7d:library-shelter",
    ]);
    expect(Object.keys(home().requirementState!)).toHaveLength(3);
  });

  it("keeps household-only destinations out of built-in readiness and uses existing custom completion rules", async () => {
    const baseline = objectiveEssentials("30d", [], [], 2, "2026-11-04");
    await saveLibraryGoal(
      "h1",
      "custom-test",
      "communications",
      "30d",
      "Check-in",
      "Received",
      options,
    );
    expect(
      objectiveEssentials(
        "30d",
        [],
        [],
        { memberCount: 2, requirements: home().requirementState },
        "2026-11-04",
      ),
    ).toEqual(baseline);
    const h = home();
    h.requirementState!["custom-test"].confirmed = {
      by: "Alex",
      at: "2026-11-04",
    };
    expect(householdCategoryGoals(h, "30d", [], [], "2026-11-04")[0].met).toBe(
      true,
    );
  });
});
