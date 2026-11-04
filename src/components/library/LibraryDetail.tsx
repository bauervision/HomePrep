"use client";

import { ClipboardList, ExternalLink, RotateCcw, Target } from "lucide-react";
import Link from "next/link";
import { useContext, type ReactNode } from "react";
import { SessionContext } from "@/components/SessionProvider";
import { useCollection } from "@/lib/hooks";
import { isTaskFromCard } from "@/lib/library-tasks";
import { TASK_STATUS_LABEL, type Task } from "@/lib/types";
import { Badge, Button, cx, linkClass } from "@/components/ui";
import { libraryActions } from "@/lib/library/actions";
import {
  formatDate,
  humanize,
  relationshipLabel,
  STATUS_LABEL,
} from "@/lib/library/format";
import type {
  DisplayStatus,
  EntryBase,
  EvidenceRecord,
  GuidanceEntry,
} from "@/lib/library/types";

/*
 * Guidance details. Source strings are rendered as React text, never as HTML.
 * Reading a card writes nothing and awards no credit; its actions only open
 * editable drafts in the Tasks and Goals workspaces.
 */

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <Badge tone="good" wrap>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="text-[11px] font-semibold tracking-[0.16em] text-sage uppercase">
        {title}
      </h3>
      <div className="mt-1.5 text-sm leading-relaxed text-ivory-dim">
        {children}
      </div>
    </section>
  );
}

function Bullets({ items, ordered }: { items: string[]; ordered?: boolean }) {
  const List = ordered ? "ol" : "ul";
  return (
    <List
      className={cx(
        "space-y-1 pl-5",
        ordered ? "list-decimal" : "list-disc",
        "marker:text-slate",
      )}
    >
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </List>
  );
}

function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn";
  children: ReactNode;
}) {
  return (
    <p
      className={cx(
        "rounded-lg border px-3 py-2 text-[13px] leading-relaxed",
        tone === "warn"
          ? "border-amber/30 bg-amber/[0.06] text-ivory-dim"
          : "border-line bg-well text-ivory-dim",
      )}
    >
      {children}
    </p>
  );
}

