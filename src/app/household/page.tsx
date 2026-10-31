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
import { MAX_MEMBERS, profileFields, resolveProfile } from "@/lib/profile";
import {
  CONSIDERATIONS,
  type Consideration,
  type Invite,
  type Member,
  type PetInfo,
} from "@/lib/types";

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
