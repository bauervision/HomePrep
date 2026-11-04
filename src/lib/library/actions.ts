/*
 * Library actions: links from an authority-supported card to an editable task
 * or goal draft in the household workspaces. The Library itself never writes
 * household data; the Tasks and Goals pages open their usual forms prefilled,
 * and nothing is saved until the household saves it there.
 *
 * Mappings are explicit and keyed by stable IDs. A card's milestone
 * associations are informational and are never used to pick a goal.
 */

import type { GuidanceEntry } from "./types";

/** Every draft goes to the 72-hour workspace; its goals cover every topic. */
export const DRAFT_MILESTONE = "72h";

/** Built-in goal (essential key) a topic's goal drafts are added to. */
export const TOPIC_GOAL: Record<string, string> = {
  water: "water",
  food: "food",
  power: "power",
  sanitation: "sanitation",
  communications: "comms",
  shelter: "plan",
};

/** Task category a topic's task drafts start with (editable in the form). */
export const TOPIC_TASK_CATEGORY: Record<string, string> = {
  water: "Water",
  food: "Food",
  power: "Power",
  sanitation: "Sanitation",
  communications: "Communications",
  shelter: "Evacuation",
};

/**
 * Cards that a built-in requirement already covers: these offer "View
 * existing goal" instead of "Create Goal". Only clear one-to-one matches.
 */
export const CARD_REQUIREMENT: Record<
  string,
  { milestone: string; goal: string; requirement: string }
> = {
  "HP-W01": { milestone: "72h", goal: "water", requirement: "water.supply" },
  "HP-W02": { milestone: "72h", goal: "water", requirement: "water.storage" },
  "HP-W03": { milestone: "72h", goal: "water", requirement: "water.storage" },
  "HP-W05": { milestone: "72h", goal: "water", requirement: "water.treatment" },
  "HP-F01": { milestone: "72h", goal: "food", requirement: "food.no-prep" },
  "HP-P01": {
    milestone: "72h",
    goal: "power",
    requirement: "72h.power.lighting",
  },
  "HP-P04": {
    milestone: "72h",
    goal: "power",
    requirement: "72h.power.generator",
  },
  "HP-S04": {
    milestone: "72h",
    goal: "sanitation",
    requirement: "72h.sanitation.toilet",
  },
  "HP-C02": {
    milestone: "72h",
    goal: "comms",
    requirement: "72h.comms.reconnect",
  },
  "HP-H01": {
    milestone: "72h",
    goal: "plan",
    requirement: "72h.plan.evacuation",
  },
  "HP-H03": {
    milestone: "72h",
    goal: "plan",
    requirement: "72h.plan.evacuation",
  },
};

export interface LibraryActions {
  /** Opens the Tasks page with a prefilled, unsaved task. */
  taskDraft: string;
  /** Opens the Goals page with a prefilled, unsaved goal (no built-in match). */
  goalDraft: string | null;
  /** The built-in goal requirement that already covers this card. */
  existingGoal: string | null;
}

const q = encodeURIComponent;

/** Link back to a card in the Library. */
export const cardUrl = (id: string) => `/library/?entry=${q(id)}`;

/** Requirement deep link in the Goals workspace. */
export const requirementUrl = (m: string, goal: string, requirement: string) =>
  `/goals/?milestone=${m}&goal=${q(goal)}&requirement=${q(requirement)}`;

/** Actions for a card, or null when it isn't eligible (no mapped topic). */
export function libraryActions(entry: GuidanceEntry): LibraryActions | null {
  if (entry.status !== "authority_supported") return null;
  const topic = entry.topic_ids.find((t) => TOPIC_GOAL[t]);
  if (!topic) return null;
  const existing = CARD_REQUIREMENT[entry.id];
  return {
    taskDraft: `/tasks/?draft=${q(entry.id)}`,
    goalDraft: existing
      ? null
      : `/goals/?milestone=${DRAFT_MILESTONE}&goal=${q(TOPIC_GOAL[topic])}&draft=${q(entry.id)}`,
    existingGoal: existing
      ? requirementUrl(existing.milestone, existing.goal, existing.requirement)
      : null,
  };
}
