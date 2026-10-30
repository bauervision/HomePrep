"use client";

import { Save } from "lucide-react";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button, ErrorText, Textarea } from "@/components/ui";
import { NOTE_MAX_LENGTH, validateNoteContent } from "@/lib/notes";

/**
 * Plain-text note editor. Only the text is required. Ctrl/Cmd+Enter saves.
 * On failure the text stays in place for retry; repeat submits are ignored
 * while a save is in flight.
 */
export function NoteEditor({
  initialText = "",
  onSave,
  onCancel,
  submitLabel = "Save",
}: {
  initialText?: string;
  onSave: (text: string) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (inFlight.current) return;
    setError(null);
    try {
      validateNoteContent(text);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      await onSave(text);
    } catch (err) {
      setError(
        `Note not saved: ${(err as Error).message} Your text is kept — try again.`,
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void save();
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <Textarea
        autoFocus
        data-autofocus
        aria-label="Note"
        rows={5}
        maxLength={NOTE_MAX_LENGTH}
        placeholder="Idea, question, observation, or future project…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        className="max-h-[40dvh] min-h-28 resize-y text-[15px] leading-relaxed"
      />
      <ErrorText>{error}</ErrorText>
      <div className="flex items-center justify-between gap-2">
        <span className="hidden text-[11px] text-slate sm:inline">
          Ctrl+Enter to save
        </span>
        <div className="ml-auto flex gap-2">
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="emerald"
            icon={Save}
            loading={busy}
            disabled={!text.trim()}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
