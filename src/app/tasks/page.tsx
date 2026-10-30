"use client";

import { Plus } from "lucide-react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useMemo, useState } from "react";
import { Comments } from "@/components/Comments";
import { useHousehold } from "@/components/SessionProvider";
import { TaskForm } from "@/components/TaskForm";
import {
  Badge,
  Button,
  Card,
  cx,
  Empty,
  ErrorText,
  Modal,
  PageHeader,
  Select,
} from "@/components/ui";
import { sortTasks, useTasks } from "@/lib/data";
import { db } from "@/lib/firebase";
import { isMilestoneKey, MILESTONES } from "@/lib/readiness";
import {
  PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  type MilestoneKey,
  type Task,
  type TaskStatus,
} from "@/lib/types";

const PRIORITY_TONE = { 1: "bad", 2: "warn", 3: "neutral" } as const;

export default function TasksPage() {
  const { household } = useHousehold();
  const { data, loading, error } = useTasks();
  // Deep link: /tasks/?milestone=30d preselects that objective's tasks.
  const [milestone, setMilestone] = useState<MilestoneKey | "all">(() => {
    if (typeof window === "undefined") return "all";
    const m = new URLSearchParams(window.location.search).get("milestone");
    return isMilestoneKey(m) ? m : "all";
  });
  const [showDone, setShowDone] = useState(true);
  // Deep link: /tasks/?task=<id> opens that task (used by linked notes).
  const [editing, setEditing] = useState<string | "new" | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("task"),
  );
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
        // A deep-linked task that no longer exists simply leaves the modal closed.
        open={editing === "new" || current !== null}
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
