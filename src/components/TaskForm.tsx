"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useState, type FormEvent, type ReactNode } from "react";
import { useHousehold } from "@/components/SessionProvider";
import {
  Button,
  ErrorText,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { db } from "@/lib/firebase";
import { MILESTONES } from "@/lib/readiness";
import {
  DEFAULT_TASK_DRAFT,
  normalizeTaskDraft,
  TASK_TITLE_MAX,
  type TaskDraft,
} from "@/lib/tasks";
import {
  CATEGORIES,
  PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  type Category,
  type MilestoneKey,
  type Priority,
  type Task,
  type TaskStatus,
} from "@/lib/types";

/**
 * Create/edit a task. For creation, `prefill` seeds the form and `onCreate`
 * may replace the default save (e.g. creating a task from a note).
 */
export function TaskForm({
  initial,
  onDone,
  prefill,
  onCreate,
  hint,
  submitLabel,
}: {
  initial: Task | null;
  onDone: () => void;
  prefill?: TaskDraft;
  onCreate?: (draft: TaskDraft) => Promise<void>;
  hint?: ReactNode;
  submitLabel?: string;
}) {
  const { household } = useHousehold();
  const [d, setD] = useState<TaskDraft>(() =>
    initial
      ? {
          title: initial.title,
          notes: initial.notes,
          category: initial.category,
          milestone: initial.milestone,
          priority: initial.priority,
          status: initial.status,
        }
      : (prefill ?? DEFAULT_TASK_DRAFT),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) =>
    setD((p) => ({ ...p, [k]: v }));
  const col = collection(db(), "households", household.id, "tasks");

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    let draft: TaskDraft;
    try {
      draft = normalizeTaskDraft(d);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    setBusy(true);
    try {
      if (initial) {
        await updateDoc(doc(col, initial.id), {
          ...draft,
          updatedAt: serverTimestamp(),
        });
      } else if (onCreate) {
        await onCreate(draft);
      } else {
        await addDoc(col, {
          ...draft,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!initial || !confirm(`Delete task "${initial.title}"?`)) return;
    setBusy(true);
    try {
      await deleteDoc(doc(col, initial.id));
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      {hint}
      <Field label="Task">
        <Input
          required
          maxLength={TASK_TITLE_MAX}
          value={d.title}
          onChange={(e) => set("title", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Status">
          <Select
            value={d.status}
            onChange={(e) => set("status", e.target.value as TaskStatus)}
          >
            {Object.entries(TASK_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority">
          <Select
            value={d.priority}
            onChange={(e) =>
              set("priority", Number(e.target.value) as Priority)
            }
          >
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category">
          <Select
            value={d.category}
            onChange={(e) => set("category", e.target.value as Category)}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Milestone">
          <Select
            value={d.milestone}
            onChange={(e) => set("milestone", e.target.value as MilestoneKey)}
          >
            {MILESTONES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Notes">
        <Textarea
          rows={3}
          value={d.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex items-center justify-between gap-2">
        {initial ? (
          <Button
            variant="danger"
            icon={Trash2}
            onClick={remove}
            disabled={busy}
          >
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button onClick={onDone}>Cancel</Button>
          <Button
            type="submit"
            variant={initial ? "emerald" : "copper"}
            icon={initial ? Save : Plus}
            loading={busy}
            disabled={!d.title.trim()}
          >
            {initial ? "Save" : (submitLabel ?? "Add task")}
          </Button>
        </div>
      </div>
    </form>
  );
}
