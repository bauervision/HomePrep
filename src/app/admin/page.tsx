"use client";

import {
  Activity,
  House,
  MailPlus,
  ShieldCheck,
  Undo2,
  UserPlus,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { InvitationLink } from "@/components/InvitationLink";
import { useSession } from "@/components/SessionProvider";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorText,
  Field,
  Input,
  PageHeader,
} from "@/components/ui";
import {
  createInvitation,
  expiresAt,
  INVITATION_STATE_LABEL,
  invitationState,
  InvitationError,
  revokeInvitation,
  type Identity,
  type InvitationState,
} from "@/lib/household";
import { useCollection, useWhere } from "@/lib/hooks";
import type { AuditEntry, Invitation, Registration } from "@/lib/types";

const STATE_TONE: Record<
  InvitationState,
  "neutral" | "good" | "warn" | "info"
> = {
  pending: "info",
  accepted: "good",
  expired: "neutral",
  revoked: "warn",
};

const date = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleDateString() : "—";

const ACTION_LABEL: Record<AuditEntry["action"], string> = {
  created: "Owner invitation created",
  revoked: "Owner invitation revoked",
  accepted: "Household registered",
};

/**
 * Platform administration: household-owner invitations and registration
 * records. Showing this page is not authorization — every read and write
 * here is allowed by the rules only for the platform-admin claim, which also
 * grants no access to any household's content.
 */
export default function AdminPage() {
  const { state, admin } = useSession();
  const user =
    state.status === "ready" || state.status === "noHousehold"
      ? state.user
      : null;
  if (!user) return null;
  if (!admin)
    return (
      <div className="mx-auto max-w-md pt-6">
        <Card title="Admin" icon={ShieldCheck}>
          <p className="text-sm text-ivory-dim">
            Admin is available only to the HomePrep platform administrator.
          </p>
        </Card>
      </div>
    );
  return <AdminWorkspace user={user} />;
}

