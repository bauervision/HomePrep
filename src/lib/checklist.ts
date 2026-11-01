import {
  BASELINE_BY_ID,
  type Condition,
  type EvidenceClass,
  type RequirementDef,
} from "./baseline";
import { isExpired } from "./quantities";
import type { QuantityRequirementId } from "./requirements";
import type {
  InventoryItem,
  MilestoneKey,
  RequirementRecord,
  RequirementState,
  Task,
} from "./types";

/*
 * Requirement completion
 * ----------------------
 * Deterministic evaluation of each requirement from recorded data only:
 *   met        — a quantitative target is reached (water, food)
 *   evidence   — a selected, in-stock inventory record or a completed task
 *   confirmed  — the household says so (reported, not verified)
 * Applicability is separate from completion: only conditional or custom
 * requirements leave the count when marked not applicable. Dismissing core
 * guidance never improves a goal.
 */

export type RequirementStatus =
  | "not-started"
  | "in-progress"
  | "confirmed"
  | "evidence"
  | "met"
  | "not-applicable"
  | "needs-review";

export const STATUS_LABEL: Record<RequirementStatus, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  confirmed: "Household confirmed",
  evidence: "Evidence supported",
  met: "Met",
  "not-applicable": "Not applicable",
  "needs-review": "Needs review",
};

const SATISFIED: ReadonlySet<RequirementStatus> = new Set([
  "met",
  "evidence",
  "confirmed",
]);
export const isSatisfied = (s: RequirementStatus) => SATISFIED.has(s);

export const MAX_TITLE = 120;
export const MAX_EXPLANATION = 600;
export const MAX_REASON = 200;
export const MAX_CUSTOM = 100;
export const MAX_LINKS = 50;

/** Inputs a requirement can be evaluated against. */
export interface EvalContext {
  items: InventoryItem[];
  tasks: Task[];
  today: string;
  /** Current amount and household target for quantity requirements. */
  quantity: Partial<
    Record<QuantityRequirementId, { current: number; target: number | null }>
  >;
}

export interface EvaluatedRequirement {
  id: string;
  /** Effective definition (household wording applied). */
  def: RequirementDef;
  /** The system definition, when this is a system recommendation. */
  original: RequirementDef | null;
  record: RequirementRecord | undefined;
  custom: boolean;
  /** System recommendation with household wording. */
  customized: boolean;
  status: RequirementStatus;
  satisfied: boolean;
  /** Counts toward the goal (core and applicable). */
  counted: boolean;
  /** Short, verifiable reason for the status. */
  reason: string;
  /** Selected inventory records (usable or not). */
  linked: InventoryItem[];
  /** Tasks referenced by task conditions. */
  tasks: Task[];
}

type ConditionResult = {
  rank: "met" | "evidence" | "confirmed" | "partial" | "stale" | "none";
  reason: string;
};
const RANK = ["none", "stale", "partial", "confirmed", "evidence", "met"];
const rankOf = (r: ConditionResult) => RANK.indexOf(r.rank);
const satisfiedRank = (r: ConditionResult) =>
  r.rank === "met" || r.rank === "evidence" || r.rank === "confirmed";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const inStock = (i: InventoryItem, today: string) =>
  i.quantity > 0 && !isExpired(i, today);

/** Task a task condition refers to: a linked task by ID, or a starter task. */
const taskFor = (c: Extract<Condition, { kind: "task" }>, tasks: Task[]) =>
  tasks.find((t) =>
    c.taskId !== undefined ? t.id === c.taskId : t.seedKey === c.seedKey,
  );

