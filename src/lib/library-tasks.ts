import {
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { cardUrl } from "./library/actions";
import { normalizeTaskDraft, type TaskDraft } from "./tasks";
import type { Task } from "./types";

/** Exact stored source links only; never infer provenance from titles. */
export function isTaskFromCard(task: Task, cardId: string): boolean {
  if (task.libraryEntryId) return task.libraryEntryId === cardId;
  const legacy = task as Task & {
    sourceUrl?: string;
    sourceLink?: string;
    librarySourceUrl?: string;
  };
  const links = [
    legacy.sourceUrl,
    legacy.sourceLink,
    legacy.librarySourceUrl,
    ...(task.notes?.match(
      /(?:https?:\/\/[^\s<>"()]+)?\/library\/\?entry=[^\s<>"()]+/g,
    ) ?? []),
  ];
  return links.some((link) => {
    if (!link) return false;
    try {
      const origin =
        typeof window === "undefined"
          ? "https://homeprep.local"
          : window.location.origin;
      const url = new URL(link, origin);
      return (
        url.origin === origin &&
        url.pathname === "/library/" &&
        url.search === new URL(cardUrl(cardId), origin).search &&
        !url.hash
      );
    } catch {
      return false;
    }
  });
}

const words = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
/** Compare explicit completion outcomes when available, ignoring ancillary notes. */
export function libraryTaskOutcome(
  d: Pick<TaskDraft, "title" | "notes">,
): string {
  const checks = d.notes
    .split("\n")
    .filter((line) => /^\s*Done when:/i.test(line));
  const text = checks.length
    ? checks.join("\n")
    : d.notes
        .replace(/From the HomePrep Library[^\n]*/gi, "")
        .replace(/(?:https?:\/\/[^\s]+)?\/library\/\?entry=[^\s]+/g, "");
  return words(text) || words(d.title);
}

export async function createLibraryTask(
  hid: string,
  cardId: string,
  values: TaskDraft,
) {
  const draft = normalizeTaskDraft(values);
  const firestore = db();
  const col = collection(firestore, "households", hid, "tasks");
  const outcome = libraryTaskOutcome(draft);
  const existing = await getDocs(col);
  if (
    existing.docs.some((s) => {
      const t = { ...s.data(), id: s.id } as Task;
      return isTaskFromCard(t, cardId) && libraryTaskOutcome(t) === outcome;
    })
  )
    throw new Error(
      "An identical task from this Library card already exists. View it or describe a distinct outcome.",
    );
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(cardId + "\n" + outcome),
  );
  const digest = Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const ref = doc(col, "library-" + digest);
  // Concurrent saves of the same outcome contend on one household document.
  await runTransaction(firestore, async (tx) => {
    if ((await tx.get(ref)).exists())
      throw new Error(
        "An identical task from this Library card already exists.",
      );
    tx.set(ref, {
      ...draft,
      libraryEntryId: cardId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}
