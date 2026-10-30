"use client";

import { ListPlus, ListTodo, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useHousehold } from "@/components/SessionProvider";
import { TaskForm } from "@/components/TaskForm";
import {
  Button,
  Card,
  cx,
  Empty,
  ErrorText,
  Input,
  Modal,
  PageHeader,
} from "@/components/ui";
import { displayNameOf } from "@/lib/household";
import {
  createNote,
  createTaskFromNote,
  deleteNote,
  filterNotes,
  newNoteId,
  newTaskId,
  taskDraftFromNote,
  updateNote,
  type NoteFilter,
} from "@/lib/notes";
import type { Note, Task } from "@/lib/types";
import { NoteEditor } from "./NoteEditor";

const FILTERS: { key: NoteFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unlinked", label: "Without tasks" },
  { key: "linked", label: "Linked to tasks" },
];

type ModalState =
  | { kind: "new"; noteId: string }
  | { kind: "edit"; noteId: string }
  | { kind: "task"; noteId: string; taskId: string };

const LONG_NOTE = 280;

function when(n: Note) {
  const d = n.createdAt?.toDate?.();
  if (!d) return "Just now";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function edited(n: Note) {
  const c = n.createdAt?.toMillis?.();
  const u = n.updatedAt?.toMillis?.();
  return c != null && u != null && u - c > 60_000;
}

function NoteRow({
  note,
  tasks,
  tasksLoading,
  onEdit,
  onDelete,
  onCreateTask,
}: {
  note: Note;
  tasks: Map<string, Task>;
  tasksLoading: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onCreateTask: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const long =
    note.content.length > LONG_NOTE || note.content.split("\n").length > 4;
  const linked = (note.linkedTaskIds ?? []).filter(
    (id) => typeof id === "string",
  );

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <p
        className={cx(
          "text-[15px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-ivory",
          long && !expanded && "line-clamp-4",
        )}
      >
        {note.content}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs text-copper-light outline-none hover:text-amber focus-visible:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}

      {linked.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Linked tasks">
          {linked.map((id) => {
            const t = tasks.get(id);
            return (
              <li key={id} className="max-w-full">
                {t ? (
                  <Link
                    href={`/tasks/?task=${encodeURIComponent(id)}`}
                    className="flex max-w-full items-center gap-1.5 rounded-md border border-line bg-well px-2 py-1 text-xs text-ivory-dim outline-none hover:border-line-strong hover:text-ivory focus-visible:ring-2 focus-visible:ring-amber"
                  >
                    <ListTodo
                      size={13}
                      aria-hidden
                      className="shrink-0 text-copper-light"
                    />
                    <span className="truncate">{t.title}</span>
                  </Link>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs text-slate">
                    <ListTodo size={13} aria-hidden />
                    {tasksLoading ? "Task" : "Task removed"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className="text-[11px] text-slate">
          {when(note)}
          {note.createdByName && <> · {note.createdByName}</>}
          {edited(note) && <> · edited</>}
        </p>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            icon={ListPlus}
            className="h-10 sm:h-8"
            onClick={onCreateTask}
          >
            Create task
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={Pencil}
            className="h-10 sm:h-8"
            onClick={onEdit}
            aria-label="Edit note"
          >
            <span className="hidden sm:inline">Edit</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            className="h-10 sm:h-8"
            onClick={onDelete}
            aria-label="Delete note"
          >
            <span className="hidden sm:inline">Delete</span>
          </Button>
        </div>
      </div>
    </li>
  );
}

export function NotesView({
  notes,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  error,
  tasks,
  tasksLoading,
}: {
  notes: Note[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  error: string | null;
  tasks: Task[];
  tasksLoading: boolean;
}) {
  const { household, user } = useHousehold();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const shown = useMemo(
    () => filterNotes(notes, query, filter),
    [notes, query, filter],
  );
  const current =
    modal && modal.kind !== "new"
      ? notes.find((n) => n.id === modal.noteId)
      : null;

  async function remove(note: Note) {
    const linked = (note.linkedTaskIds ?? []).length;
    const msg = linked
      ? `Delete this note? Its ${linked === 1 ? "linked task is" : `${linked} linked tasks are`} kept.`
      : "Delete this note?";
    if (!confirm(msg)) return;
    setActionError(null);
    try {
      await deleteNote(household.id, note.id);
    } catch (err) {
      setActionError(`Could not delete the note: ${(err as Error).message}`);
    }
  }

  const addNote = () =>
    setModal({ kind: "new", noteId: newNoteId(household.id) });

  return (
    <>
      <PageHeader
        title="Notes"
        sub="Ideas, research, and future projects."
        action={
          <Button variant="copper" icon={Plus} onClick={addNote}>
            Add note
          </Button>
        }
      />
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input
            icon={Search}
            wrapperClassName="w-full sm:w-72"
            aria-label="Search notes"
            placeholder="Search notes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div
            role="group"
            aria-label="Filter notes"
            className="flex rounded-lg border border-line p-0.5"
          >
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={cx(
                  "h-9 rounded-md px-2.5 text-xs whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-amber sm:h-8",
                  filter === f.key
                    ? "bg-white/[0.07] font-medium text-ivory"
                    : "text-sage hover:text-ivory",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <ErrorText>{error || actionError}</ErrorText>
        {loading ? (
          <Empty>Loading…</Empty>
        ) : notes.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-slate">
              No notes yet. Capture an idea whenever it comes to mind.
            </p>
            <Button
              variant="copper"
              icon={Plus}
              className="mt-3"
              onClick={addNote}
            >
              Add note
            </Button>
          </div>
        ) : shown.length === 0 ? (
          <Empty>No notes match.</Empty>
        ) : (
          <ul className="divide-y divide-line" aria-label="Notes">
            {shown.map((n) => (
              <NoteRow
                key={n.id}
                note={n}
                tasks={taskMap}
                tasksLoading={tasksLoading}
                onEdit={() => setModal({ kind: "edit", noteId: n.id })}
                onDelete={() => remove(n)}
                onCreateTask={() =>
                  setModal({
                    kind: "task",
                    noteId: n.id,
                    taskId: newTaskId(household.id),
                  })
                }
              />
            ))}
          </ul>
        )}
        {hasMore && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-slate">
            <span>
              Showing and searching the {notes.length} most recent notes.
            </span>
            <Button size="sm" onClick={onLoadMore} loading={loadingMore}>
              Load older notes
            </Button>
          </div>
        )}
      </Card>

      <Modal
        open={modal !== null && (modal.kind === "new" || !!current)}
        onClose={() => setModal(null)}
        title={
          modal?.kind === "task"
            ? "Create task from note"
            : modal?.kind === "edit"
              ? "Edit note"
              : "Add note"
        }
        wide={modal?.kind === "task"}
      >
        {modal?.kind === "new" && (
          <NoteEditor
            key={modal.noteId}
            onCancel={() => setModal(null)}
            onSave={async (text) => {
              await createNote(household.id, modal.noteId, text, {
                uid: user.uid,
                name: displayNameOf(user),
              });
              setModal(null);
            }}
          />
        )}
        {modal?.kind === "edit" && current && (
          <NoteEditor
            key={current.id}
            initialText={current.content}
            onCancel={() => setModal(null)}
            onSave={async (text) => {
              await updateNote(household.id, current.id, text);
              setModal(null);
            }}
          />
        )}
        {modal?.kind === "task" && current && (
          <TaskForm
            key={modal.taskId}
            initial={null}
            prefill={taskDraftFromNote(current)}
            submitLabel="Create task"
            hint={
              <p className="text-xs text-sage">
                Review before creating. Status, priority, category and milestone
                start at the usual task defaults; the full note is kept in the
                task notes. The note stays in Notes.
              </p>
            }
            onCreate={async (draft) => {
              await createTaskFromNote(
                household.id,
                current.id,
                modal.taskId,
                draft,
              );
            }}
            onDone={() => setModal(null)}
          />
        )}
      </Modal>
    </>
  );
}
