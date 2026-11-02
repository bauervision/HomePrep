"use client";

import {
  ChevronDown,
  ExternalLink,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Button, cx, linkClass } from "@/components/ui";
import {
  citationParts,
  formatDate,
  humanize,
  milestoneLabel,
  relationshipLabel,
  STATUS_LABEL,
  STATUS_TONE,
} from "@/lib/library/format";
import { useBookDetail } from "@/lib/library/load";
import type {
  BookDetail,
  DisplayStatus,
  EntryBase,
  EvidenceRecord,
  GuidanceEntry,
  LibrarySource,
  LibraryTopic,
  ReviewIndexEntry,
  SourceCitation,
} from "@/lib/library/types";

/*
 * Entry details. Source strings are rendered as React text, never as HTML.
 * Reviewed guidance leads; original book material is kept in a collapsed,
 * labeled section. Nothing here writes household data or awards credit.
 */

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} wrap>
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

const topicNames = (e: EntryBase, topics: LibraryTopic[]) =>
  e.topic_ids.map((id) => topics.find((t) => t.id === id)?.label ?? id);

export function Citation({ c }: { c: SourceCitation }) {
  const p = citationParts(c);
  return (
    <span>
      {p.book} · {p.pdf}
      {p.section && <span className="text-slate"> · {p.section}</span>}
    </span>
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
                    r.accessed_on && `Accessed ${formatDate(r.accessed_on)}`,
                    r.access_status && humanize(r.access_status),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </>
            )}
            {ref.scope && (
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

function Milestones({ entry }: { entry: EntryBase }) {
  if (!entry.milestone_mapping.length) return null;
  return (
    <Section title="Milestone associations (informational)">
      <p className="text-xs text-slate">
        Research metadata only. These don’t map to your household objectives or
        count toward readiness.
      </p>
      <ul className="mt-1.5 space-y-1">
        {entry.milestone_mapping.map((m, i) => (
          <li key={i}>
            <span className="text-ivory">{milestoneLabel(m.milestone)}</span>
            <span className="text-slate"> · {humanize(m.relevance)}</span>
            {m.rationale && (
              <span className="block text-xs text-slate">{m.rationale}</span>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Meta({ entry, topics }: { entry: EntryBase; topics: LibraryTopic[] }) {
  return (
    <div className="mb-4 space-y-1.5">
      <StatusBadge status={entry.status} />
      <p className="text-xs text-slate">
        {topicNames(entry, topics).join(", ")}
        {entry.reviewed_on && <> · Reviewed {formatDate(entry.reviewed_on)}</>}
      </p>
    </div>
  );
}

export function GuidanceDetail({
  entry,
  topics,
  evidence,
}: {
  entry: GuidanceEntry;
  topics: LibraryTopic[];
  evidence: Map<string, EvidenceRecord>;
}) {
  const c = entry.card;
  return (
    <article>
      <Meta entry={entry} topics={topics} />
      <Notice>
        <strong className="text-ivory">Example plan for five people.</strong>{" "}
        Quantities are a fixed example, not calculated from your household.
        Reading this doesn’t change your plan, tasks or readiness.
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
        <Milestones entry={entry} />
      </div>
    </article>
  );
}

const STATUS_NOTE: Record<DisplayStatus, string> = {
  authority_supported: "",
  verified_principle:
    "Verified only within the scope below. This doesn’t approve the book’s original recipe, installation or build.",
  source_reference:
    "Summarizes what the source says. It hasn’t been independently verified.",
  needs_review:
    "Unresolved or incomplete as written. These are not approved instructions.",
  unavailable:
    "This record’s review status couldn’t be confirmed. Treat it as unreviewed; it is not approved instructions.",
};

function BookReviewBody({
  indexEntry,
  detail,
  source,
  topics,
}: {
  indexEntry: ReviewIndexEntry;
  detail: BookDetail;
  source: LibrarySource;
  topics: LibraryTopic[];
}) {
  const full = detail.entries.get(indexEntry.id);
  if (!full) return <UnavailableBody />;
  // Index and detail must agree; otherwise fail closed.
  const status: DisplayStatus =
    full.status === indexEntry.status ? full.status : "unavailable";
  const r = full.record;
  const chapter = source.chapters.find((c) => c.id === r.chapter_id);
  return (
    <article>
      <Meta entry={{ ...full, status }} topics={topics} />
      <Notice tone={status === "verified_principle" ? "info" : "warn"}>
        {STATUS_NOTE[status]}
      </Notice>
      <div className="mt-4">
        <Section title="Reviewed guidance">
          <p className="text-ivory">{r.reviewed_guidance ?? full.summary}</p>
        </Section>
        {r.verification.review_requirement && (
          <Section title="Review requirement">
            <p>{r.verification.review_requirement}</p>
          </Section>
        )}
        {full.safety_flags.length > 0 && (
          <Section title="Safety flags">
            <ul className="flex flex-wrap gap-1.5" aria-label="Safety flags">
              {full.safety_flags.map((f) => (
                <li key={f}>
                  <Badge tone="bad">{humanize(f)}</Badge>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {full.correction_ids.length > 0 && (
          <Section title="Corrections">
            <ul className="space-y-2">
              {full.correction_ids.map((id) => {
                const c = detail.corrections.get(id);
                return (
                  <li
                    key={id}
                    className="rounded-lg border border-amber/30 px-3 py-2"
                  >
                    {c ? (
                      <>
                        <p className="font-medium text-ivory">{c.title}</p>
                        <p className="mt-0.5">{c.guidance}</p>
                        <p className="mt-1 text-xs text-slate">
                          {id}
                          {c.basis && <> · Basis: {humanize(c.basis)}</>}
                          {c.evidence_ids.length > 0 && (
                            <> · Evidence {c.evidence_ids.join(", ")}</>
                          )}
                        </p>
                      </>
                    ) : (
                      <p className="text-rust">
                        Correction {id} is unavailable.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
        <Section title="Evidence">
          <p className="mb-2 text-xs text-slate">
            Each relationship applies only to its stated scope; none verifies
            the entire original claim.
          </p>
          <EvidenceList entry={full} records={detail.evidence} />
        </Section>
        <Section title="Review">
          <ul className="space-y-0.5">
            <li>
              Verification status:{" "}
              {humanize(r.verification.status ?? "not recorded")}
            </li>
            <li>
              Reviewed{" "}
              {formatDate(r.verification.reviewed_on ?? full.reviewed_on) ??
                "date not recorded"}
            </li>
            {r.verification.verified_on && (
              <li>Verified {formatDate(r.verification.verified_on)}</li>
            )}
          </ul>
        </Section>
        <Section title="Source">
          <p className="text-ivory">
            {source.title}
            {source.author && (
              <span className="text-ivory-dim"> · {source.author}</span>
            )}
          </p>
          {chapter && (
            <p className="text-xs text-slate">
              {chapter.number !== null && <>Chapter {chapter.number}: </>}
              {chapter.title}
            </p>
          )}
          <ul className="mt-1 space-y-0.5 text-xs" aria-label="Citations">
            {full.source_citations.map((c, i) => (
              <li key={i}>
                <Citation c={c} />
              </li>
            ))}
          </ul>
        </Section>
        <Milestones entry={full} />
        <details className="group mt-5 rounded-lg border border-line">
          <summary className="cursor-pointer list-none rounded-lg px-3 py-2.5 text-sm font-medium text-ivory outline-none hover:bg-well focus-visible:ring-2 focus-visible:ring-amber">
            <span className="flex items-center gap-2">
              <TriangleAlert
                size={15}
                aria-hidden
                className="shrink-0 text-amber"
              />
              <span className="flex-1">
                Original source material — unreviewed, not instructions
              </span>
              <ChevronDown
                size={15}
                aria-hidden
                className="shrink-0 text-slate transition-transform group-open:rotate-180 motion-reduce:transition-none"
              />
            </span>
          </summary>
          <div className="space-y-3 border-t border-line px-3 py-3 text-sm text-ivory-dim">
            <p className="text-xs text-amber">
              The book’s material as recorded, for reference. It is not reviewed
              guidance; rely on the reviewed guidance and corrections above.
            </p>
            {r.original_claim && (
              <div>
                <p className="text-[11px] font-semibold tracking-[0.12em] text-sage uppercase">
                  Original claim
                  {r.original_claim.representation &&
                    ` (${humanize(r.original_claim.representation)})`}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap">
                  {r.original_claim.text}
                </p>
              </div>
            )}
            {r.item_type && (
              <p className="text-xs text-slate">
                Record type: {humanize(r.item_type)}
                {r.duplicate_group && (
                  <>
                    {" "}
                    · Research group: {humanize(r.duplicate_group)} (a coarse
                    label, not a merge of instructions)
                  </>
                )}
              </p>
            )}
            {r.source_components.length > 0 && (
              <ol className="space-y-2" aria-label="Source components">
                {r.source_components.map((c, i) => (
                  <li key={i} className="rounded-md bg-well px-2.5 py-2">
                    <p className="text-[11px] text-slate">
                      {humanize(c.kind)}
                      {c.source_label && <> · {c.source_label}</>}
                      {c.representation && <> · {humanize(c.representation)}</>}
                    </p>
                    <p className="mt-0.5 [overflow-wrap:anywhere] whitespace-pre-wrap">
                      {c.text}
                    </p>
                    {c.source_citations.map((s, j) => (
                      <p key={j} className="mt-0.5 text-[11px] text-slate">
                        <Citation c={s} />
                      </p>
                    ))}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </details>
      </div>
    </article>
  );
}

/** Loads the entry's book file; never shows another entry's content. */
export function BookReviewDetail({
  entry,
  source,
  topics,
}: {
  entry: ReviewIndexEntry;
  source: LibrarySource | undefined;
  topics: LibraryTopic[];
}) {
  const book = useBookDetail(entry.source_id, entry.detail_path);
  if (!source) return <UnavailableBody />;
  if (book.status === "error")
    return <LoadError message={book.error} onRetry={book.retry} what="book" />;
  if (book.status !== "ready")
    return (
      <div className="space-y-3">
        <StatusBadge status={entry.status} />
        <p role="status" className="text-sm text-sage">
          Loading the full review from {source.title}…
        </p>
      </div>
    );
  return (
    <BookReviewBody
      indexEntry={entry}
      detail={book.data}
      source={source}
      topics={topics}
    />
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
