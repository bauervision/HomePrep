import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BASELINE_BY_ID,
  BASELINE_VERSION,
  baselineFor,
  defVersion,
} from "./baseline";
import { evaluateRequirement, MAX_EXPLANATION, MAX_TITLE } from "./checklist";
import {
  CARD_REQUIREMENT,
  libraryActions,
  TOPIC_GOAL,
  TOPIC_TASK_CATEGORY,
} from "./library/actions";
import { LIBRARY_VERSION } from "./library/types";
import { parseGuidance } from "./library/validate";
import { goalDraftFromCard, taskDraftFromCard } from "./library-drafts";
import { baselineReview, OBJECTIVE_ESSENTIALS } from "./readiness";
import { TASK_TITLE_MAX } from "./tasks";
import { CATEGORIES } from "./types";

const g = parseGuidance(
  JSON.parse(
    readFileSync(
      `public/library-data/v${LIBRARY_VERSION}/guidance.json`,
      "utf8",
    ),
  ),
);

describe("Library action mappings", () => {
  it("map every card to an existing built-in requirement or goal", () => {
    for (const [card, m] of Object.entries(CARD_REQUIREMENT)) {
      expect(
        g.entries.some((e) => e.id === card),
        card,
      ).toBe(true);
      const def = BASELINE_BY_ID.get(m.requirement);
      expect(def, m.requirement).toBeTruthy();
      expect(def!.goal).toBe(m.goal);
      expect(def!.milestones).toContain(m.milestone);
    }
    const keys = OBJECTIVE_ESSENTIALS["72h"].map((d) => d.key);
    for (const [topic, goal] of Object.entries(TOPIC_GOAL)) {
      if (topic === "shelter") expect(goal).toBe("library-shelter");
      else expect(keys).toContain(goal);
    }
    for (const c of Object.values(TOPIC_TASK_CATEGORY))
      expect(CATEGORIES as readonly string[]).toContain(c);
  });

  it("offer a task and either an existing goal or a goal draft on every card", () => {
    for (const e of g.entries) {
      const a = libraryActions(e)!;
      expect(a, e.id).toBeTruthy();
      expect(a.taskDraft).toBe(`/tasks/?draft=${e.id}`);
      expect(!!a.goalDraft !== !!a.existingGoal, e.id).toBe(true);
    }
    expect(libraryActions(g.entries.find((e) => e.id === "HP-C02")!)).toEqual({
      taskDraft: "/tasks/?draft=HP-C02",
      goalDraft: null,
      existingGoal:
        "/goals/?milestone=72h&goal=comms&requirement=72h.comms.reconnect",
    });
  });

  it("build drafts that fit the forms' limits and keep provenance", () => {
    for (const e of g.entries) {
      const t = taskDraftFromCard(e);
      expect(t.title.length).toBeLessThanOrEqual(TASK_TITLE_MAX);
      expect(t.status).toBe("todo");
      for (const step of e.card.steps) expect(t.notes).toContain(step);
      for (const r of e.card.completion.requires)
        expect(t.notes).toContain(`Done when: ${r}`);
      const goal = goalDraftFromCard(e);
      expect(goal.title.length).toBeLessThanOrEqual(MAX_TITLE);
      expect(goal.explanation.length).toBeLessThanOrEqual(MAX_EXPLANATION);
      expect(goal.notes.length).toBeLessThanOrEqual(MAX_EXPLANATION);
      expect(goal.notes).toMatch(/^From the HomePrep Library/);
      expect(goal.libraryEntryId).toBe(e.id);
    }
  });
});

describe("Agree how you’ll reach each other (updated in place)", () => {
  const def = BASELINE_BY_ID.get("72h.comms.reconnect")!;

  it("keeps its ID and goal and covers the full reconnection plan", () => {
    expect(def.goal).toBe("comms");
    expect(def.title).toBe("Agree how you’ll reach each other");
    for (const part of [
      /backup method/,
      /two accessible meeting places/,
      /route/,
      /picked up or helped/,
      /place or route is unsafe/,
    ])
      expect(def.explanation).toMatch(part);
    expect(def.action).toMatch(/Record the plan/);
    expect(def.action).toMatch(/everyone in your household knows it/);
    // Same completion rule: the household confirms it.
    expect(def.completion).toEqual({
      mode: "any",
      conditions: [{ kind: "attest" }],
    });
    expect(def.sources).toEqual(["readyPlan", "cdcConnected"]);
    expect(defVersion(def)).toBe(BASELINE_VERSION);
  });

  it("keeps a household's wording, notes and completion", () => {
    const at = "2026-10-20T12:00:00.000Z";
    const record = {
      text: { title: "How the Bauers find each other" },
      notes: "Meet at the library.",
      confirmed: { by: "Alex", at },
      updatedAt: at,
    };
    const r = evaluateRequirement(def, def.id, record, {
      items: [],
      tasks: [],
      today: "2026-11-04",
      quantity: {},
    });
    expect(r.status).toBe("confirmed");
    expect(r.satisfied).toBe(true);
    expect(r.def.title).toBe("How the Bauers find each other");
    expect(r.record?.notes).toBe("Meet at the library.");
  });

  it("asks a household that reviewed the earlier version to review the change", () => {
    const defs = baselineFor("72h", "comms");
    const checklist = {
      complete: false,
      core: { applicable: 3, done: 1 },
    } as Parameters<typeof baselineReview>[5];
    const review = baselineReview(
      "72h",
      "comms",
      defs,
      { "72h.comms": { version: 2, at: "2026-10-01", by: "Alex" } },
      null,
      checklist,
    )!;
    expect(review.version).toBe(3);
    expect(review.changes).toEqual([
      expect.objectContaining({
        id: "72h.comms.reconnect",
        kind: "changed",
        note: expect.stringMatching(/two accessible meeting places/),
      }),
    ]);
    // A met goal keeps its completion; nothing to review.
    expect(
      baselineReview(
        "72h",
        "comms",
        defs,
        { "72h.comms": { version: 2, at: "2026-10-01", by: "Alex" } },
        null,
        { ...checklist, complete: true },
      ),
    ).toBeNull();
  });
});