function evaluateCondition(
  c: Condition,
  record: RequirementRecord | undefined,
  ctx: EvalContext,
): ConditionResult {
  switch (c.kind) {
    case "quantity": {
      const q = ctx.quantity[c.id];
      if (!q || q.target === null)
        return { rank: "none", reason: "Household size not set" };
      const unit = c.id === "water" ? "gal" : "meals";
      const text = `${fmt(q.current)} / ${fmt(q.target)} ${unit}`;
      if (q.current >= q.target) return { rank: "met", reason: text };
      return { rank: q.current > 0 ? "partial" : "none", reason: text };
    }
    case "inventory": {
      const ids = record?.inventoryIds ?? [];
      if (ids.length === 0) return { rank: "none", reason: "No item linked" };
      const linked = ctx.items.filter((i) => ids.includes(i.id));
      const ok = linked.filter((i) => inStock(i, ctx.today));
      if (ok.length > 0)
        return {
          rank: "evidence",
          reason: ok.map((i) => i.name).join(", "),
        };
      return {
        rank: "stale",
        reason:
          linked.length === 0
            ? "Linked item was removed"
            : "Linked item is used up or expired",
      };
    }
    case "task": {
      const t = taskFor(c, ctx.tasks);
      if (!t)
        return c.taskId !== undefined
          ? { rank: "stale", reason: "Linked task was deleted" }
          : { rank: "none", reason: "No task" };
      if (t.status === "complete")
        return { rank: "evidence", reason: "Task complete" };
      return {
        rank: t.status === "in_progress" ? "partial" : "none",
        reason: t.status === "in_progress" ? "Task in progress" : "Task open",
      };
    }
    case "attest":
      return record?.confirmed
        ? { rank: "confirmed", reason: "Confirmed by household" }
        : { rank: "none", reason: "Not confirmed" };
  }
}

/** Definition for a household-created requirement. */
function customDef(id: string, r: RequirementRecord): RequirementDef {
  const c = r.custom!;
  const task: Condition[] = c.taskId
    ? [{ kind: "task", taskId: c.taskId }]
    : [];
  const byTask = c.method === "task" && task.length > 0;
  return {
    id,
    goal: c.goal,
    milestones: [c.milestone],
    title: c.title,
    explanation: c.explanation,
    action: byTask
      ? "Complete the linked task."
      : "Link supporting items, or confirm when done.",
    basis: "custom",
    level: "core",
    completion: byTask
      ? { mode: "all", conditions: task }
      : {
          mode: "any",
          conditions: [{ kind: "inventory" }, ...task, { kind: "attest" }],
        },
    sources: [],
    evidence: "household" satisfies EvidenceClass,
    since: 1,
  };
}

/** Applies household wording to a system definition (never to safety text). */
function effective(def: RequirementDef, r: RequirementRecord | undefined) {
  const t = r?.text;
  if (def.safety || !t || (!t.title && !t.explanation))
    return { def, customized: false };
  return {
    def: {
      ...def,
      title: t.title || def.title,
      explanation: t.explanation || def.explanation,
    },
    customized: true,
  };
}

