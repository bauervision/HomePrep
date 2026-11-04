/*
 * Editable drafts from Library cards. A draft is only form state: building
 * one writes nothing, and the household reviews and saves it through the usual
 * task or goal form (same permissions and validation). The card's ID travels
 * with the saved record so it can link back to the card; provenance and limits
 * are kept in the text. No draft carries completion or readiness credit.
 */

import { isLibraryCategory } from "./goal-destinations";
import type { LibraryCategoryId } from "./types";
import { MAX_EXPLANATION, MAX_TITLE } from "./checklist";
import { TOPIC_TASK_CATEGORY } from "./library/actions";
import type { GuidanceEntry } from "./library/types";
import { DEFAULT_TASK_DRAFT, TASK_TITLE_MAX, type TaskDraft } from "./tasks";
import { CATEGORIES, type Category } from "./types";

export interface GoalDraft {
  title: string;
  explanation: string;
  notes: string;
  libraryEntryId: string;
  libraryCategoryId: LibraryCategoryId;
}

const PROVENANCE =
  "From the HomePrep Library (authority-supported guidance). Check the card for its sources and limits.";

const clip = (s: string, max: number) =>
  s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;

const numbered = (items: string[]) =>
  items.map((s, i) => `${i + 1}. ${s}`).join("\n");

/**
 * Joins sections in order, dropping trailing lines of a section that would
 * exceed `max`; when anything is left out, `more` is appended.
 */
function fit(sections: string[][], max: number, more: string): string {
  const out: string[] = [];
  let cut = false;
  const size = (lines: string[]) => lines.join("\n").length;
  for (const lines of sections) {
    if (lines.length === 0) continue;
    for (const line of lines) {
      const next = [...out, line];
      if (size(next) + (more.length + 1) > max) {
        cut = true;
        break;
      }
      out.push(line);
    }
    if (cut) break;
    out.push("");
  }
  while (out.at(-1) === "") out.pop();
  return cut ? `${out.join("\n")}\n${more}`.trim() : out.join("\n");
}

const doneWhen = (e: GuidanceEntry) =>
  e.card.completion.requires.map((r) => `Done when: ${r}`);

const taskCategory = (e: GuidanceEntry): Category => {
  const c = e.topic_ids.map((t) => TOPIC_TASK_CATEGORY[t]).find(Boolean);
  return (CATEGORIES as readonly string[]).includes(c ?? "")
    ? (c as Category)
    : DEFAULT_TASK_DRAFT.category;
};

/** Task form values for a card: title, steps, completion check and limits. */
export function taskDraftFromCard(e: GuidanceEntry): TaskDraft {
  const notes = [
    "Steps:",
    numbered(e.card.steps),
    "",
    ...doneWhen(e),
    ...(e.card.limits.length
      ? ["", "Limits:", ...e.card.limits.map((l) => `- ${l}`)]
      : []),
    "",
    `${PROVENANCE} (${e.title})`,
  ].join("\n");
  return {
    ...DEFAULT_TASK_DRAFT,
    title: clip(e.title, TASK_TITLE_MAX),
    category: taskCategory(e),
    notes,
  };
}

/**
 * Goal form values for a card. The description is the completion check; the
 * notes hold as many steps and limits as fit the form's limits.
 */
export function goalDraftFromCard(e: GuidanceEntry): GoalDraft {
  const more = "More on the Library card.";
  const categoryId = e.topic_ids.find(isLibraryCategory);
  if (!categoryId)
    throw new Error("This card has no supported Library category.");
  return {
    title: clip(e.title, MAX_TITLE),
    explanation: fit([doneWhen(e)], MAX_EXPLANATION, more),
    notes: fit(
      [
        [PROVENANCE],
        ["Steps:", ...e.card.steps.map((s, i) => `${i + 1}. ${s}`)],
        e.card.limits.length
          ? ["Limits:", ...e.card.limits.map((l) => `- ${l}`)]
          : [],
      ],
      MAX_EXPLANATION,
      more,
    ),
    libraryEntryId: e.id,
    libraryCategoryId: categoryId,
  };
}
