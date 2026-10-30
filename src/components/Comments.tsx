"use client";

import { Send } from "lucide-react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useState, type FormEvent } from "react";
import { db } from "@/lib/firebase";
import { displayNameOf } from "@/lib/household";
import { useCollection } from "@/lib/hooks";
import type { Comment } from "@/lib/types";
import { useHousehold } from "./SessionProvider";
import { Button, Input } from "./ui";

function when(c: Comment) {
  const d = c.createdAt?.toDate();
  if (!d) return "just now";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Short discussion thread stored at households/{hid}/{parent}/{id}/comments. */
export function Comments({
  parent,
  parentId,
}: {
  parent: "tasks" | "purchases";
  parentId: string;
}) {
  const { household, user } = useHousehold();
  const path = ["households", household.id, parent, parentId, "comments"];
  const { data, loading, error } = useCollection<Comment>(path, {
    orderBy: "createdAt",
  });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setPostError(null);
    try {
      await addDoc(collection(db(), path.join("/")), {
        text: t,
        authorUid: user.uid,
        authorName: displayNameOf(user),
        createdAt: serverTimestamp(),
      });
      setText("");
    } catch (err) {
      setPostError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-sage uppercase">
        Discussion
      </h3>
      {loading ? (
        <p className="text-xs text-slate">Loading…</p>
      ) : data.length === 0 ? (
        <p className="text-xs text-slate">No comments yet.</p>
      ) : (
        <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
          {data.map((c) => (
            <li key={c.id} className="rounded-md bg-well px-2.5 py-1.5">
              <div className="flex items-baseline justify-between gap-2 text-[11px] text-sage">
                <span className="font-medium text-ivory-dim">
                  {c.authorName}
                </span>
                <span>{when(c)}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap text-ivory">{c.text}</p>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-rust">{error}</p>}
      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a short comment…"
          maxLength={1000}
        />
        <Button
          type="submit"
          variant="emerald"
          icon={Send}
          loading={busy}
          disabled={!text.trim()}
        >
          Post
        </Button>
      </form>
      {postError && <p className="text-xs text-rust">{postError}</p>}
    </div>
  );
}