export function evaluateRequirement(
  base: RequirementDef | null,
  id: string,
  record: RequirementRecord | undefined,
  ctx: EvalContext,
): EvaluatedRequirement {
  const custom = !base;
  const { def, customized } = base
    ? effective(base, record)
    : { def: customDef(id, record!), customized: false };
  const results = def.completion.conditions.map((c) =>
    evaluateCondition(c, record, ctx),
  );
  const linkedIds = record?.inventoryIds ?? [];
  const common = {
    id,
    def,
    original: base,
    record,
    custom,
    customized,
    linked: ctx.items.filter((i) => linkedIds.includes(i.id)),
    tasks: def.completion.conditions.flatMap((c) => {
      const t = c.kind === "task" ? taskFor(c, ctx.tasks) : undefined;
      return t ? [t] : [];
    }),
  };

  const dismissable = isDismissable(def, custom);
  if (record?.notApplicable) {
    if (dismissable) {
      return {
        ...common,
        status: "not-applicable",
        satisfied: false,
        counted: false,
        reason: record.notApplicable.reason || "Marked not applicable",
      };
    }
    // Core guidance stays in the count; dismissing it is flagged, not hidden.
    return {
      ...common,
      status: "needs-review",
      satisfied: false,
      counted: def.level === "core",
      reason: "Core guidance can’t be excluded — restore it to continue",
    };
  }

  let status: RequirementStatus;
  let reason: string;
  if (def.completion.mode === "any") {
    const best = results.reduce((a, b) => (rankOf(b) > rankOf(a) ? b : a));
    const stale = results.find((r) => r.rank === "stale");
    status =
      best.rank === "met" ||
      best.rank === "evidence" ||
      best.rank === "confirmed"
        ? best.rank === "met"
          ? "met"
          : best.rank
        : best.rank === "partial"
          ? "in-progress"
          : best.rank === "stale"
            ? "needs-review"
            : "not-started";
    reason = best.rank === "none" && stale ? stale.reason : best.reason;
  } else {
    const done = results.filter(satisfiedRank);
    if (done.length === results.length) {
      const weakest = done.reduce((a, b) => (rankOf(b) < rankOf(a) ? b : a));
      status =
        weakest.rank === "met"
          ? "met"
          : weakest.rank === "evidence"
            ? "evidence"
            : "confirmed";
      reason = results.map((r) => r.reason).join(" · ");
    } else if (results.some((r) => r.rank === "stale")) {
      status = "needs-review";
      reason = results.find((r) => r.rank === "stale")!.reason;
    } else {
      status =
        done.length > 0 || results.some((r) => r.rank === "partial")
          ? "in-progress"
          : "not-started";
      reason = results.find((r) => !satisfiedRank(r))!.reason;
    }
  }
  const satisfied = isSatisfied(status);
  return {
    ...common,
    status,
    satisfied,
    counted: def.level === "core",
    reason,
  };
}

/**
 * Only conditional system requirements and household-created ones may leave
 * the count. Core and safety guidance can't be dismissed.
 */
export const isDismissable = (def: RequirementDef, custom: boolean) =>
  custom || (def.appliesIf !== undefined && !def.safety);

export interface Tally {
  done: number;
  applicable: number;
}

export interface GoalChecklist {
  requirements: EvaluatedRequirement[];
  /** Core requirements: these decide whether the goal is met. */
  core: Tally;
  /** Supporting considerations: tracked, not blocking. */
  supporting: Tally;
  /** Satisfied core requirements resting only on household confirmation. */
  confirmedOnly: number;
  /** Every applicable core requirement is satisfied. */
  complete: boolean;
}

/** Custom requirements for one goal, oldest first. */
export function customEntries(
  state: RequirementState | undefined,
  milestone: MilestoneKey,
  goal: string,
): [string, RequirementRecord][] {
  return Object.entries(state ?? {})
    .filter(
      ([, r]) => r.custom?.milestone === milestone && r.custom.goal === goal,
    )
    .sort(([, a], [, b]) =>
      a.custom!.createdAt.localeCompare(b.custom!.createdAt),
    );
}

/** Evaluates system definitions plus the household's custom requirements. */
export function evaluateGoal(
  defs: RequirementDef[],
  milestone: MilestoneKey,
  goal: string,
  state: RequirementState | undefined,
  ctx: EvalContext,
): GoalChecklist {
  const requirements = [
    ...defs.map((d) => evaluateRequirement(d, d.id, state?.[d.id], ctx)),
    ...customEntries(state, milestone, goal).map(([id, r]) =>
      evaluateRequirement(null, id, r, ctx),
    ),
  ];
  const tally = (core: boolean): Tally => {
    const list = requirements.filter(
      (r) => (r.def.level === "core") === core && r.status !== "not-applicable",
    );
    return {
      done: list.filter((r) => r.satisfied).length,
      applicable: list.length,
    };
  };
  const core = tally(true);
  return {
    requirements,
    core,
    supporting: tally(false),
    confirmedOnly: requirements.filter(
      (r) => r.def.level === "core" && r.status === "confirmed",
    ).length,
    complete: core.done === core.applicable,
  };
}

/* ---------- Household record changes (pure) ---------- */

