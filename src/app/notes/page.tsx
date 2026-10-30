"use client";

import { useState } from "react";
import { NotesView } from "@/components/notes/NotesView";
import { useHousehold } from "@/components/SessionProvider";
import { useTasks } from "@/lib/data";
import { useCollection } from "@/lib/hooks";
import { NOTE_PAGE_SIZE } from "@/lib/notes";
import type { Note } from "@/lib/types";

export default function NotesPage() {
  const { household } = useHousehold();
  const [pageSize, setPageSize] = useState(NOTE_PAGE_SIZE);
  const notes = useCollection<Note>(["households", household.id, "notes"], {
    orderBy: "createdAt",
    direction: "desc",
    limit: pageSize,
  });
  const tasks = useTasks();
  return (
    <NotesView
      notes={notes.data}
      loading={notes.loading}
      loadingMore={notes.loadingMore}
      hasMore={notes.hasMore}
      onLoadMore={() => setPageSize((n) => n + NOTE_PAGE_SIZE)}
      error={notes.error || tasks.error}
      tasks={tasks.data}
      tasksLoading={tasks.loading}
    />
  );
}
