/*
 * Validation of Library payloads. The rules fail closed:
 * - A payload that isn't the expected shape or version throws, so an HTTP or
 *   format failure is never presented as an empty collection.
 * - An entry with an unknown origin, status or action permission never becomes
 *   guidance; book entries with an unrecognized classification stay visible
 *   only as "Review status unavailable".
 */

import {
  LIBRARY_VERSION,
  type BookClassification,
  type BookDetail,
  type BookDetailEntry,
  type BookSourceRecord,
  type Chapter,
  type CoreCard,
  type CorrectionRecord,
  type DisplayStatus,
  type EntryBase,
  type EvidenceRecord,
  type EvidenceRef,
  type ExampleScenario,
  type GuidanceEntry,
  type GuidancePack,
  type LibrarySource,
  type LibraryTopic,
  type MilestoneMapping,
  type ReviewIndexEntry,
  type ReviewsIndex,
  type SourceCitation,
  type SourceComponent,
} from "./types";

export class LibraryDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryDataError";
  }
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : null;
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const strings = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((s) => typeof s === "string") ? v : null;
const list = (v: unknown): unknown[] | null => (Array.isArray(v) ? v : null);

/** Book classification → display status. Anything else is unavailable. */
const BOOK_STATUS: Record<BookClassification, DisplayStatus> = {
  verified_guidance: "verified_principle",
  source_derived_reference: "source_reference",
  needs_review: "needs_review",
};

const isClassification = (v: unknown): v is BookClassification =>
  typeof v === "string" && Object.hasOwn(BOOK_STATUS, v);

/** HTTPS links only; anything else is shown as an unavailable link. */
export function safeHttpsUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Detail files live under `books/`; nothing else may be requested. */
const DETAIL_PATH = /^books\/[A-Za-z0-9_-]+\.json$/;

function requirePayload(raw: unknown, what: string): Obj {
  if (!isObj(raw)) throw new LibraryDataError(`${what} is not a JSON object.`);
  if (raw.content_version !== LIBRARY_VERSION)
    throw new LibraryDataError(
      `${what} has content version ${String(raw.content_version)}; expected ${LIBRARY_VERSION}.`,
    );
  return raw;
}

function requireList(o: Obj, key: string, what: string): unknown[] {
  const v = list(o[key]);
  if (!v) throw new LibraryDataError(`${what} is missing its ${key} list.`);
  return v;
}

function citation(v: unknown): SourceCitation | null {
  if (!isObj(v)) return null;
  const page = (x: unknown) => (x === null ? null : num(x));
  const keys = [
    "book_page_start",
    "book_page_end",
    "pdf_page_start",
    "pdf_page_end",
  ] as const;
  // A present-but-invalid page value is malformed; null means unnumbered.
  for (const k of keys)
    if (v[k] !== null && v[k] !== undefined && num(v[k]) === null) return null;
  return {
    book_page_start: page(v.book_page_start ?? null),
    book_page_end: page(v.book_page_end ?? null),
    pdf_page_start: page(v.pdf_page_start ?? null),
    pdf_page_end: page(v.pdf_page_end ?? null),
    section: str(v.section),
  };
}

function citations(v: unknown): SourceCitation[] | null {
  const l = list(v);
  if (!l) return null;
  const out = l.map(citation);
  return out.every((c) => c) ? (out as SourceCitation[]) : null;
}

function evidenceRef(v: unknown): EvidenceRef | null {
  if (!isObj(v) || !str(v.evidence_id) || !str(v.relationship)) return null;
  return {
    evidence_id: v.evidence_id as string,
    url: str(v.url),
    relationship: v.relationship as string,
    scope: str(v.scope),
  };
}

function milestone(v: unknown): MilestoneMapping | null {
  if (!isObj(v) || !str(v.milestone) || !str(v.relevance)) return null;
  return {
    milestone: v.milestone as string,
    relevance: v.relevance as string,
    rationale: str(v.rationale),
  };
}