/** Result of a change: the new record, or null to remove it. */
export type RecordChange = (
  r: RequirementRecord | undefined,
) => RequirementRecord | null;

/** Drops a system record that no longer holds any household decision. */
function prune(r: RequirementRecord): RequirementRecord | null {
  if (r.custom) return r;
  const hasText = !!(r.text?.title || r.text?.explanation);
  if (
    !hasText &&
    !r.notes &&
    !r.notApplicable &&
    !r.confirmed &&
    !(r.inventoryIds && r.inventoryIds.length > 0)
  )
    return null;
  return r;
}

/** Applies one change to the state; returns a new map (input untouched). */
export function applyChange(
  state: RequirementState | undefined,
  id: string,
  change: RecordChange,
  now: string,
): RequirementState {
  const next: RequirementState = { ...(state ?? {}) };
  const result = change(next[id]);
  const kept = result && prune({ ...result, updatedAt: now });
  if (kept) next[id] = kept;
  else delete next[id];
  return next;
}

const clean = (s: string) => s.trim().replace(/\s+/g, " ");

/** Optional details of a household-created requirement. */
export interface CustomOptions {
  method?: "confirm" | "task";
  /** A task of this household. Required when `method` is "task". */
  taskId?: string | null;
  /** Inventory record to link as evidence when the goal is created. */
  inventoryId?: string | null;
  notes?: string;
}

function checkNotes(notes: string) {
  if (notes.length > MAX_EXPLANATION)
    throw new Error(`Keep the notes under ${MAX_EXPLANATION} characters.`);
}

/** Linked task and completion method, validated together. */
function customLink(o: CustomOptions) {
  const taskId = o.taskId || undefined;
  if (o.method === "task" && !taskId)
    throw new Error("Choose the task that completes this goal.");
  return {
    ...(taskId ? { taskId } : {}),
    ...(taskId && o.method === "task" ? { method: "task" as const } : {}),
  };
}

function checkText(title: string, explanation: string) {
  if (!title) throw new Error("Enter a title.");
  if (title.length > MAX_TITLE)
    throw new Error(`Keep the title under ${MAX_TITLE} characters.`);
  if (explanation.length > MAX_EXPLANATION)
    throw new Error(
      `Keep the explanation under ${MAX_EXPLANATION} characters.`,
    );
}

const base = (r: RequirementRecord | undefined): RequirementRecord =>
  r ?? { updatedAt: "" };

export const confirm =
  (by: string, at: string): RecordChange =>
  (r) => ({ ...base(r), confirmed: { by, at } });

export const unconfirm: RecordChange = (r) => ({
  ...base(r),
  confirmed: null,
});

export const markNotApplicable = (
  reason: string,
  by: string,
  at: string,
): RecordChange => {
  const text = clean(reason);
  if (text.length > MAX_REASON)
    throw new Error(`Keep the reason under ${MAX_REASON} characters.`);
  return (r) => ({ ...base(r), notApplicable: { reason: text, by, at } });
};

export const restoreApplicable: RecordChange = (r) => ({
  ...base(r),
  notApplicable: null,
});

/** Household wording for a system recommendation (original is kept). */
export function customizeText(
  original: RequirementDef,
  title: string,
  explanation: string,
): RecordChange {
  if (original.safety) throw new Error("Safety guidance can’t be reworded.");
  const t = clean(title);
  const e = explanation.trim();
  checkText(t, e);
  return (r) => ({
    ...base(r),
    text: {
      ...(t !== original.title ? { title: t } : {}),
      ...(e !== original.explanation ? { explanation: e } : {}),
    },
  });
}

export const resetText: RecordChange = (r) => {
  const next = { ...base(r) };
  delete next.text;
  return next;
};

export const linkItem =
  (itemId: string): RecordChange =>
  (r) => {
    const ids = base(r).inventoryIds ?? [];
    if (ids.includes(itemId)) return base(r);
    if (ids.length >= MAX_LINKS) throw new Error("Too many linked items.");
    return { ...base(r), inventoryIds: [...ids, itemId] };
  };

