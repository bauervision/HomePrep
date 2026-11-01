"use client";

import { House, MailOpen, Plus, UserPlus, Users } from "lucide-react";
import { doc, getDoc, type FirestoreError } from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "@/components/SessionProvider";
import {
  Badge,
  Button,
  Card,
  cx,
  Empty,
  ErrorText,
  Field,
  Input,
  linkClass,
} from "@/components/ui";
import { db } from "@/lib/firebase";
import {
  acceptMemberInvitation,
  acceptOwnerInvitation,
  acceptProblem,
  expiresAt,
  InvitationError,
  NOT_YOURS,
  type Identity,
} from "@/lib/household";
import { MAX_MEMBERS } from "@/lib/profile";
import { ROLE_LABEL, type Invitation } from "@/lib/types";
import { useSearch } from "@/lib/url-state";

type Loaded =
  | { id: string; status: "ok"; invitation: Invitation }
  | { id: string; status: "denied" }
  | { id: string; status: "error"; message: string };

const clamp = (v: string, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(Number(v)) || min));

/**
 * Opens an invitation: /invite/?id=… Shows what it grants and lets the
 * invited account accept it explicitly. Nothing happens without "Join
 * Household" or "Create Household".
 */
export default function InvitePage() {
  const { state } = useSession();
  const router = useRouter();
  const id = useSearch().get("id") ?? "";
  const user =
    state.status === "ready" || state.status === "noHousehold"
      ? state.user
      : null;
  const current = state.status === "ready" ? state.household : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [now] = useState(() => Date.now());
  const [name, setName] = useState("Our Household");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uid = user?.uid;
  useEffect(() => {
    if (!uid || !id) return;
    getDoc(doc(db(), "invitations", id)).then(
      (s) =>
        setLoaded(
          s.exists()
            ? {
                id,
                status: "ok",
                invitation: { id: s.id, ...s.data() } as Invitation,
              }
            : { id, status: "denied" },
        ),
      (e: FirestoreError) =>
        setLoaded(
          e.code === "permission-denied"
            ? { id, status: "denied" }
            : { id, status: "error", message: e.message },
        ),
    );
  }, [uid, id]);

  if (!user) return null;
  const view = loaded?.id === id ? loaded : null;
  const identity: Identity = user;

  let body;
  if (!id) {
    body = <Empty>This link has no invitation in it.</Empty>;
  } else if (!view) {
    body = <Empty>Checking the invitation…</Empty>;
  } else if (view.status === "denied") {
    body = (
      <div className="space-y-3 text-sm">
        <p className="text-ivory-dim">{NOT_YOURS}</p>
        <p className="text-sage">
          You’re signed in as <span className="text-ivory">{user.email}</span>.
          Sign out and sign in with the Google account the invitation was sent
          to.
        </p>
      </div>
    );
  } else if (view.status === "error") {
    body = <ErrorText>{view.message}</ErrorText>;
  } else {
    const inv = view.invitation;
    const owner = inv.type === "owner";
    const problem = acceptProblem(inv, identity, now);
    const already =
      !owner && current?.id === inv.householdId
        ? "You’re already a member of this household."
        : null;
    const exp = expiresAt(inv);

    async function accept(e?: FormEvent) {
      e?.preventDefault();
      setBusy(true);
      setError(null);
      try {
        if (owner)
          await acceptOwnerInvitation(identity, inv.id, name, {
            adults,
            children,
            pets: { dogs: 0, cats: 0, other: 0 },
            considerations: [],
          });
        else await acceptMemberInvitation(identity, inv.id);
        router.push("/");
      } catch (err) {
        setError(
          err instanceof InvitationError
            ? err.message
            : `Couldn’t accept the invitation: ${(err as Error).message}`,
        );
        setBusy(false);
      }
    }

    body = (
      <div className="space-y-4 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-slate">Household</dt>
          <dd className="text-ivory" data-testid="invite-household">
            {owner ? "A new household you’ll set up" : inv.householdName}
          </dd>
          <dt className="text-slate">Your role</dt>
          <dd>
            <Badge tone="info">{ROLE_LABEL[inv.role]}</Badge>
          </dd>
          <dt className="text-slate">Invited by</dt>
          <dd className="text-ivory-dim">{inv.createdByName}</dd>
          <dt className="text-slate">For</dt>
          <dd className="[overflow-wrap:anywhere] text-ivory-dim">
            {inv.email}
          </dd>
          {exp !== null && (
            <>
              <dt className="text-slate">Expires</dt>
              <dd className="text-ivory-dim">
                {new Date(exp).toLocaleDateString()}
              </dd>
            </>
          )}
        </dl>

        {problem || already ? (
          <p role="alert" className="text-amber">
            {problem ?? already}
          </p>
        ) : owner ? (
          <form onSubmit={accept} className="space-y-3">
            <p className="text-ivory-dim">
              You’re invited to start a household on HomePrep as its owner. You
              can invite your family once it’s set up.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_6rem_6rem]">
              <Field
                label="Household name"
                className="col-span-2 sm:col-span-1"
              >
                <Input
                  icon={House}
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Adults">
                <Input
                  icon={Users}
                  type="number"
                  min={1}
                  max={MAX_MEMBERS}
                  value={adults}
                  onChange={(e) =>
                    setAdults(clamp(e.target.value, 1, MAX_MEMBERS - children))
                  }
                />
              </Field>
              <Field label="Children">
                <Input
                  type="number"
                  min={0}
                  max={MAX_MEMBERS - 1}
                  value={children}
                  onChange={(e) =>
                    setChildren(clamp(e.target.value, 0, MAX_MEMBERS - adults))
                  }
                />
              </Field>
            </div>
            {current && (
              <p className="text-[11px] text-slate">
                This creates a separate household and switches you to it. You
                stay a member of {current.name}.
              </p>
            )}
            <Button
              type="submit"
              variant="copper"
              icon={Plus}
              loading={busy}
              className="min-h-10"
            >
              Create Household
            </Button>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-ivory-dim">
              Joining gives you access to this household’s preparedness plan:
              inventory, goals, tasks, budget and notes.
            </p>
            {current && (
              <p className="text-[11px] text-slate">
                You’ll switch to this household. You stay a member of{" "}
                {current.name}.
              </p>
            )}
            <Button
              variant="emerald"
              icon={UserPlus}
              loading={busy}
              onClick={() => accept()}
              className="min-h-10"
            >
              Join Household
            </Button>
          </div>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg pt-2 sm:pt-6">
      <Card title="Invitation" icon={MailOpen}>
        {body}
        <Link href="/" className={cx("mt-4 inline-block text-xs", linkClass)}>
          {current ? "Back to dashboard" : "Back"}
        </Link>
      </Card>
    </div>
  );
}
