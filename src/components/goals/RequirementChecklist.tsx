"use client";

import {
  Ban,
  ChevronDown,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { useHousehold } from "@/components/SessionProvider";
import {
  Badge,
  Button,
  cx,
  ErrorText,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { EVIDENCE_LABEL, SOURCES } from "@/lib/baseline";
import {
  confirm as confirmChange,
  createCustom,
  customizeText,
  editCustom,
  linkItem,
  markNotApplicable,
  MAX_EXPLANATION,
  MAX_REASON,
  MAX_TITLE,
  newCustomId,
  removeCustom,
  resetText,
  restoreApplicable,
  STATUS_LABEL,
  unconfirm,
  unlinkItem,
  type EvaluatedRequirement,
  type RecordChange,
  type RequirementStatus,
} from "@/lib/checklist";
import { updateRequirement } from "@/lib/goals";
import { displayNameOf } from "@/lib/household";
import { describeQuantity } from "@/lib/quantities";
import { usable, type Essential } from "@/lib/readiness";
import { TASK_STATUS_LABEL, type InventoryItem } from "@/lib/types";

const STATUS_TONE: Record<
  RequirementStatus,
  "neutral" | "good" | "warn" | "info"
> = {
  "not-started": "neutral",
  "in-progress": "warn",
  confirmed: "info",
  evidence: "good",
  met: "good",
  "not-applicable": "neutral",
  "needs-review": "warn",
};

const sectionLabel =
  "mb-1.5 text-[11px] font-semibold tracking-[0.14em] text-sage uppercase";
const quietBtn = "h-7 px-2 text-[11px]";

/** Persists one change with busy/error state for a single control group. */
function useChange() {
  const { household } = useHousehold();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(id: string, change: () => RecordChange) {
    setBusy(true);
    setError(null);
    try {
      await updateRequirement(household.id, id, change());
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, setError };
}

/**
 * Compact checklist of a goal's requirements: system recommendations, then
 * the household's own. Changes persist immediately; explanations, sources
 * and edit controls open per row.
 */
export function RequirementChecklist({
  essential: e,
  items,
  today,
  skipIds = [],
}: {
  essential: Essential;
  items: InventoryItem[];
  today: string;
  /** Requirements already shown elsewhere (quantity targets). */
  skipIds?: string[];
}) {
  const { core, supporting, confirmedOnly } = e.checklist;
  const rows = e.checklist.requirements.filter((r) => !skipIds.includes(r.id));
  const coreRows = rows.filter((r) => r.def.level === "core");
  const supportRows = rows.filter((r) => r.def.level === "supporting");

  return (
    <div data-testid="requirements">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className={sectionLabel}>Requirements</h3>
        <p className="text-[11px] text-sage" data-testid="requirement-tally">
          {core.applicable === 0
            ? "No core requirements apply"
            : `${core.done} of ${core.applicable} core done`}
          {confirmedOnly > 0 && ` · ${confirmedOnly} household-confirmed`}
        </p>
      </div>
      {coreRows.length > 0 && (
        <ul className="divide-y divide-line">
          {coreRows.map((r) => (
            <RequirementRow
              key={r.id}
              r={r}
              essential={e}
              items={items}
              today={today}
            />
          ))}
        </ul>
      )}
      {supportRows.length > 0 && (
        <>
          <h3 className={cx(sectionLabel, "mt-3")}>
            Also consider{" "}
            <span className="tracking-normal normal-case">
              · {supporting.done} of {supporting.applicable} · not required for
              the goal
            </span>
          </h3>
          <ul className="divide-y divide-line">
            {supportRows.map((r) => (
              <RequirementRow
                key={r.id}
                r={r}
                essential={e}
                items={items}
                today={today}
              />
            ))}
          </ul>
        </>
      )}
      <AddRequirement essential={e} />
    </div>
  );
}

function RequirementRow({
  r,
  essential: e,
  items,
  today,
}: {
  r: EvaluatedRequirement;
  essential: Essential;
  items: InventoryItem[];
  today: string;
}) {
  const { user } = useHousehold();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<null | "edit" | "na">(null);
  const { busy, error, run } = useChange();
  const name = displayNameOf(user);
  const canAttest = r.def.completion.conditions.some(
    (c) => c.kind === "attest",
  );
  const linkable = r.def.completion.conditions.find(
    (c) => c.kind === "inventory",
  );
  const dismissable = r.custom || r.def.appliesIf !== undefined;
  const dismissed = !!r.record?.notApplicable;
  const panelId = `req-${r.id}`;

  const toggle = (checked: boolean) =>
    run(r.id, () =>
      checked ? confirmChange(name, new Date().toISOString()) : unconfirm,
    );

  async function remove() {
    if (!confirm(`Delete requirement "${r.def.title}"?`)) return;
    await run(r.id, () => removeCustom);
  }

  return (
    <li className="py-1.5" data-testid={`requirement-${r.id}`}>
      <div className="flex items-start gap-2">
        {canAttest && !dismissed ? (
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0 accent-pine"
            checked={!!r.record?.confirmed}
            disabled={busy}
            onChange={(ev) => toggle(ev.target.checked)}
            aria-label={`Household confirms: ${r.def.title}`}
          />
        ) : (
          <span
            aria-hidden
            className={cx(
              "mt-1.5 size-3 shrink-0 rounded-full",
              r.satisfied ? "bg-pine" : "border border-line-strong",
            )}
          />
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="min-w-0 flex-1 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          <span
            className={cx(
              "text-sm",
              dismissed ? "text-slate line-through" : "text-ivory",
            )}
          >
            {r.def.title}
          </span>
          {(r.custom || r.customized || r.def.appliesIf) && (
            <span className="ml-1.5 text-[11px] text-slate">
              {r.custom
                ? "Custom"
                : r.customized
                  ? "Customized"
                  : "If applicable"}
            </span>
          )}
          {r.status !== "not-started" &&
            r.reason !== "Confirmed by household" && (
              <span className="block truncate text-[11px] text-sage">
                {r.reason}
              </span>
            )}
        </button>
        <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
        <ChevronDown
          size={14}
          aria-hidden
          className={cx(
            "mt-1 shrink-0 text-slate transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </div>

      {open && (
        <div id={panelId} className="mt-2 space-y-2 pb-1 pl-6 text-xs">
          {mode === "edit" ? (
            <EditText r={r} onDone={() => setMode(null)} />
          ) : (
            <>
              <p className="whitespace-pre-line text-ivory-dim">
                {r.def.explanation}
              </p>
              {r.def.appliesIf && (
                <p className="text-sage">{r.def.appliesIf}</p>
              )}
              {r.customized && r.original && (
                <div className="rounded-md border border-line bg-well px-2.5 py-1.5 text-sage">
                  <p className="text-[11px] text-slate">
                    Original recommendation
                  </p>
                  <p className="text-ivory-dim">{r.original.title}</p>
                  <p>{r.original.explanation}</p>
                </div>
              )}
              {!r.satisfied && !dismissed && (
                <p className="text-sage">
                  <span className="text-slate">Next: </span>
                  {r.def.action}
                </p>
              )}
              {r.record?.confirmed && (
                <p className="text-slate">
                  Confirmed by {r.record.confirmed.by} on{" "}
                  {r.record.confirmed.at.slice(0, 10)} — reported by the
                  household, not independently verified.
                </p>
              )}
              {dismissed && (
                <p className="text-slate">
                  Marked not applicable
                  {r.record!.notApplicable!.reason &&
                    `: “${r.record!.notApplicable!.reason}”`}
                  {r.status === "needs-review" &&
                    ". This is core guidance, so it still counts toward the goal."}
                </p>
              )}
            </>
          )}

          {linkable && mode !== "edit" && (
            <LinkedItems
              r={r}
              items={items}
              today={today}
              category={
                linkable.kind === "inventory"
                  ? (linkable.category ?? e.category)
                  : e.category
              }
            />
          )}

          {r.tasks.length > 0 && (
            <ul className="space-y-0.5">
              {r.tasks.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-slate">Task:</span>
                  <Link
                    href={`/tasks/?task=${encodeURIComponent(t.id)}`}
                    className="text-ivory hover:text-copper-light"
                  >
                    {t.title}
                  </Link>
                  <span className="text-sage">
                    {TASK_STATUS_LABEL[t.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {mode !== "edit" && <Sources r={r} />}

          {mode === "na" ? (
            <NotApplicableForm r={r} onDone={() => setMode(null)} name={name} />
          ) : (
            mode !== "edit" && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className={quietBtn}
                  icon={Pencil}
                  onClick={() => setMode("edit")}
                >
                  {r.custom ? "Edit" : "Customize"}
                </Button>
                {r.customized && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={quietBtn}
                    icon={RotateCcw}
                    disabled={busy}
                    onClick={() => run(r.id, () => resetText)}
                  >
                    Restore default
                  </Button>
                )}
                {dismissed ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={quietBtn}
                    icon={RotateCcw}
                    disabled={busy}
                    onClick={() => run(r.id, () => restoreApplicable)}
                  >
                    Restore
                  </Button>
                ) : (
                  dismissable && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className={quietBtn}
                      icon={Ban}
                      onClick={() => setMode("na")}
                    >
                      Not applicable
                    </Button>
                  )
                )}
                {r.custom && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cx(quietBtn, "text-rust")}
                    icon={Trash2}
                    disabled={busy}
                    onClick={remove}
                  >
                    Delete
                  </Button>
                )}
              </div>
            )
          )}
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </li>
  );
}

function Sources({ r }: { r: EvaluatedRequirement }) {
  const refs = r.def.sources.map((id) => SOURCES[id]);
  return (
    <details className="group">
      <summary className="cursor-pointer text-[11px] text-slate select-none hover:text-sage">
        {EVIDENCE_LABEL[r.custom ? "household" : r.def.evidence]}
        {refs.length > 0 &&
          ` · ${refs.length} source${refs.length === 1 ? "" : "s"}`}
        {r.customized && " · wording customized by household"}
      </summary>
      {refs.length === 0 ? (
        <p className="mt-1 text-slate">
          {r.custom
            ? "Added by your household."
            : "No authoritative source recorded yet."}
        </p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {refs.map((s) => (
            <li key={s.url} className="text-slate">
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sage underline decoration-line-strong underline-offset-2 hover:text-ivory"
              >
                {s.publisher}: {s.title}
              </a>
              {s.pageDate && ` · page updated ${s.pageDate}`} · checked{" "}
              {s.reviewed}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function LinkedItems({
  r,
  items,
  today,
  category,
}: {
  r: EvaluatedRequirement;
  items: InventoryItem[];
  today: string;
  category: InventoryItem["category"] | undefined;
}) {
  const { busy, error, run } = useChange();
  const linkedIds = r.record?.inventoryIds ?? [];
  const candidates = usable(items, today).filter(
    (i) => !linkedIds.includes(i.id),
  );
  const suggested = candidates.filter((i) => i.category === category);
  const others = candidates.filter((i) => i.category !== category);
  const missing = linkedIds.filter((id) => !items.some((i) => i.id === id));

  return (
    <div className="space-y-1">
      {(r.linked.length > 0 || missing.length > 0) && (
        <ul className="space-y-0.5">
          {r.linked.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-2">
              <span className="text-slate">Linked:</span>
              <Link
                href={`/inventory/?item=${encodeURIComponent(i.id)}`}
                className="text-ivory hover:text-copper-light"
              >
                {i.name}
              </Link>
              <span className="text-sage tabular-nums">
                {describeQuantity(i)}
              </span>
              <UnlinkButton
                label={i.name}
                busy={busy}
                onClick={() => run(r.id, () => unlinkItem(i.id))}
              />
            </li>
          ))}
          {missing.map((id) => (
            <li key={id} className="flex items-center gap-x-2 text-amber">
              A linked item was removed from inventory.
              <UnlinkButton
                label="removed item"
                busy={busy}
                onClick={() => run(r.id, () => unlinkItem(id))}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {candidates.length > 0 && (
          <Select
            aria-label={`Link an inventory item to ${r.def.title}`}
            className="h-8 w-auto max-w-full text-xs"
            value=""
            disabled={busy}
            onChange={(ev) => {
              const id = ev.target.value;
              if (id) void run(r.id, () => linkItem(id));
            }}
          >
            <option value="">Link an inventory item…</option>
            {suggested.length > 0 && (
              <optgroup label={`${category} items`}>
                {suggested.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label="Other items">
                {others.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.category})
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        )}
        {category && (
          <Link
            href={`/inventory/?category=${encodeURIComponent(category)}&add=1`}
            className="text-copper-light hover:underline"
          >
            Add {category} item
          </Link>
        )}
      </div>
      {suggested.length > 0 && r.linked.length === 0 && (
        <p className="text-[11px] text-slate">
          You have {suggested.length} {category} item
          {suggested.length === 1 ? "" : "s"}. Link the one that meets this
          requirement — category alone doesn’t count.
        </p>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function UnlinkButton({
  label,
  busy,
  onClick,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      aria-label={`Unlink ${label}`}
      className="grid size-6 place-items-center rounded text-slate outline-none hover:text-ivory focus-visible:ring-2 focus-visible:ring-amber"
    >
      <X size={12} aria-hidden />
    </button>
  );
}

function NotApplicableForm({
  r,
  name,
  onDone,
}: {
  r: EvaluatedRequirement;
  name: string;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const { busy, error, run } = useChange();
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const ok = await run(r.id, () =>
      markNotApplicable(reason, name, new Date().toISOString()),
    );
    if (ok) onDone();
  }
  return (
    <form onSubmit={submit} className="space-y-1.5">
      <Field label="Reason (optional)">
        <Input
          value={reason}
          maxLength={MAX_REASON}
          placeholder="e.g. No one takes daily medication"
          onChange={(ev) => setReason(ev.target.value)}
          className="h-8 text-xs"
        />
      </Field>
      <div className="flex gap-1.5">
        <Button type="submit" size="sm" variant="emerald" loading={busy}>
          Mark not applicable
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}

function TextForm({
  initialTitle,
  initialExplanation,
  submitLabel,
  onSubmit,
  onCancel,
  children,
}: {
  initialTitle: string;
  initialExplanation: string;
  submitLabel: string;
  onSubmit: (title: string, explanation: string) => Promise<boolean>;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [explanation, setExplanation] = useState(initialExplanation);
  const [busy, setBusy] = useState(false);
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit(title, explanation);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <Field label="Requirement">
        <Input
          value={title}
          maxLength={MAX_TITLE}
          required
          onChange={(ev) => setTitle(ev.target.value)}
        />
      </Field>
      <Field label="Explanation (optional)">
        <Textarea
          rows={3}
          value={explanation}
          maxLength={MAX_EXPLANATION}
          onChange={(ev) => setExplanation(ev.target.value)}
        />
      </Field>
      {children}
      <div className="flex gap-1.5">
        <Button
          type="submit"
          size="sm"
          variant="emerald"
          icon={Save}
          loading={busy}
          disabled={!title.trim()}
        >
          {submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function EditText({
  r,
  onDone,
}: {
  r: EvaluatedRequirement;
  onDone: () => void;
}) {
  const { error, run } = useChange();
  return (
    <>
      <TextForm
        initialTitle={r.def.title}
        initialExplanation={r.def.explanation}
        submitLabel={r.custom ? "Save" : "Save wording"}
        onCancel={onDone}
        onSubmit={async (title, explanation) => {
          const ok = await run(r.id, () =>
            r.custom
              ? editCustom(title, explanation)
              : customizeText(r.original!, title, explanation),
          );
          if (ok) onDone();
          return ok;
        }}
      >
        {!r.custom && (
          <p className="text-[11px] text-slate">
            Your wording applies to your household only. The original
            recommendation and its sources stay available, and how it is
            completed doesn’t change.
          </p>
        )}
      </TextForm>
      <ErrorText>{error}</ErrorText>
    </>
  );
}

function AddRequirement({ essential: e }: { essential: Essential }) {
  const { household } = useHousehold();
  const [open, setOpen] = useState(false);
  const { error, run, setError } = useChange();

  if (!open) {
    return (
      <Button
        size="sm"
        variant="secondary"
        icon={Plus}
        className="mt-2"
        onClick={() => setOpen(true)}
      >
        Add requirement
      </Button>
    );
  }
  return (
    <div className="mt-2 rounded-md border border-line bg-well p-3">
      <TextForm
        initialTitle=""
        initialExplanation=""
        submitLabel="Add requirement"
        onCancel={() => {
          setError(null);
          setOpen(false);
        }}
        onSubmit={async (title, explanation) => {
          const at = new Date().toISOString();
          const ok = await run(newCustomId(), () =>
            createCustom(
              household.requirementState,
              e.milestone,
              e.key,
              title,
              explanation,
              at,
            ),
          );
          if (ok) setOpen(false);
          return ok;
        }}
      >
        <p className="text-[11px] text-slate">
          Household requirements count toward this goal. Confirm them or link
          inventory when they’re done.
        </p>
      </TextForm>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
