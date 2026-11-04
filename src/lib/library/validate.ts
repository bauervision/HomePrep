/*
 * Validation of the Library guidance payload. The rules fail closed:
 * - A payload that isn't the expected shape or version throws, so an HTTP or
 *   format failure is never presented as an empty collection.
 * - An entry with an unknown origin, status or action permission never becomes
 *   guidance. Book-review records are never accepted: they belong to the
 *   private research archive.
 */

import {
  LIBRARY_VERSION,
  type CoreCard,
  type EntryBase,
  type EvidenceRecord,
  type EvidenceRef,
  type ExampleScenario,
  type GuidanceEntry,
  type GuidancePack,
  type LibrarySource,
  type LibraryTopic,
  type MilestoneMapping,
  type SourceCitation,
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
  if (origin !== "authoritative_core") return null;
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
  return {
    id: v.id as string,
    title: v.title as string,
    reviewed_on: str(v.reviewed_on),
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
    page_last_updated: str(r.page_last_updated),
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
    entries.push({ ...base, status: "authority_supported", card });
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
