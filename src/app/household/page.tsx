"use client";

import { Check, Copy, Save, Settings, UserPlus, Users } from "lucide-react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState, type FormEvent } from "react";
import { useHousehold } from "@/components/SessionProvider";
import {
  Badge,
  Button,
  Card,
  ErrorText,
  Field,
  Input,
  PageHeader,
} from "@/components/ui";
import { db } from "@/lib/firebase";
import { createInvite, revokeInvite } from "@/lib/household";
import { useCollection } from "@/lib/hooks";
import type { Invite, Member } from "@/lib/types";

function useInvites(householdId: string) {
  const [state, setState] = useState<{
    hid: string;
    data: Invite[];
    error: string | null;
  } | null>(null);
  useEffect(() => {
    const q = query(
      collection(db(), "invites"),
      where("householdId", "==", householdId),
    );
    return onSnapshot(
      q,
      (s) =>
        setState({
          hid: householdId,
          data: s.docs.map((d) => ({ id: d.id, ...d.data() }) as Invite),
          error: null,
        }),
      (e) => setState({ hid: householdId, data: [], error: e.message }),
    );
  }, [householdId]);
  return state?.hid === householdId
    ? state
    : { data: [] as Invite[], error: null };
}

function SettingsForm() {
  const { household } = useHousehold();
  const [name, setName] = useState(household.name);
  const [size, setSize] = useState(household.householdSize);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await updateDoc(doc(db(), "households", household.id), {
        name: name.trim() || household.name,
        householdSize: size,
        updatedAt: serverTimestamp(),
      });
      setMsg("Saved.");
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <Field label="Household name">
          <Input
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="People">
          <Input
            type="number"
            min={1}
            max={30}
            value={size}
            onChange={(e) =>
              setSize(
                Math.max(
                  1,
                  Math.min(30, Math.round(Number(e.target.value)) || 1),
                ),
              )
            }
          />
        </Field>
      </div>
      <p className="text-[11px] text-slate">
        Water and food targets scale with the number of people.
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="emerald" icon={Save} loading={busy}>
          Save
        </Button>
        {msg && <span className="text-xs text-sage">{msg}</span>}
      </div>
    </form>
  );
}

function Invites() {
  const { household, user } = useHousehold();
  const invites = useInvites(household.id);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [now] = useState(() => Date.now());

  const link = created ? `${window.location.origin}/join/?code=${created}` : "";
  const active = invites.data
    .filter((i) => !i.usedBy && i.expiresAt.toMillis() > now)
    .sort((a, b) => b.expiresAt.toMillis() - a.expiresAt.toMillis());

  async function create() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setCreated(await createInvite(user, household.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-sage">
        Invite another adult. Each code works once, for one Google account, and
        expires in 7 days.
      </p>
      <Button variant="copper" icon={UserPlus} onClick={create} loading={busy}>
        Create invite
      </Button>
      {created && (
        <div className="space-y-2 rounded-md border border-pine/35 bg-pine/[0.06] p-3">
          <div className="font-mono text-base tracking-wider text-[#7fd8ad]">
            {created}
          </div>
          <div className="flex gap-2">
            <Input
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
              className="font-mono text-xs"
            />
            <Button
              icon={copied ? Check : Copy}
              onClick={() =>
                navigator.clipboard.writeText(link).then(() => setCopied(true))
              }
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          <p className="text-[11px] text-slate">
            Share privately. Anyone with this code can join until it is used.
          </p>
        </div>
      )}
      <ErrorText>{error || invites.error}</ErrorText>
      {active.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-sage uppercase">
            Open invites
          </h3>
          <ul className="divide-y divide-line">
            {active.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-2 py-1.5 text-sm"
              >
                <span className="font-mono text-xs text-ivory-dim">{i.id}</span>
                <span className="text-[11px] text-slate">
                  by {i.createdByName} · expires{" "}
                  {i.expiresAt.toDate().toLocaleDateString()}
                </span>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    revokeInvite(i.id).catch((e: Error) => setError(e.message))
                  }
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function HouseholdPage() {
  const { household, user } = useHousehold();
  const members = useCollection<Member & { id: string }>(
    ["households", household.id, "members"],
    {
      orderBy: "joinedAt",
    },
  );

  return (
    <>
      <PageHeader title="Household" sub={household.name} />
      <div className="grid gap-3 lg:grid-cols-3">
        <Card title={`Members (${members.data.length})`} icon={Users}>
          <ErrorText>{members.error}</ErrorText>
          <ul className="space-y-2">
            {members.data.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5">
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
                    {m.uid === user.uid && (
                      <span className="text-slate"> (you)</span>
                    )}
                  </div>
                  <div className="truncate text-[11px] text-slate">
                    {m.email}
                  </div>
                </div>
                {m.role === "owner" && <Badge>Owner</Badge>}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Invite a member" icon={UserPlus}>
          <Invites />
        </Card>
        <Card title="Settings" icon={Settings}>
          <SettingsForm />
        </Card>
      </div>
    </>
  );
}
