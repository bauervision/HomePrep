import {
  collection,
  deleteDoc,
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  DEFAULT_TASK_DRAFT,
  normalizeTaskDraft,
  type TaskDraft,
} from "./tasks";
import type { Note } from "./types";

/*
 * Notes live at households/{hid}/notes/{noteId}:
 *   content, createdBy (uid), createdByName, createdAt, updatedAt, linkedTaskIds[]
 * Tasks created from a note carry `sourceNoteId`. Either side may outlive the
 * other; the UI treats missing references as removed, never as errors.
 */

export const NOTE_MAX_LENGTH = 5000;
export const NOTE_PAGE_SIZE = 50;
const TITLE_MAX = 80;

export function validateNoteContent(text: string): string {
  const content = text.trim();
  if (!content) throw new Error("Write something before saving.");
  if (content.length > NOTE_MAX_LENGTH) {
    throw new Error(
      `Notes can be up to ${NOTE_MAX_LENGTH.toLocaleString()} characters.`,
    );
  }
  return content;
}

const notesCol = (hid: string) => collection(db(), "households", hid, "notes");

/** A fresh document ID, generated client-side so a save can be retried idempotently. */
export const newNoteId = (hid: string) => doc(notesCol(hid)).id;
export const newTaskId = (hid: string) =>
  doc(collection(db(), "households", hid, "tasks")).id;

/**
 * Creates a note under a caller-chosen ID. Re-running with the same ID (retry
 * after a timeout, double submit) never creates a second note.
 */
export async function createNote(
  hid: string,
  noteId: string,
  text: string,
  author: { uid: string; name: string },
) {
  const content = validateNoteContent(text);
  const ref = doc(db(), "households", hid, "notes", noteId);
  await runTransaction(db(), async (tx) => {
    if ((await tx.get(ref)).exists()) return; // already saved
    tx.set(ref, {
      content,
      createdBy: author.uid,
      createdByName: author.name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      linkedTaskIds: [],
    });
  });
}

/** Updates content only; author, creation time and links are preserved. */
export async function updateNote(hid: string, noteId: string, text: string) {
  const content = validateNoteContent(text);
  await updateDoc(doc(db(), "households", hid, "notes", noteId), {
    content,
    updatedAt: serverTimestamp(),
  });
}

/** Deletes the note only. Linked tasks are untouched. */
export async function deleteNote(hid: string, noteId: string) {
  await deleteDoc(doc(db(), "households", hid, "notes", noteId));
}

/** First line of the note, shortened at a word boundary. */
export function taskTitleFromNote(content: string) {
  const firstLine = content.trim().split(/\r?\n/)[0].trim();
  if (firstLine.length <= TITLE_MAX) return firstLine;
  const cut = firstLine.slice(0, TITLE_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > TITLE_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Task form prefill: shortened title, full note text, existing visible defaults. */
export function taskDraftFromNote(note: Pick<Note, "content">): TaskDraft {
  return {
    ...DEFAULT_TASK_DRAFT,
    title: taskTitleFromNote(note.content),
    notes: note.content,
  };
}

/**
 * Creates a task from a note and links it, atomically. `taskId` is chosen when
 * the user opens the Create task dialog, so repeated confirms/retries of that
 * dialog are idempotent, while opening the dialog again creates a new task.
 * Returns false if this task had already been created.
 */
export async function createTaskFromNote(
  hid: string,
  noteId: string,
  taskId: string,
  draft: TaskDraft,
): Promise<boolean> {
  const task = normalizeTaskDraft(draft);
  const noteRef = doc(db(), "households", hid, "notes", noteId);
  const taskRef = doc(db(), "households", hid, "tasks", taskId);
  return runTransaction(db(), async (tx) => {
    const noteSnap = await tx.get(noteRef);
    if (!noteSnap.exists()) throw new Error("This note no longer exists.");
    if ((await tx.get(taskRef)).exists()) return false; // already created
    const linked = ((noteSnap.data() as Note).linkedTaskIds ?? []).filter(
      (id) => typeof id === "string",
    );
    tx.set(taskRef, {
      ...task,
      sourceNoteId: noteId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    // Linking is not a content edit, so updatedAt is left unchanged.
    tx.update(noteRef, {
      linkedTaskIds: linked.includes(taskId) ? linked : [...linked, taskId],
    });
    return true;
  });
}

export type NoteFilter = "all" | "unlinked" | "linked";

/** Case-insensitive text search plus the linked/unlinked filter. */
export function filterNotes(notes: Note[], query: string, filter: NoteFilter) {
  const q = query.trim().toLowerCase();
  return notes.filter((n) => {
    const linked = (n.linkedTaskIds ?? []).length > 0;
    if (filter === "linked" && !linked) return false;
    if (filter === "unlinked" && linked) return false;
    return (
      !q ||
      n.content.toLowerCase().includes(q) ||
      n.createdByName?.toLowerCase().includes(q)
    );
  });
}