function AdminWorkspace({ user }: { user: Identity }) {
  const invitations = useWhere<Invitation>("invitations", { type: "owner" });
  const registrations = useCollection<Registration>(["registrations"]);
  const activity = useCollection<AuditEntry>(["auditLog"], {
    orderBy: "at",
    direction: "desc",
    limit: 50,
  });
  const [now] = useState(() => Date.now());
  const [created, setCreated] = useState<{ id: string; email: string } | null>(
    null,
  );

  const withState = invitations.data
    .map((i) => ({ ...i, state: invitationState(i, now) }))
    .sort(
      (a, b) =>
        (b.createdAt?.toMillis() ?? Infinity) -
        (a.createdAt?.toMillis() ?? Infinity),
    );
  const pending = withState.filter((i) => i.state === "pending");
  const past = withState.filter((i) => i.state !== "pending");
  const households = [...registrations.data].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const nameOf = (hid: string | null) =>
    registrations.data.find((r) => r.id === hid)?.name ?? null;

  return (
    <>
      <PageHeader title="Admin" sub="Private beta registration" />
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <Card title={`Pending Invitations (${pending.length})`} icon={MailPlus}>
          <ErrorText>{invitations.error}</ErrorText>
          {invitations.loading ? (
            <Empty>Loading…</Empty>
          ) : pending.length === 0 ? (
            <Empty>No pending owner invitations.</Empty>
          ) : (
            <ul
              className="divide-y divide-line"
              data-testid="pending-invitations"
            >
              {pending.map((i) => (
                <PendingRow
                  key={i.id}
                  invitation={i}
                  user={user}
                  onShow={() => setCreated({ id: i.id, email: i.email })}
                />
              ))}
            </ul>
          )}
          {past.length > 0 && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-sage">
                Accepted, expired and revoked ({past.length})
              </summary>
              <ul className="mt-2 divide-y divide-line">
                {past.map((i) => (
                  <li
                    key={i.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                  >
                    <span className="min-w-0 [overflow-wrap:anywhere] text-ivory-dim">
                      {i.email}
                    </span>
                    <span className="flex items-center gap-2 text-slate">
                      {i.state === "accepted" && nameOf(i.householdId)}
                      <Badge tone={STATE_TONE[i.state]}>
                        {INVITATION_STATE_LABEL[i.state]}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>

        <Card title="Invite Household Owner" icon={UserPlus}>
          <OwnerInviteForm
            user={user}
            onCreated={(id, email) => setCreated({ id, email })}
          />
          {created && (
            <div className="mt-3">
              <InvitationLink id={created.id} email={created.email} />
            </div>
          )}
        </Card>

        <Card
          title={`Registered Households (${households.length})`}
          icon={House}
        >
          <ErrorText>{registrations.error}</ErrorText>
          {registrations.loading ? (
            <Empty>Loading…</Empty>
          ) : households.length === 0 ? (
            <Empty>No households registered yet.</Empty>
          ) : (
            <ul className="divide-y divide-line" data-testid="registrations">
              {households.map((r) => (
                <li key={r.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-ivory">{r.name || "Unnamed"}</span>
                    <Badge tone="good">
                      {r.status === "active" ? "Active" : r.status}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-[11px] [overflow-wrap:anywhere] text-slate">
                    Owner {r.ownerEmail || "—"} · {r.memberCount}{" "}
                    {r.memberCount === 1 ? "member" : "members"} · registered{" "}
                    {date(r.createdAt?.toMillis())}
                    {r.invitationId === "bootstrap" && " · existing household"}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-slate">
            Registration details only. Household inventory, goals, tasks, budget
            and notes stay private to each household’s members.
          </p>
        </Card>

        <Card title="Registration Activity" icon={Activity}>
          <ErrorText>{activity.error}</ErrorText>
          {activity.loading ? (
            <Empty>Loading…</Empty>
          ) : activity.data.length === 0 ? (
            <Empty>No activity yet.</Empty>
          ) : (
            <ul className="divide-y divide-line text-xs" data-testid="activity">
              {activity.data.map((a) => (
                <li key={a.id} className="py-1.5">
                  <div className="flex flex-wrap justify-between gap-x-2">
                    <span className="text-ivory-dim">
                      {ACTION_LABEL[a.action] ?? a.action}
                    </span>
                    <span className="text-slate tabular-nums">
                      {a.at ? a.at.toDate().toLocaleString() : "—"}
                    </span>
                  </div>
                  <div className="[overflow-wrap:anywhere] text-slate">
                    {a.email}
                    {a.action === "accepted" &&
                      nameOf(a.householdId) &&
                      ` · ${nameOf(a.householdId)}`}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function PendingRow({
  invitation: i,
  user,
  onShow,
}: {
  invitation: Invitation;
  user: Identity;
  onShow: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function revoke() {
    if (!confirm(`Revoke the invitation for ${i.email}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await revokeInvitation(user, i);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <li className="space-y-1 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 [overflow-wrap:anywhere] text-ivory">
          {i.email}
        </span>
        <span className="flex gap-1.5">
          <Button size="sm" onClick={onShow}>
            Show link
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={Undo2}
            loading={busy}
            onClick={revoke}
          >
            Revoke
          </Button>
        </span>
      </div>
      <div className="text-[11px] text-slate">
        Created {date(i.createdAt?.toMillis())} · expires {date(expiresAt(i))}
      </div>
      <ErrorText>{error}</ErrorText>
    </li>
  );
}

function OwnerInviteForm({
  user,
  onCreated,
}: {
  user: Identity;
  onCreated: (id: string, email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const id = await createInvitation(user, {
        type: "owner",
        email,
        role: "owner",
      });
      onCreated(id, email.trim().toLowerCase());
      setDone(`Invitation created for ${email.trim().toLowerCase()}.`);
      setEmail("");
    } catch (err) {
      setError(
        err instanceof InvitationError
          ? err.message
          : `Couldn’t create the invitation: ${(err as Error).message}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-sage">
        Approve a new household by inviting its owner. They sign in with this
        Google account and set up their household.
      </p>
      <Field label="Owner’s Google email">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
        />
      </Field>
      <Button
        type="submit"
        variant="copper"
        icon={UserPlus}
        loading={busy}
        disabled={!email.trim()}
      >
        Create invitation
      </Button>
      {done && (
        <p role="status" className="text-xs text-[#7fd8ad]">
          {done}
        </p>
      )}
      <ErrorText>{error}</ErrorText>
    </form>
  );
}
