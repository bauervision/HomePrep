"use client";

import { Plus } from "lucide-react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import Link from "next/link";
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
import { cardUrl } from "@/lib/library/actions";
import { useGuidance } from "@/lib/library/load";
import { taskDraftFromCard } from "@/lib/library-drafts";
import { createLibraryTask, isTaskFromCard } from "@/lib/library-tasks";
import { setParams, useSearch } from "@/lib/url-state";
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
  // Deep link: /tasks/?draft=<card> opens a new task prefilled from a Library
  // card. Nothing is saved until the household creates it.
  const draftId = useSearch().get("draft");
  const guidance = useGuidance(!!draftId);
  const card = draftId
    ? (guidance.data?.entries.find((e) => e.id === draftId) ?? null)
    : null;

  const [anotherCard, setAnotherCard] = useState<string | null>(null);
  const existingCardTasks = card
    ? data.filter((t) => isTaskFromCard(t, card.id))
    : [];

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

  function closeDraft() {
    setAnotherCard(null);
    setParams({ draft: null });
  }

  function closeTask() {
    setEditing(null);
    // A deep-linked task (?task=) must not reopen on refresh.
    if (new URLSearchParams(window.location.search).has("task"))
      setParams({ task: null });
  }

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
            aria-label="Milestone"
            value={milestone}
            onChange={(e) => {
              const next = e.target.value as MilestoneKey | "all";
              setMilestone(next);
              // Keep the filter in the URL so refresh preserves it.
              setParams({ milestone: next === "all" ? null : next });
            }}
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
        open={!!draftId}
        onClose={closeDraft}
        title="New task from the Library"
        wide
      >
        {draftId && card && existingCardTasks.length > 0 && (
          <div className="mb-3 space-y-2">
            {existingCardTasks.map((t) => (
              <div key={t.id}>
                <Button
                  onClick={() => {
                    closeDraft();
                    setEditing(t.id);
                  }}
                >
                  View existing task
                </Button>
                <p className="text-sm">
                  {t.title} · {TASK_STATUS_LABEL[t.status]} ·{" "}
                  {MILESTONES.find((m) => m.key === t.milestone)?.label}
                </p>
              </div>
            ))}
            {anotherCard !== card.id && (
              <Button onClick={() => setAnotherCard(card.id)}>
                Add another task
              </Button>
            )}
            {anotherCard === card.id && (
              <p className="text-xs text-sage">
                Describe a different outcome for this follow-up. Changing
                status, priority or milestone does not create distinct work.
              </p>
            )}
          </div>
        )}
        {draftId &&
        card &&
        !loading &&
        (existingCardTasks.length === 0 || anotherCard === card.id) ? (
          <TaskForm
            key={`draft:${card.id}`}
            initial={null}
            prefill={taskDraftFromCard(card)}
            submitLabel="Create task"
            hint={
              <p className="text-xs text-sage">
                Drafted from{" "}
                <Link href={cardUrl(card.id)} className="text-copper-light">
                  {card.title}
                </Link>
                . Review and edit before creating; nothing is saved until you
                do. Completing the task only counts toward goals that use it.
              </p>
            }
            onCreate={async (draft) => {
              await createLibraryTask(household.id, card.id, draft);
            }}
            onDone={closeDraft}
          />
        ) : card ? null : draftId && guidance.status === "error" ? (
          <ErrorText>{guidance.error}</ErrorText>
        ) : draftId && guidance.status === "ready" ? (
          <p className="text-sm text-ivory-dim">
            That Library card isn’t available, so there’s nothing to draft.
          </p>
        ) : (
          <p role="status" className="text-sm text-sage">
            Loading the Library card…
          </p>
        )}
      </Modal>
      <Modal
        // A deep-linked task that no longer exists simply leaves the modal closed.
        open={editing === "new" || current !== null}
        onClose={closeTask}
        title={editing === "new" ? "New task" : "Task"}
        wide
      >
        {editing === "new" && (
          <TaskForm key="new" initial={null} onDone={closeTask} />
        )}
        {current && (
          <div className="space-y-4">
            <TaskForm key={current.id} initial={current} onDone={closeTask} />
            <div className="border-t border-line pt-3">
              <Comments parent="tasks" parentId={current.id} />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