function EvidenceList({
  entry,
  records,
}: {
  entry: EntryBase;
  records: Map<string, EvidenceRecord>;
}) {
  if (!entry.evidence.length)
    return <p className="text-slate">No evidence records are linked.</p>;
  return (
    <ul className="space-y-3">
      {entry.evidence.map((ref) => {
        const r = records.get(ref.evidence_id);
        return (
          <li
            key={ref.evidence_id}
            className="rounded-lg border border-line px-3 py-2"
          >
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge>{relationshipLabel(ref.relationship)}</Badge>
              <span className="font-mono text-[11px] text-slate">
                {ref.evidence_id}
              </span>
            </p>
            {!r ? (
              <p className="mt-1 text-rust">
                Evidence record {ref.evidence_id} is unavailable.
              </p>
            ) : (
              <>
                <p className="mt-1 text-ivory">
                  {[r.publisher, r.title].filter(Boolean).join(" — ")}
                </p>
                {r.url ? (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cx(
                      "mt-0.5 inline-flex items-center gap-1 text-xs",
                      linkClass,
                    )}
                  >
                    External source: {new URL(r.url).hostname}
                    <ExternalLink size={12} aria-hidden />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ) : (
                  <p className="mt-0.5 text-xs text-slate">
                    No secure (HTTPS) link is available for this record.
                  </p>
                )}
                {r.locator && (
                  <p className="mt-1 text-xs text-slate">
                    Section: {r.locator}
                  </p>
                )}
                {(r.finding ?? r.support_scope) && (
                  <p className="mt-1">{r.finding ?? r.support_scope}</p>
                )}
                <p className="mt-1 text-xs text-slate">
                  {[
                    r.page_last_updated &&
                      `Page updated ${formatDate(r.page_last_updated)}`,
                    r.accessed_on && `Checked ${formatDate(r.accessed_on)}`,
                    r.access_status && humanize(r.access_status),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </>
            )}
            {ref.scope &&
              ref.scope !== r?.finding &&
              ref.scope !== r?.support_scope && (
                <p className="mt-1 text-xs text-sage">
                  Scope for this entry: {ref.scope}
                </p>
              )}
          </li>
        );
      })}
    </ul>
  );
}

function Meta({ entry }: { entry: EntryBase }) {
  return (
    <div className="mb-4 space-y-1.5">
      <StatusBadge status={entry.status} />
      {entry.reviewed_on && (
        <p className="text-xs text-slate">
          Reviewed {formatDate(entry.reviewed_on)}
        </p>
      )}
    </div>
  );
}

const actionLink = "btn btn-secondary h-8 min-h-10 px-3 text-xs sm:min-h-0";

/** Draft links near the top of an eligible card. They open, never save. */
function CardActions({ entry }: { entry: GuidanceEntry }) {
  const session = useContext(SessionContext);
  const hid =
    session?.state.status === "ready" ? session.state.household.id : null;
  const tasks = useCollection<Task>(hid ? ["households", hid, "tasks"] : null);
  const matches = tasks.data.filter((t) => isTaskFromCard(t, entry.id));
  const a = libraryActions(entry);
  if (!a) return null;
  return (
    <div className="mb-4 space-y-1.5" data-testid="library-actions">
      <div className="flex flex-wrap gap-2">
        {matches.map((t) => (
          <div key={t.id} className="min-w-0">
            <Link
              href={`/tasks/?task=${encodeURIComponent(t.id)}`}
              className={actionLink}
            >
              View existing task
            </Link>
            <p className="mt-1 text-xs [overflow-wrap:anywhere] text-sage">
              {t.title} · {TASK_STATUS_LABEL[t.status]} ·{" "}
              {t.milestone.replace(/h$/, " hours").replace(/d$/, " days")}
            </p>
          </div>
        ))}
        <Link href={a.taskDraft} className={actionLink}>
          <ClipboardList size={14} aria-hidden />
          {matches.length ? "Add another task" : "Create Task"}
        </Link>
        {a.existingGoal ? (
          <Link href={a.existingGoal} className={actionLink}>
            <Target size={14} aria-hidden />
            View existing goal
          </Link>
        ) : (
          a.goalDraft && (
            <Link href={a.goalDraft} className={actionLink}>
              <Target size={14} aria-hidden />
              Create Goal
            </Link>
          )
        )}
      </div>
      <p className="text-[11px] text-slate">Review the draft before saving.</p>
    </div>
  );
}

export function GuidanceDetail({
  entry,
  evidence,
}: {
  entry: GuidanceEntry;
  evidence: Map<string, EvidenceRecord>;
}) {
  const c = entry.card;
  return (
    <article>
      <Meta entry={entry} />
      <CardActions entry={entry} />
      <Notice>
        Quantities shown are examples for five people; adjust for your
        household.
      </Notice>
      <div className="mt-4">
        <Section title="When to use">
          <p>{c.when_to_use}</p>
        </Section>
        {c.prerequisites.length > 0 && (
          <Section title="Prerequisites">
            <Bullets items={c.prerequisites} />
          </Section>
        )}
        <Section title="Steps">
          <Bullets items={c.steps} ordered />
        </Section>
        {c.limits.length > 0 && (
          <Section title="Limits">
            <Bullets items={c.limits} />
          </Section>
        )}
        <Section title="Observable completion requirements">
          <Bullets items={c.completion.requires} />
          <p className="mt-1 text-xs text-slate">
            Household completion:{" "}
            {c.completion.status === "not_assessed"
              ? "not assessed"
              : humanize(c.completion.status ?? "not assessed")}
          </p>
        </Section>
        {c.maintenance && (
          <Section title="Maintenance">
            <p>{c.maintenance}</p>
          </Section>
        )}
        {c.escalation && (
          <Section title="Escalation">
            <p>{c.escalation}</p>
          </Section>
        )}
        {c.site_confirmation_required && (
          <Section title="Site confirmation">
            <p>Requires confirmation at your own site before relying on it.</p>
          </Section>
        )}
        {c.editorial_adaptation && (
          <Section title="Editorial adaptation">
            <p>{c.editorial_adaptation}</p>
          </Section>
        )}
        <Section title="Authority sources">
          <EvidenceList entry={entry} records={evidence} />
        </Section>
      </div>
    </article>
  );
}

export function LoadError({
  message,
  onRetry,
  what,
}: {
  message: string;
  onRetry: () => void;
  what: string;
}) {
  return (
    <div role="alert" className="space-y-3 py-2">
      <p className="text-sm text-rust">
        Couldn’t load the {what}. {message}
      </p>
      <Button icon={RotateCcw} onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export function UnavailableBody() {
  return (
    <p className="text-sm text-ivory-dim">
      This entry isn’t available in the Library. The link may be incomplete, or
      the record failed validation and isn’t shown.
    </p>
  );
}
