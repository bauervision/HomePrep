import type { Task } from "./types";

export type TaskDraft = Pick<
  Task,
  "title" | "notes" | "category" | "milestone" | "priority" | "status"
>;

/** Defaults the task form starts with (all visible and editable in the form). */
export const DEFAULT_TASK_DRAFT: TaskDraft = {
  title: "",
  notes: "",
  category: "Water",
  milestone: "72h",
  priority: 2,
  status: "todo",
};

export const TASK_TITLE_MAX = 160;

/** Validates like the Firestore rule (title 1–160 chars) and trims text. */
export function normalizeTaskDraft(d: TaskDraft): TaskDraft {
  const title = d.title.trim();
  if (!title) throw new Error("Task title is required.");
  if (title.length > TASK_TITLE_MAX) {
    throw new Error(
      `Task title must be ${TASK_TITLE_MAX} characters or fewer.`,
    );
  }
  return { ...d, title, notes: d.notes.trim() };
}
