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
import { useMemo, useState, type FormEvent } from "react";
import { Comments } from "@/components/Comments";
import { useHousehold } from "@/components/SessionProvider";
import {
  Badge,
  Button,
  Card,
  cx,
  Empty,
  ErrorText,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { sortTasks, useTasks } from "@/lib/data";
import { db } from "@/lib/firebase";
import { MILESTONES } from "@/lib/readiness";
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

type Draft = Pick<
  Task,
  "title" | "notes" | "category" | "milestone" | "priority" | "status"
>;

const PRIORITY_TONE = { 1: "bad", 2: "warn", 3: "neutral" } as const;

function TaskForm({
  initial,
  onDone,
}: {
  initial: Task | null;
  onDone: () => void;
}) {
  const { household } = useHousehold();
  const [d, setD] = useState<Draft>(() =>
    initial
      ? {
          title: initial.title,
          notes: initial.notes,
          category: initial.category,
          milestone: initial.milestone,
          priority: initial.priority,
          status: initial.status,
        }
      : {
          title: "",
          notes: "",
          category: "Water",
          milestone: "72h",
          priority: 2,
          status: "todo",
        },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setD((p) => ({ ...p, [k]: v }));
  const col = collection(db(), "households", household.id, "tasks");

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      ...d,
      title: d.title.trim(),
      notes: d.notes.trim(),
      updatedAt: serverTimestamp(),
    };
    try {
      if (initial) await updateDoc(doc(col, initial.id), payload);
      else await addDoc(col, { ...payload, createdAt: serverTimestamp() });
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
      <Field label="Task">
        <Input
          required
          maxLength={160}
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
          maxLength={2000}
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
            {initial ? "Save" : "Add task"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export default function TasksPage() {
  const { household } = useHousehold();
  const { data, loading, error } = useTasks();
  const [milestone, setMilestone] = useState<MilestoneKey | "all">("all");
  const [showDone, setShowDone] = useState(true);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      sortTasks(data).filter(
        (t) =>
          (milestone === "all" || t.milestone === milestone) &&
          (showDone || t.status !== "complete"),
      ),
    [data, milestone, showDone],
  );
  const current =
    editing && editing !== "new"
      ? (data.find((t) => t.id === editing) ?? null)
      : null;
  const done = data.filter((t) => t.status === "complete").length;

  async function setStatus(t: Task, status: TaskStatus) {
    setRowError(null);
    try {
      await updateDoc(doc(db(), "households", household.id, "tasks", t.id), {
        status,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      setRowError((err as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Tasks"
        sub={`${done} of ${data.length} complete`}
        action={
          <Button
            variant="copper"
            icon={Plus}
            onClick={() => setEditing("new")}
          >
            Add task
          </Button>
        }
      />
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Select
            className="w-auto"
            value={milestone}
            onChange={(e) =>
              setMilestone(e.target.value as MilestoneKey | "all")
            }
          >
            <option value="all">All milestones</option>
            {MILESTONES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-1.5 text-sm text-sage">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
            />
            Show complete
          </label>
        </div>
        <ErrorText>{error || rowError}</ErrorText>
        {loading ? (
          <Empty>Loading…</Empty>
        ) : rows.length === 0 ? (
          <Empty>No tasks.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((t) => (
              <li key={t.id} className="flex items-center gap-2 py-2">
                <Badge tone={PRIORITY_TONE[t.priority]}>
                  {PRIORITY_LABEL[t.priority]}
                </Badge>
                <button
                  type="button"
                  onClick={() => setEditing(t.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span
                    className={cx(
                      "block truncate text-sm hover:text-copper-light",
                      t.status === "complete"
                        ? "text-slate line-through"
                        : "text-ivory",
                    )}
                  >
                    {t.title}
                  </span>
                  <span className="block truncate text-[11px] text-slate">
                    {MILESTONES.find((m) => m.key === t.milestone)?.label} ·{" "}
                    {t.category}
                  </span>
                </button>
                <Select
                  aria-label="Status"
                  className="h-8 w-32 shrink-0 text-xs"
                  value={t.status}
                  onChange={(e) => setStatus(t, e.target.value as TaskStatus)}
                >
                  {Object.entries(TASK_STATUS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New task" : "Task"}
        wide
      >
        {editing === "new" && (
          <TaskForm key="new" initial={null} onDone={() => setEditing(null)} />
        )}
        {current && (
          <div className="space-y-4">
            <TaskForm
              key={current.id}
              initial={current}
              onDone={() => setEditing(null)}
            />
            <div className="border-t border-line pt-3">
              <Comments parent="tasks" parentId={current.id} />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