function all<T>(v: unknown, f: (x: unknown) => T | null): T[] | null {
  const l = list(v);
  if (!l) return null;
  const out = l.map(f);
  return out.every((x) => x !== null) ? (out as T[]) : null;
}

/**
 * Fields every entry needs to be listed. Returns null for malformed entries,
 * and refuses any entry that claims an action permission or readiness credit.
 */
function entryBase(v: unknown): Omit<EntryBase, "status"> | null {
  if (!isObj(v)) return null;
  const id = str(v.id);
  const title = str(v.title);
  const sourceId = str(v.source_id);
  const origin = v.origin;
  if (!id || !title || !sourceId) return null;
  if (origin !== "authoritative_core" && origin !== "book_review") return null;
  if (
    v.execution_eligible !== false ||
    v.automatic_execution_allowed !== false ||
    v.readiness_credit !== "none"
  )
    return null;
  const topicIds = strings(v.topic_ids);
  const sourceTopics = strings(v.source_topics);
  const searchTerms = strings(v.search_terms);
  const cites = citations(v.source_citations);
  const evidence = all(v.evidence, evidenceRef);
  const corrections = strings(v.correction_ids);
  const milestones = all(v.milestone_mapping, milestone);
  const flags = strings(v.safety_flags);
  if (
    !topicIds ||
    !sourceTopics ||
    !searchTerms ||
    !cites ||
    !evidence ||
    !corrections ||
    !milestones ||
    !flags
  )
    return null;
  // Evidence and corrections must be namespaced by this entry's source.
  const ns = `${sourceId}:`;
  if (
    evidence.some((e) => !e.evidence_id.startsWith(ns)) ||
    corrections.some((c) => !c.startsWith(ns))
  )
    return null;
  return {
    id,
    origin,
    source_id: sourceId,
    source_item_id: str(v.source_item_id) ?? id,
    title,
    summary: typeof v.summary === "string" ? v.summary : "",
    classification: isClassification(v.classification)
      ? v.classification
      : null,
    reviewed_on: str(v.reviewed_on),
    topic_ids: topicIds,
    source_topics: sourceTopics,
    search_terms: searchTerms,
    source_citations: cites,
    evidence,
    correction_ids: corrections,
    milestone_mapping: milestones,
    safety_flags: flags,
  };
}

/** Status of a book entry: its classification and display status must agree. */
export function bookStatus(v: Obj): DisplayStatus {
  if (v.origin !== "book_review") return "unavailable";
  if (!isClassification(v.classification)) return "unavailable";
  const expected = BOOK_STATUS[v.classification];
  return v.display_status === expected ? expected : "unavailable";
}

function topic(v: unknown): LibraryTopic | null {
  if (!isObj(v) || !str(v.id) || !str(v.label)) return null;
  return {
    id: v.id as string,
    label: v.label as string,
    aliases: strings(v.aliases) ?? [],
  };
}

function topics(o: Obj, what: string): LibraryTopic[] {
  const t = all(requireList(o, "topics", what), topic);
  if (!t) throw new LibraryDataError(`${what} has a malformed topic.`);
  return t;
}

function source(v: unknown): LibrarySource | null {
  if (!isObj(v) || !str(v.id) || !str(v.title)) return null;
  const meta = isObj(v.metadata) ? v.metadata : {};
  const chapters: Chapter[] = (list(v.chapters) ?? []).flatMap((c) =>
    isObj(c) && str(c.id) && str(c.title)
      ? [
          {
            id: c.id as string,
            number: num(c.number),
            title: c.title as string,
          },
        ]
      : [],
  );
  // Archive paths and file names are internal; they are not carried forward.
  return {
    id: v.id as string,
    title: v.title as string,
    author: str(meta.author),
    copyright_year: num(meta.copyright_year),
    reviewed_on: str(v.reviewed_on),
    chapters,
  };
}