/** Household notes on any requirement (empty removes them). */
export function setNotes(notes: string): RecordChange {
  const n = notes.trim();
  checkNotes(n);
  return (r) => {
    const next = { ...base(r) };
    if (n) next.notes = n;
    else delete next.notes;
    return next;
  };
}

export const unlinkItem =
  (itemId: string): RecordChange =>
  (r) => ({
    ...base(r),
    inventoryIds: (base(r).inventoryIds ?? []).filter((x) => x !== itemId),
  });

/** A new household requirement (the caller supplies a fresh ID). */
export function createCustom(
  state: RequirementState | undefined,
  milestone: MilestoneKey,
  goal: string,
  title: string,
  explanation: string,
  at: string,
  options: CustomOptions = {},
): RecordChange {
  const t = clean(title);
  const e = explanation.trim();
  checkText(t, e);
  const notes = (options.notes ?? "").trim();
  checkNotes(notes);
  const link = customLink(options);
  const count = Object.values(state ?? {}).filter((r) => r.custom).length;
  if (count >= MAX_CUSTOM)
    throw new Error(
      `A household can have up to ${MAX_CUSTOM} custom requirements.`,
    );
  return () => ({
    custom: {
      milestone,
      goal,
      title: t,
      explanation: e,
      createdAt: at,
      ...link,
    },
    ...(options.inventoryId ? { inventoryIds: [options.inventoryId] } : {}),
    ...(notes ? { notes } : {}),
    updatedAt: at,
  });
}

/**
 * Edits a household-created requirement. Linked task and method are replaced
 * only when `options` is given; notes only when `options.notes` is set.
 */
export function editCustom(
  title: string,
  explanation: string,
  options?: CustomOptions,
): RecordChange {
  const t = clean(title);
  const e = explanation.trim();
  checkText(t, e);
  const notes = options?.notes?.trim();
  if (notes !== undefined) checkNotes(notes);
  const link = options && customLink(options);
  return (r) => {
    if (!r?.custom) throw new Error("This requirement no longer exists.");
    const custom = { ...r.custom, title: t, explanation: e };
    if (link) {
      delete custom.taskId;
      delete custom.method;
      Object.assign(custom, link);
    }
    const next: RequirementRecord = { ...r, custom };
    if (notes !== undefined) {
      if (notes) next.notes = notes;
      else delete next.notes;
    }
    return next;
  };
}

export const removeCustom: RecordChange = () => null;

export const newCustomId = () =>
  `custom-${globalThis.crypto.randomUUID().slice(0, 12)}`;

/** System definition for an ID, if it is one. */
export const systemDef = (id: string) => BASELINE_BY_ID.get(id) ?? null;

/* ---------- Guided plan action ---------- */

export interface PlanAction {
  kind: "start" | "continue" | "review" | "review-flagged";
  label: string;
  /** Requirement to open and focus; null opens the whole list for review. */
  targetId: string | null;
}

/**
 * The goal's primary action. Start/Continue lead to the first open core
 * requirement; a goal needing review leads to the flagged requirement first;
 * a complete goal opens its list for review.
 */
export function planAction(
  c: GoalChecklist,
  status: "met" | "open" | "review",
): PlanAction {
  const open = c.requirements.filter((r) => r.counted && !r.satisfied);
  const flagged = open.find((r) => r.status === "needs-review");
  if (status === "review")
    return {
      kind: "review-flagged",
      label: "Review Requirements",
      targetId: (flagged ?? open[0])?.id ?? null,
    };
  if (c.complete || open.length === 0)
    return { kind: "review", label: "Review Plan", targetId: null };
  const started = c.requirements.some(
    (r) => r.satisfied || r.status === "in-progress",
  );
  return {
    kind: started ? "continue" : "start",
    label: started ? "Continue Plan" : "Start Plan",
    targetId: (flagged ?? open[0]).id,
  };
}
