"use client";

import {
  LogOut,
  Save,
  Settings,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useState, type FormEvent } from "react";
import { InvitationLink } from "@/components/InvitationLink";
import { useHousehold } from "@/components/SessionProvider";
import {
  Badge,
  Button,
  Card,
  ErrorText,
  Field,
  Input,
  PageHeader,
  Select,
} from "@/components/ui";
import { db } from "@/lib/firebase";
import {
  createInvitation,
  expiresAt,
  InvitationError,
  invitationState,
  normalizeEmail,
  removeMember,
  revokeInvitation,
  setMemberRole,
} from "@/lib/household";
import { useCollection, useWhere } from "@/lib/hooks";
import { MAX_MEMBERS, profileFields, resolveProfile } from "@/lib/profile";
import {
  CONSIDERATIONS,
  ROLE_LABEL,
  type Consideration,
  type Invitation,
  type Member,
  type PetInfo,
} from "@/lib/types";

const wholeNumber = (v: string, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(Number(v)) || min));

function SettingsForm() {
  const { household } = useHousehold();
  const profile = resolveProfile(household);
  const [name, setName] = useState(household.name);
  // Older households recorded only a total; it is shown as adults for the
  // household to confirm or split — never saved until they choose to.
  const [adults, setAdults] = useState(
    profile.adults ?? profile.memberCount ?? 1,
  );
  const [children, setChildren] = useState(profile.children ?? 0);
  const [pets, setPets] = useState<PetInfo>(
    profile.pets ?? { dogs: 0, cats: 0, other: 0 },
  );
  const [considerations, setConsiderations] = useState<Consideration[]>(
    profile.considerations,
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await updateDoc(doc(db(), "households", household.id), {
        name: name.trim() || household.name,
        ...profileFields({ adults, children, pets, considerations }),
        updatedAt: serverTimestamp(),
      });
      setMsg("Saved.");
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const petField = (k: keyof PetInfo, label: string) => (
    <Field label={label}>
      <Input
        type="number"
        min={0}
        max={50}
        value={pets[k]}
        onChange={(e) =>
          setPets((p) => ({ ...p, [k]: wholeNumber(e.target.value, 0, 50) }))
        }
      />
    </Field>
  );

  return (
    <form onSubmit={save} className="space-y-3">
      <Field label="Household name">
        <Input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      {profile.status !== "complete" && (
        <p
          role="note"
          className="rounded-md border border-amber/30 bg-amber/6 px-2.5 py-1.5 text-[11px] text-ivory-dim"
        >
          {profile.memberCount
            ? `Recorded as ${profile.memberCount} people, without adults and children. Confirm the split below and save.`
            : "Household size isn’t set yet. Enter adults and children and save."}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Field label="Adults">
          <Input
            type="number"
            min={1}
            max={MAX_MEMBERS}
            value={adults}
            onChange={(e) =>
              setAdults(wholeNumber(e.target.value, 1, MAX_MEMBERS - children))
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
              setChildren(wholeNumber(e.target.value, 0, MAX_MEMBERS - adults))
            }
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ivory-dim">Total</span>
          <output
            className="flex h-10 items-center text-sm text-ivory tabular-nums"
            aria-label="Total people"
          >
            {adults + children}
          </output>
        </div>
      </div>
      <p className="text-[11px] text-slate">
        Water and food targets scale with everyone in the household. Custom
        targets you set on a goal are kept when this changes.
      </p>
      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 text-[13px] font-medium text-ivory-dim">
          Pets <span className="font-normal text-slate">(optional)</span>
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {petField("dogs", "Dogs")}
          {petField("cats", "Cats")}
          {petField("other", "Other")}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-ivory-dim">
          Planning considerations{" "}
          <span className="font-normal text-slate">(optional)</span>
        </legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {(Object.keys(CONSIDERATIONS) as Consideration[]).map((c) => (
            <label
              key={c}
              className="flex items-center gap-2 text-sm text-sage"
            >
              <input
                type="checkbox"
                checked={considerations.includes(c)}
                onChange={(e) =>
                  setConsiderations((list) =>
                    e.target.checked
                      ? [...list, c]
                      : list.filter((x) => x !== c),
                  )
                }
              />
              {CONSIDERATIONS[c]}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-slate">
          Used for planning only. Don’t record medical details here.
        </p>
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="emerald" icon={Save} loading={busy}>
          Save
        </Button>
        {msg && <span className="text-xs text-sage">{msg}</span>}
      </div>
    </form>
  );
}

/** Whether the household has its platform registration (0.7.0 bootstrap). */
function useRegistered(householdId: string) {
  const [state, setState] = useState<{ hid: string; ok: boolean } | null>(null);
  useEffect(() => {
    return onSnapshot(
      doc(db(), "registrations", householdId),
      (s) => setState({ hid: householdId, ok: s.exists() }),
      () => setState({ hid: householdId, ok: false }),
    );
  }, [householdId]);
  return state?.hid === householdId ? state.ok : null;
}

function Invitations() {
  const { household, user, member } = useHousehold();
  const isOwner = member.role === "owner";
  const registered = useRegistered(household.id);
  const invitations = useWhere<Invitation>("invitations", {
    type: "member",
    householdId: household.id,
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "co-owner">("member");
  const [shown, setShown] = useState<{ id: string; email: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const pending = invitations.data
    .filter((i) => invitationState(i, now) === "pending")
    .sort(
      (a, b) =>
        (b.createdAt?.toMillis() ?? Infinity) -
        (a.createdAt?.toMillis() ?? Infinity),
    );

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = await createInvitation(user, {
        type: "member",
        email,
        role: isOwner ? role : "member",
        householdId: household.id,
        householdName: household.name,
      });
      setShown({ id, email: normalizeEmail(email) });
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

  async function revoke(i: Invitation) {
    if (!confirm(`Revoke the invitation for ${i.email}?`)) return;
    setError(null);
    try {
      await revokeInvitation(user, i);
      if (shown?.id === i.id) setShown(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (registered === false)
    return (
      <p className="text-sm text-sage">
        Inviting family becomes available once this household’s registration is
        set up by the HomePrep administrator.
      </p>
    );

  return (
    <div className="space-y-3">
      <form onSubmit={create} className="space-y-3">
        <p className="text-sm text-sage">
          Invite someone by their Google email. The invitation works only for
          that account, once, and expires in 7 days.
        </p>
        <Field label="Email">
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
        </Field>
        {isOwner && (
          <Field label="Role">
            <Select
              value={role}
              onChange={(e) => setRole(e.target.value as "member" | "co-owner")}
            >
              <option value="member">Member</option>
              <option value="co-owner">Co-owner</option>
            </Select>
          </Field>
        )}
        <Button
          type="submit"
          variant="copper"
          icon={UserPlus}
          loading={busy}
          disabled={!email.trim() || registered === null}
        >
          Create invitation
        </Button>
      </form>
      {shown && <InvitationLink id={shown.id} email={shown.email} />}
      <ErrorText>{error || invitations.error}</ErrorText>
      {pending.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-sage uppercase">
            Pending invitations
          </h3>
          <ul className="divide-y divide-line" data-testid="member-invitations">
            {pending.map((i) => (
              <li key={i.id} className="space-y-1 py-1.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 [overflow-wrap:anywhere] text-ivory-dim">
                    {i.email}
                  </span>
                  <span className="flex gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => setShown({ id: i.id, email: i.email })}
                    >
                      Show link
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => revoke(i)}
                    >
                      Revoke
                    </Button>
                  </span>
                </div>
                <div className="text-[11px] text-slate">
                  {ROLE_LABEL[i.role]} · by {i.createdByName} · expires{" "}
                  {expiresAt(i)
                    ? new Date(expiresAt(i)!).toLocaleDateString()
                    : "—"}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MemberRow({
  m,
  self,
  viewer,
}: {
  m: Member;
  self: boolean;
  viewer: Member;
}) {
  const { household } = useHousehold();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewerOwner = viewer.role === "owner";
  const canChangeRole = viewerOwner && !self && m.role !== "owner";
  const canRemove =
    !self &&
    m.role !== "owner" &&
    (viewerOwner || (viewer.role === "co-owner" && m.role === "member"));
  const canLeave = self && m.role !== "owner";

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="py-1.5" data-testid={`member-${m.uid}`}>
      <div className="flex items-center gap-2.5">
        {m.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={m.photoURL}
            alt=""
            className="size-7 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="grid size-7 place-items-center rounded-full bg-white/10 text-xs">
            {m.displayName.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">
            {m.displayName}
            {self && <span className="text-slate"> (you)</span>}
          </div>
          <div className="truncate text-[11px] text-slate">{m.email}</div>
        </div>
        {canChangeRole ? (
          <Select
            aria-label={`Role for ${m.displayName}`}
            className="h-8 w-auto text-xs"
            value={m.role}
            disabled={busy}
            onChange={(e) =>
              act(() =>
                setMemberRole(
                  household.id,
                  m.uid,
                  e.target.value as "member" | "co-owner",
                ),
              )
            }
          >
            <option value="member">Member</option>
            <option value="co-owner">Co-owner</option>
          </Select>
        ) : (
          <Badge tone={m.role === "member" ? "neutral" : "info"}>
            {ROLE_LABEL[m.role] ?? m.role}
          </Badge>
        )}
      </div>
      {(canRemove || canLeave) && (
        <div className="mt-1 flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            icon={canLeave ? LogOut : UserMinus}
            disabled={busy}
            onClick={() => {
              const ok = confirm(
                canLeave
                  ? `Leave ${household.name}? You’ll need a new invitation to come back.`
                  : `Remove ${m.displayName} from ${household.name}?`,
              );
              if (ok) void act(() => removeMember(household.id, m.uid));
            }}
          >
            {canLeave ? "Leave household" : "Remove"}
          </Button>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </li>
  );
}

export default function HouseholdPage() {
  const { household, user, member } = useHousehold();
  const members = useCollection<Member & { id: string }>(
    ["households", household.id, "members"],
    {
      orderBy: "joinedAt",
    },
  );
  const manager = member.role === "owner" || member.role === "co-owner";

  return (
    <>
      <PageHeader title="Household" sub={household.name} />
      <div className="grid gap-3 lg:grid-cols-3">
        <Card title={`Members (${members.data.length})`} icon={Users}>
          <ErrorText>{members.error}</ErrorText>
          <ul className="divide-y divide-line">
            {members.data.map((m) => (
              <MemberRow
                key={m.id}
                m={m}
                self={m.uid === user.uid}
                viewer={member}
              />
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate">
            Owner manages the household and its co-owners. Co-owners invite and
            remove members. Members use and update the plan.
          </p>
        </Card>
        <Card title="Invite family" icon={UserPlus}>
          {manager ? (
            <Invitations />
          ) : (
            <p className="text-sm text-sage">
              Ask the owner or a co-owner to invite family members.
            </p>
          )}
        </Card>
        <Card title="Settings" icon={Settings}>
          <SettingsForm />
        </Card>
      </div>
    </>
  );
}