function evidenceRecord(v: unknown): EvidenceRecord | null {
  if (!isObj(v) || !str(v.id) || !str(v.source_id) || !isObj(v.record))
    return null;
  const r = v.record;
  return {
    id: v.id as string,
    source_id: v.source_id as string,
    publisher: str(r.publisher),
    title: str(r.title),
    url: safeHttpsUrl(r.url),
    recorded_url: str(r.url),
    accessed_on: str(r.accessed_on),
    access_status: str(r.access_status),
    locator: str(r.locator),
    finding: str(r.finding),
    support_scope: str(r.support_scope),
  };
}

function evidenceMap(o: Obj, what: string, sourceId: string) {
  const m = new Map<string, EvidenceRecord>();
  for (const raw of requireList(o, "evidence", what)) {
    const e = evidenceRecord(raw);
    // Records from another namespace are ignored, never resolved here.
    if (e && e.source_id === sourceId && e.id.startsWith(`${sourceId}:`))
      m.set(e.id, e);
  }
  return m;
}

function coreCard(v: unknown): CoreCard | null {
  if (!isObj(v)) return null;
  const whenToUse = str(v.when_to_use);
  const prerequisites = strings(v.prerequisites);
  const steps = strings(v.steps);
  const limits = strings(v.limits);
  const completion = isObj(v.completion) ? v.completion : null;
  const requires = completion ? strings(completion.requires) : null;
  if (!str(v.id) || !str(v.title) || !whenToUse) return null;
  if (!prerequisites || !steps || !limits || !requires) return null;
  if (v.automatic_execution_allowed !== false) return null;
  return {
    id: v.id as string,
    title: v.title as string,
    reviewed_on: str(v.reviewed_on),
    review_status: str(v.review_status),
    support_level: str(v.support_level),
    when_to_use: whenToUse,
    prerequisites,
    steps,
    limits,
    editorial_adaptation: str(v.editorial_adaptation),
    completion: { status: str(completion!.status), requires },
    maintenance: str(v.maintenance),
    escalation: str(v.escalation),
    site_confirmation_required: v.site_confirmation_required === true,
  };
}

function scenario(meta: unknown): ExampleScenario {
  const s =
    isObj(meta) && isObj(meta.example_scenario) ? meta.example_scenario : {};
  const notes = Object.entries(s).flatMap(([k, v]) =>
    k !== "people" && (typeof v === "string" || typeof v === "number")
      ? [{ label: k.replace(/_/g, " "), value: String(v) }]
      : [],
  );
  return { people: num(s.people), notes };
}

/** The default collection: authority-supported core cards only. */
export function parseGuidance(raw: unknown): GuidancePack {
  const what = "Guidance data";
  const o = requirePayload(raw, what);
  const src = source(o.source);
  if (!src || src.id !== "CORE")
    throw new LibraryDataError(`${what} has no core source.`);
  const evidence = evidenceMap(o, what, src.id);
  const entries: GuidanceEntry[] = [];
  let rejected = 0;
  for (const v of requireList(o, "entries", what)) {
    const base = entryBase(v);
    const card = isObj(v) ? coreCard(v.source_record) : null;
    const ok =
      base &&
      card &&
      isObj(v) &&
      base.origin === "authoritative_core" &&
      base.source_id === src.id &&
      v.classification === null &&
      v.display_status === "authority_supported" &&
      card.id === base.id;
    if (!ok) {
      rejected++;
      continue;
    }
    entries.push({
      ...base,
      origin: "authoritative_core",
      status: "authority_supported",
      card,
    });
  }
  return {
    topics: topics(o, what),
    source: src,
    scenario: scenario(isObj(o.source) ? o.source.metadata : null),
    evidence,
    entries,
    rejected,
  };
}

