"use client";

import {
  Ban,
  BookOpen,
  ChevronDown,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
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
import { EVIDENCE_LABEL, SOURCES, type Condition } from "@/lib/baseline";
import {
  confirm as confirmChange,
  createCustom,
  customizeText,
  editCustom,
  isDismissable,
  linkItem,
  markNotApplicable,
  MAX_EXPLANATION,
  MAX_REASON,
  MAX_TITLE,
  newCustomId,
  removeCustom,
  resetText,
  restoreApplicable,
  setNotes,
  STATUS_LABEL,
  unconfirm,
  unlinkItem,
  type CustomOptions,
  type EvaluatedRequirement,
  type RecordChange,
  type RequirementStatus,
} from "@/lib/checklist";
import { updateRequirement } from "@/lib/goals";
import { cardUrl } from "@/lib/library/actions";
import type { GoalDraft } from "@/lib/library-drafts";
import { displayNameOf } from "@/lib/household";
import { describeQuantity } from "@/lib/quantities";
import { usable, type Essential } from "@/lib/readiness";
import {
  TASK_STATUS_LABEL,
  type Category,
  type InventoryItem,
  type Task,
} from "@/lib/types";

const STATUS_TONE: Record<
  RequirementStatus,
  "neutral" | "good" | "warn" | "info"
> = {
  "not-started": "neutral",
  "in-progress": "warn",
  linked: "neutral",
  "needs-evidence": "warn",
  confirmed: "info",
  evidence: "good",
  met: "good",
  "not-applicable": "neutral",
  attention: "warn",
};

const sectionLabel =
  "mb-1.5 text-[11px] font-semibold tracking-[0.14em] text-sage uppercase";
const quietBtn = "h-8 px-2 text-[11px]";

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

/** Applies two record changes in order. */
const both =
  (a: RecordChange, b: RecordChange): RecordChange =>
  (r) => {
    const x = a(r);
    return x && b(x);
  };

const isQuantity = (r: EvaluatedRequirement) =>
  r.def.completion.conditions.some((c) => c.kind === "quantity");

interface RowActions {
  items: InventoryItem[];
  tasks: Task[];
  related: Task[];
  today: string;
  onOpenTask: (taskId: string) => void;
  onAddItem: (category: Category) => void;
  renderQuantity: () => ReactNode;
}

/**
 * "Your Preparedness Goals": every requirement of the selected goal as a
 * compact row — the core requirements that decide progress, then the
 * supporting ones, then "+ New Goal". Rows open in place; changes persist
 * immediately. Which rows are open is owned by the goal workspace so its
 * primary action can open and focus the next requirement.
 */
export function RequirementChecklist({
  essential: e,
  open,
  onToggle,
  draft = null,
  draftNote = null,
  onDraftDone,
  ...actions
}: RowActions & {
  essential: Essential;
  open: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** A Library card's goal draft: opens New Goal prefilled (unsaved). */
  draft?: GoalDraft | null;
  draftNote?: string | null;
  onDraftDone?: () => void;
}) {
  const { core, supporting } = e.checklist;
  const coreRows = e.checklist.requirements.filter(
    (r) => r.def.level === "core",
  );
  const supportRows = e.checklist.requirements.filter(
    (r) => r.def.level === "supporting",
  );
  const row = (r: EvaluatedRequirement) => (
    <RequirementRow
      key={r.id}
      r={r}
      essential={e}
      open={open.has(r.id)}
      onToggle={() => onToggle(r.id)}
      {...actions}
    />
  );

  return (
    <section data-testid="requirements" aria-labelledby="goal-requirements">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3
          id="goal-requirements"
          tabIndex={-1}
          className={cx(
            sectionLabel,
            "rounded outline-none focus-visible:ring-2 focus-visible:ring-amber",
          )}
        >
          Your Preparedness Goals
        </h3>
        <p className="text-[11px] text-sage">
          {core.applicable} counted toward progress
        </p>
      </div>
      {coreRows.length > 0 && (
        <ul className="divide-y divide-line" aria-label="Counted requirements">
          {coreRows.map(row)}
        </ul>
      )}
      {supportRows.length > 0 && (
        <>
          <h4 className={cx(sectionLabel, "mt-3")}>
            Also consider{" "}
            <span className="tracking-normal normal-case">
              · {supporting.done} of {supporting.applicable} · not counted
              toward progress
            </span>
          </h4>
          <ul className="divide-y divide-line" aria-label="Also consider">
            {supportRows.map(row)}
          </ul>
        </>
      )}
      {draftNote && (
        <p role="status" className="mt-2 text-xs text-sage">
          {draftNote}
        </p>
      )}
      <NewGoal
        key={draft?.libraryEntryId ?? "new"}
        essential={e}
        draft={draft}
        onDraftDone={onDraftDone}
        items={actions.items}
        tasks={actions.tasks}
        related={actions.related}
        today={actions.today}
      />
    </section>
  );
}

function RequirementRow({
  r,
  essential: e,
  open,
  onToggle,
  items,
  tasks,
  related,
  today,
  onOpenTask,
  onAddItem,
  renderQuantity,
}: RowActions & {
  r: EvaluatedRequirement;
  essential: Essential;
  open: boolean;
  onToggle: () => void;
}) {
  const { user } = useHousehold();
  const [mode, setMode] = useState<null | "edit" | "na">(null);
  const { busy, error, run } = useChange();
  const name = displayNameOf(user);
  const quantity = isQuantity(r);
  // Confirmation is one condition: where every condition is mandatory
  // ("all"), ticking it never completes the requirement on its own.
  const canAttest = r.def.completion.conditions.some(
    (c) => c.kind === "attest",
  );
  const linkable = r.def.completion.conditions.find(
    (c) => c.kind === "inventory",
  );
  const dismissable = isDismissable(r.original ?? r.def, r.custom);
  const dismissed = !!r.record?.notApplicable;
  const editable = !quantity && !r.def.safety;
  const panelId = `req-${r.id}`;

  const toggle = (checked: boolean) =>
    run(r.id, () =>
      checked ? confirmChange(name, new Date().toISOString()) : unconfirm,
    );

  async function remove() {
    if (!confirm(`Delete goal "${r.def.title}"?`)) return;
    await run(r.id, () => removeCustom);
  }

  const tag = r.def.safety
    ? "Safety"
    : r.custom
      ? "Custom"
      : r.customized
        ? "Customized"
        : r.def.appliesIf
          ? "If applicable"
          : null;

  return (
    <li
      className="py-1"
      data-testid={`requirement-${r.id}`}
      data-status={r.status}
    >
      <div className="flex items-start gap-1">
        {canAttest && !dismissed ? (
          <label className="-my-0.5 grid size-9 shrink-0 cursor-pointer place-items-center">
            <input
              type="checkbox"
              className="size-[18px] accent-pine"
              checked={!!r.record?.confirmed}
              disabled={busy}
              onChange={(ev) => toggle(ev.target.checked)}
              aria-label={`Household confirms: ${r.def.title}`}
            />
          </label>
        ) : (
          <span aria-hidden className="grid size-9 shrink-0 place-items-center">
            <span
              className={cx(
                "size-3 rounded-full",
                r.satisfied ? "bg-pine" : "border border-line-strong",
              )}
            />
          </span>
        )}
        <button
          type="button"
          id={`req-toggle-${r.id}`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex min-h-9 min-w-0 flex-1 items-start gap-2 rounded py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={cx(
                  "text-sm",
                  dismissed ? "text-slate line-through" : "text-ivory",
                )}
              >
                {r.def.title}
              </span>
              {tag && (
                <span
                  className={cx(
                    "text-[11px]",
                    r.def.safety ? "text-amber" : "text-slate",
                  )}
                >
                  {tag}
                </span>
              )}
              <Badge tone={STATUS_TONE[r.status]}>
                {STATUS_LABEL[r.status]}
              </Badge>
            </span>
            {r.status !== "not-started" &&
              r.reason !== "Confirmed by household" && (
                <span className="mt-0.5 block text-[11px] text-sage">
                  {r.reason}
                </span>
              )}
          </span>
          <ChevronDown
            size={16}
            aria-hidden
            className={cx(
              "mt-0.5 shrink-0 text-slate transition-transform motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>
      </div>

      {open && (
        <div id={panelId} className="mt-1 space-y-2 pb-2 pl-10 text-xs">
          {mode === "edit" ? (
            r.custom ? (
              <GoalForm
                essential={e}
                items={items}
                tasks={tasks}
                related={related}
                today={today}
                existing={r}
                onDone={() => setMode(null)}
              />
            ) : (
              <CustomizeForm r={r} onDone={() => setMode(null)} />
            )
          ) : (
            <>
              <p className="whitespace-pre-line text-ivory-dim">
                {r.def.explanation}
              </p>
              {r.def.safety && (
                <p className="flex gap-1.5 text-amber">
                  <ShieldAlert size={14} aria-hidden className="shrink-0" />
                  Safety guidance: it can’t be marked not applicable or
                  reworded.
                </p>
              )}
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
              {quantity && renderQuantity()}
              {!r.satisfied && !dismissed && !quantity && (
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
                  {r.status === "attention" &&
                    ". This is core guidance, so it still counts toward the goal."}
                </p>
              )}
              {r.record?.notes && (
                <p className="whitespace-pre-line text-sage">
                  <span className="text-slate">Notes: </span>
                  {r.record.notes}
                </p>
              )}
              {r.record?.custom?.libraryEntryId && (
                <p className="flex items-center gap-1.5 text-sage">
                  <BookOpen size={13} aria-hidden />
                  Drafted from a Library card:{" "}
                  <Link
                    href={cardUrl(r.record.custom.libraryEntryId)}
                    className="text-copper-light hover:underline"
                  >
                    open it in the Library
                  </Link>
                </p>
              )}
            </>
          )}

          {linkable && mode !== "edit" && (
            <LinkedItems
              r={r}
              items={items}
              today={today}
              condition={linkable.kind === "inventory" ? linkable : null}
              category={
                linkable.kind === "inventory"
                  ? (linkable.category ?? e.category)
                  : e.category
              }
              onAddItem={onAddItem}
            />
          )}

          {r.tasks.length > 0 && mode !== "edit" && (
            <ul className="space-y-0.5">
              {r.tasks.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-2">
                  <span className="text-slate">Task:</span>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => onOpenTask(t.id)}
                    className="min-h-8 rounded text-left text-ivory underline decoration-line-strong underline-offset-2 outline-none hover:text-copper-light focus-visible:ring-2 focus-visible:ring-amber"
                  >
                    {t.title}
                  </button>
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
                {editable && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={quietBtn}
                    icon={Pencil}
                    onClick={() => setMode("edit")}
                  >
                    {r.custom ? "Edit" : "Customize"}
                  </Button>
                )}
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
      <summary className="cursor-pointer py-1 text-[11px] text-slate select-none hover:text-sage">
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

/**
 * How much a linked item says about this requirement. A link is evidence the
 * household selected, not proof that the requirement is met.
 */
function linkGuidance(c: Extract<Condition, { kind: "inventory" }> | null) {
  if (!c || c.sufficient) return null;
  if (c.covers)
    return `Covers: ${c.covers.join(", ")}. A linked item shows only what it is, so confirm once you have every one of these.`;
  return "A linked item is evidence you selected, not proof. Confirm when what you have covers this requirement.";
}

function LinkedItems({
  r,
  items,
  today,
  condition,
  category,
  onAddItem,
}: {
  r: EvaluatedRequirement;
  items: InventoryItem[];
  today: string;
  condition: Extract<Condition, { kind: "inventory" }> | null;
  category: Category | undefined;
  onAddItem: (category: Category) => void;
}) {
  const guidance = linkGuidance(condition);
  const { busy, error, run } = useChange();
  const linkedIds = r.record?.inventoryIds ?? [];
  const candidates = usable(items, today).filter(
    (i) => !linkedIds.includes(i.id),
  );
  const suggested = candidates.filter((i) => i.category === category);
  const missing = linkedIds.filter((id) => !items.some((i) => i.id === id));

  return (
    <div className="space-y-1">
      {guidance && (
        <p className="text-[11px] text-slate" data-testid="link-guidance">
          {guidance}
        </p>
      )}
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
            className="h-9 w-auto max-w-full text-xs"
            value=""
            disabled={busy}
            onChange={(ev) => {
              const id = ev.target.value;
              if (id) void run(r.id, () => linkItem(id));
            }}
          >
            <option value="">Link an inventory item…</option>
            <ItemOptions items={candidates} category={category} />
          </Select>
        )}
        {category && (
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => onAddItem(category)}
            className="min-h-8 rounded text-copper-light outline-none hover:underline focus-visible:ring-2 focus-visible:ring-amber"
          >
            Add {category} Item
          </button>
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

/** Inventory options, the goal's category first. */
function ItemOptions({
  items,
  category,
}: {
  items: InventoryItem[];
  category: Category | undefined;
}) {
  const suggested = items.filter((i) => i.category === category);
  const others = items.filter((i) => i.category !== category);
  return (
    <>
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
    </>
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
      className="grid size-8 place-items-center rounded text-slate outline-none hover:text-ivory focus-visible:ring-2 focus-visible:ring-amber"
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
          className="h-9 text-xs"
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

/** Household wording and notes for a system recommendation. */
function CustomizeForm({
  r,
  onDone,
}: {
  r: EvaluatedRequirement;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(r.def.title);
  const [explanation, setExplanation] = useState(r.def.explanation);
  const [notes, setNotesText] = useState(r.record?.notes ?? "");
  const { busy, error, run } = useChange();
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    const ok = await run(r.id, () =>
      both(customizeText(r.original!, title, explanation), setNotes(notes)),
    );
    if (ok) onDone();
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <Field label="Goal title">
        <Input
          value={title}
          maxLength={MAX_TITLE}
          required
          onChange={(ev) => setTitle(ev.target.value)}
        />
      </Field>
      <Field label="Description">
        <Textarea
          rows={3}
          value={explanation}
          maxLength={MAX_EXPLANATION}
          onChange={(ev) => setExplanation(ev.target.value)}
        />
      </Field>
      <Field label="Notes (optional)">
        <Textarea
          rows={2}
          value={notes}
          maxLength={MAX_EXPLANATION}
          onChange={(ev) => setNotesText(ev.target.value)}
        />
      </Field>
      <p className="text-[11px] text-slate">
        Your wording applies to your household only. The original recommendation
        and its sources stay available, and how it is completed doesn’t change.
      </p>
      <div className="flex gap-1.5">
        <Button
          type="submit"
          size="sm"
          variant="emerald"
          icon={Save}
          loading={busy}
          disabled={!title.trim()}
        >
          Save wording
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}

/**
 * Create or edit a household goal within the selected goal and milestone —
 * both come from context, so they are never asked for again.
 */
export function GoalForm({
  essential: e,
  items,
  tasks,
  related,
  today,
  existing,
  prefill,
  blocked,
  onDone,
}: {
  essential: Essential;
  items: InventoryItem[];
  tasks: Task[];
  related: Task[];
  today: string;
  existing?: EvaluatedRequirement;
  /** Starting values for a new goal (a Library draft). */
  prefill?: GoalDraft | null;
  blocked?: string | null;
  onDone: () => void;
}) {
  const { household } = useHousehold();
  const c = existing?.record?.custom;
  const [title, setTitle] = useState(c?.title ?? prefill?.title ?? "");
  const [explanation, setExplanation] = useState(
    c?.explanation ?? prefill?.explanation ?? "",
  );
  const [method, setMethod] = useState<"confirm" | "task">(
    c?.method ?? "confirm",
  );
  const [taskId, setTaskId] = useState(c?.taskId ?? "");
  const [inventoryId, setInventoryId] = useState("");
  const [notes, setNotesText] = useState(
    existing?.record?.notes ?? prefill?.notes ?? "",
  );
  const { busy, error, run } = useChange();

  // The goal's related tasks first, then the rest of this milestone's.
  const others = tasks.filter(
    (t) => t.milestone === e.milestone && !related.includes(t),
  );

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy || blocked) return;
    const options: CustomOptions = {
      method,
      taskId: taskId || null,
      notes,
      ...(existing
        ? {}
        : {
            inventoryId: inventoryId || null,
            libraryEntryId: prefill?.libraryEntryId ?? null,
          }),
    };
    const ok = existing
      ? await run(existing.id, () => editCustom(title, explanation, options))
      : await run(newCustomId(), () =>
          createCustom(
            household.requirementState,
            e.milestone,
            e.key,
            title,
            explanation,
            new Date().toISOString(),
            options,
          ),
        );
    if (ok) onDone();
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-2"
      aria-label={existing ? "Edit goal" : "New goal"}
    >
      {blocked && (
        <p role="alert" className="text-sm text-amber">
          {blocked}
        </p>
      )}
      <Field label="Goal title">
        <Input
          value={title}
          maxLength={MAX_TITLE}
          required
          data-autofocus
          autoFocus={!existing}
          onChange={(ev) => setTitle(ev.target.value)}
        />
      </Field>
      <Field label="Description (optional)">
        <Textarea
          rows={2}
          value={explanation}
          maxLength={MAX_EXPLANATION}
          onChange={(ev) => setExplanation(ev.target.value)}
        />
      </Field>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Linked task (optional)">
          <Select
            value={taskId}
            onChange={(ev) => {
              setTaskId(ev.target.value);
              if (!ev.target.value) setMethod("confirm");
            }}
          >
            <option value="">No linked task</option>
            {related.length > 0 && (
              <optgroup label="Related tasks">
                {related.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label="Other tasks">
                {others.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>
        <Field label="Completed by">
          <Select
            value={method}
            onChange={(ev) => setMethod(ev.target.value as "confirm" | "task")}
          >
            <option value="confirm">
              Household confirms (or a linked item)
            </option>
            <option value="task" disabled={!taskId}>
              The linked task being completed
            </option>
          </Select>
        </Field>
      </div>
      {!existing && (
        <Field label="Linked inventory item (optional)">
          <Select
            value={inventoryId}
            onChange={(ev) => setInventoryId(ev.target.value)}
          >
            <option value="">No linked item</option>
            <ItemOptions items={usable(items, today)} category={e.category} />
          </Select>
        </Field>
      )}
      <Field label="Notes (optional)">
        <Textarea
          rows={2}
          value={notes}
          maxLength={MAX_EXPLANATION}
          onChange={(ev) => setNotesText(ev.target.value)}
        />
      </Field>
      <div className="flex gap-1.5">
        <Button
          type="submit"
          size="sm"
          variant="emerald"
          icon={Save}
          loading={busy}
          disabled={!!blocked || !title.trim()}
        >
          Save goal
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}

function NewGoal({
  essential: e,
  draft,
  onDraftDone,
  ...rest
}: {
  essential: Essential;
  draft: GoalDraft | null;
  onDraftDone?: () => void;
  items: InventoryItem[];
  tasks: Task[];
  related: Task[];
  today: string;
}) {
  const [open, setOpen] = useState(!!draft);
  const close = () => {
    setOpen(false);
    if (draft) onDraftDone?.();
  };
  if (!open) {
    return (
      <Button
        size="sm"
        variant="secondary"
        icon={Plus}
        className="mt-2 min-h-10 w-full justify-center sm:min-h-0 sm:w-auto"
        onClick={() => setOpen(true)}
      >
        New Goal
      </Button>
    );
  }
  return (
    <div className="mt-2 rounded-md border border-line bg-well p-3">
      <p className="mb-2 text-[11px] text-slate">
        New goal for {e.label} · counts toward this goal’s progress.
      </p>
      {draft && (
        <p className="mb-2 text-xs text-sage">
          Drafted from the Library card{" "}
          <Link
            href={cardUrl(draft.libraryEntryId)}
            className="text-copper-light hover:underline"
          >
            {draft.title}
          </Link>
          . Review and edit before saving; nothing is saved until you do, and it
          isn’t complete until your household completes it.
        </p>
      )}
      <GoalForm essential={e} {...rest} prefill={draft} onDone={close} />
    </div>
  );
}
