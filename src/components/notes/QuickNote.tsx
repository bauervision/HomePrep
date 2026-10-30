"use client";

import { Check, NotebookPen } from "lucide-react";
import { useRef, useState } from "react";
import { useHousehold } from "@/components/SessionProvider";
import { cx, Modal } from "@/components/ui";
import { displayNameOf } from "@/lib/household";
import { createNote, newNoteId } from "@/lib/notes";
import { NoteEditor } from "./NoteEditor";

/**
 * Header action: open → type → save → back to the current page.
 * The note ID is fixed per opened dialog, so retries never duplicate a note.
 */
export function QuickNote({ className }: { className?: string }) {
  const { household, user } = useHousehold();
  const [noteId, setNoteId] = useState<string | null>(null);
  const [toast, setToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast() {
    setToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(false), 2500);
  }

  return (
    <>
      <button
        type="button"
        aria-label="Quick note"
        title="Quick note"
        onClick={() => setNoteId(newNoteId(household.id))}
        className={cx(
          "grid size-11 shrink-0 place-items-center rounded-lg border border-line text-copper-light outline-none hover:border-line-strong hover:bg-white/[0.04] hover:text-amber focus-visible:ring-2 focus-visible:ring-amber lg:size-9",
          className,
        )}
      >
        <NotebookPen size={18} aria-hidden />
      </button>
      <Modal
        open={noteId !== null}
        onClose={() => setNoteId(null)}
        title="Quick Note"
      >
        {noteId && (
          <NoteEditor
            key={noteId}
            onCancel={() => setNoteId(null)}
            onSave={async (text) => {
              await createNote(household.id, noteId, text, {
                uid: user.uid,
                name: displayNameOf(user),
              });
              setNoteId(null);
              showToast();
            }}
          />
        )}
      </Modal>
      <div
        role="status"
        aria-live="polite"
        className={cx(
          "pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4 transition-opacity duration-200 motion-reduce:transition-none",
          toast ? "opacity-100" : "opacity-0",
        )}
      >
        {toast && (
          <span className="flex items-center gap-2 rounded-full border border-pine/40 bg-[#08141a] px-4 py-2 text-sm text-ivory shadow-[0_12px_32px_-8px_rgb(0_0_0/0.8)]">
            <Check size={15} aria-hidden className="text-pine" />
            Note saved
          </span>
        )}
      </div>
    </>
  );
}