/** The book-review catalog. Statuses are kept, or marked unavailable. */
export function parseReviewsIndex(raw: unknown): ReviewsIndex {
  const what = "Book review index";
  const o = requirePayload(raw, what);
  const sources = all(requireList(o, "sources", what), source);
  if (!sources) throw new LibraryDataError(`${what} has a malformed source.`);
  const known = new Set(sources.map((s) => s.id));
  const entries: ReviewIndexEntry[] = [];
  let rejected = 0;
  for (const v of requireList(o, "entries", what)) {
    const base = entryBase(v);
    const path = isObj(v) ? str(v.detail_path) : null;
    if (
      !base ||
      !isObj(v) ||
      base.origin !== "book_review" ||
      !known.has(base.source_id) ||
      !path ||
      !DETAIL_PATH.test(path)
    ) {
      rejected++;
      continue;
    }
    entries.push({
      ...base,
      origin: "book_review",
      status: bookStatus(v),
      detail_path: path,
    });
  }
  return { topics: topics(o, what), sources, entries, rejected };
}

function component(v: unknown): SourceComponent | null {
  if (!isObj(v) || typeof v.text !== "string") return null;
  return {
    kind: str(v.kind) ?? "source",
    source_label: str(v.source_label),
    representation: str(v.representation),
    text: v.text,
    source_citations: citations(v.source_citations) ?? [],
  };
}

function bookRecord(v: unknown): BookSourceRecord | null {
  if (!isObj(v)) return null;
  const ver = isObj(v.verification) ? v.verification : {};
  const claim = isObj(v.original_claim) ? v.original_claim : null;
  const components =
    v.source_components === undefined
      ? []
      : all(v.source_components, component);
  // Nested source material must survive intact, or the record is malformed.
  if (!components) return null;
  return {
    chapter_id: str(v.chapter_id),
    item_type: str(v.item_type),
    original_claim:
      claim && typeof claim.text === "string"
        ? { text: claim.text, representation: str(claim.representation) }
        : null,
    reviewed_guidance: str(v.reviewed_guidance),
    verification: {
      status: str(ver.status),
      reviewed_on: str(ver.reviewed_on),
      verified_on: str(ver.verified_on),
      review_requirement: str(ver.review_requirement),
    },
    duplicate_group: str(v.duplicate_group),
    source_components: components,
  };
}

function correction(v: unknown, sourceId: string): CorrectionRecord | null {
  if (!isObj(v) || !str(v.id) || v.source_id !== sourceId || !isObj(v.record))
    return null;
  const r = v.record;
  if (!str(r.title) || !str(r.guidance)) return null;
  return {
    id: v.id as string,
    source_id: sourceId,
    title: r.title as string,
    guidance: r.guidance as string,
    basis: str(r.basis),
    evidence_ids: strings(v.evidence_ids) ?? [],
  };
}

/** One book's full records, evidence and corrections. */
export function parseBookDetail(raw: unknown, sourceId: string): BookDetail {
  const what = `Book ${sourceId} details`;
  const o = requirePayload(raw, what);
  const src = source(o.source);
  if (!src || src.id !== sourceId)
    throw new LibraryDataError(`${what} are for a different source.`);
  const evidence = evidenceMap(o, what, sourceId);
  const corrections = new Map<string, CorrectionRecord>();
  for (const c of requireList(o, "corrections", what)) {
    const r = correction(c, sourceId);
    if (r && r.id.startsWith(`${sourceId}:`)) corrections.set(r.id, r);
  }
  const entries = new Map<string, BookDetailEntry>();
  for (const v of requireList(o, "entries", what)) {
    const base = entryBase(v);
    const record = isObj(v) ? bookRecord(v.source_record) : null;
    // Malformed records are left out; opening one shows Unavailable.
    if (!base || !record || !isObj(v) || base.source_id !== sourceId) continue;
    entries.set(base.id, {
      ...base,
      origin: "book_review",
      status: bookStatus(v),
      record,
    });
  }
  return { source: src, evidence, corrections, entries };
}

/** Resolves an index entry's detail path against the versioned base. */
export function detailUrl(base: string, detailPath: string): string {
  if (!DETAIL_PATH.test(detailPath))
    throw new LibraryDataError("Unrecognized book detail path.");
  return `${base}${detailPath}`;
}
