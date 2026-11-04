/*
 * Library data models for the versioned, read-only guidance pack in
 * `public/library-data/`. Library content is independent of household data:
 * nothing here is a task, inventory item, requirement or readiness credit.
 * Book reviews are a private research archive and are never published.
 */

export const LIBRARY_VERSION = "1.4.0";

/** Display status after validation. Only authority-supported cards are shown. */
export type DisplayStatus = "authority_supported";

export interface LibraryTopic {
  id: string;
  label: string;
  aliases: string[];
}

/** A book or PDF page range. A null endpoint means unnumbered/unspecified. */
export interface SourceCitation {
  book_page_start: number | null;
  book_page_end: number | null;
  pdf_page_start: number | null;
  pdf_page_end: number | null;
  section: string | null;
}

/** An entry's link to an evidence record, scoped to what it supports. */
export interface EvidenceRef {
  evidence_id: string;
  url: string | null;
  relationship: string;
  scope: string | null;
}

export interface MilestoneMapping {
  milestone: string;
  relevance: string;
  rationale: string | null;
}

/** Fields shared by every Library entry. */
export interface EntryBase {
  id: string;
  origin: "authoritative_core";
  source_id: string;
  source_item_id: string;
  title: string;
  summary: string;
  /** Validated status; never derived from position, search or collection. */
  status: DisplayStatus;
  reviewed_on: string | null;
  topic_ids: string[];
  source_topics: string[];
  search_terms: string[];
  source_citations: SourceCitation[];
  evidence: EvidenceRef[];
  correction_ids: string[];
  milestone_mapping: MilestoneMapping[];
  safety_flags: string[];
}

/** An authority-supported core card, kept as the source recorded it. */
export interface CoreCard {
  id: string;
  title: string;
  reviewed_on: string | null;
  review_status: string | null;
  support_level: string | null;
  when_to_use: string;
  prerequisites: string[];
  steps: string[];
  limits: string[];
  editorial_adaptation: string | null;
  completion: { status: string | null; requires: string[] };
  maintenance: string | null;
  escalation: string | null;
  site_confirmation_required: boolean;
}

export interface GuidanceEntry extends EntryBase {
  card: CoreCard;
}

export interface EvidenceRecord {
  /** Namespaced, e.g. `CORE:A01`. */
  id: string;
  source_id: string;
  publisher: string | null;
  title: string | null;
  /** Only HTTPS URLs survive validation; others become null. */
  url: string | null;
  /** The URL as recorded, kept to explain why a link is unavailable. */
  recorded_url: string | null;
  accessed_on: string | null;
  /** "Last updated" date the page showed when it was checked. */
  page_last_updated: string | null;
  access_status: string | null;
  locator: string | null;
  finding: string | null;
  support_scope: string | null;
}

export interface LibrarySource {
  id: string;
  title: string;
  reviewed_on: string | null;
}

export interface ExampleScenario {
  people: number | null;
  notes: { label: string; value: string }[];
}

export interface GuidancePack {
  topics: LibraryTopic[];
  source: LibrarySource;
  scenario: ExampleScenario;
  evidence: Map<string, EvidenceRecord>;
  entries: GuidanceEntry[];
  /** Records that failed validation and were excluded (never shown as guidance). */
  rejected: number;
}
