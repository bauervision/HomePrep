/*
 * Library data models for the versioned, read-only reference pack in
 * `public/library-data/`. Library content is independent of household data:
 * nothing here is a task, inventory item, requirement or readiness credit.
 */

export const LIBRARY_VERSION = "1.3.0";

/** Display status after validation. Anything unrecognized is "unavailable". */
export type DisplayStatus =
  | "authority_supported"
  | "verified_principle"
  | "source_reference"
  | "needs_review"
  | "unavailable";

/** Book-review classifications exactly as the examinations record them. */
export type BookClassification =
  "verified_guidance" | "source_derived_reference" | "needs_review";

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

/** Fields shared by every Library entry (guidance and book reviews). */
export interface EntryBase {
  id: string;
  origin: "authoritative_core" | "book_review";
  source_id: string;
  source_item_id: string;
  title: string;
  summary: string;
  classification: BookClassification | null;
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
  origin: "authoritative_core";
  status: "authority_supported";
  card: CoreCard;
}

/** Book-review catalog entry: reviewed fields only, no original claims. */
export interface ReviewIndexEntry extends EntryBase {
  origin: "book_review";
  detail_path: string;
}

export interface EvidenceRecord {
  /** Namespaced, e.g. `B001:E01` or `CORE:A01`. */
  id: string;
  source_id: string;
  publisher: string | null;
  title: string | null;
  /** Only HTTPS URLs survive validation; others become null. */
  url: string | null;
  /** The URL as recorded, kept to explain why a link is unavailable. */
  recorded_url: string | null;
  accessed_on: string | null;
  access_status: string | null;
  locator: string | null;
  finding: string | null;
  support_scope: string | null;
}

export interface CorrectionRecord {
  /** Namespaced, e.g. `B001:C01`. */
  id: string;
  source_id: string;
  title: string;
  guidance: string;
  basis: string | null;
  evidence_ids: string[];
}

export interface SourceComponent {
  kind: string;
  source_label: string | null;
  representation: string | null;
  text: string;
  source_citations: SourceCitation[];
}

/** The unreviewed parts of a book record, shown only in a collapsed section. */
export interface BookSourceRecord {
  chapter_id: string | null;
  item_type: string | null;
  original_claim: { text: string; representation: string | null } | null;
  reviewed_guidance: string | null;
  verification: {
    status: string | null;
    reviewed_on: string | null;
    verified_on: string | null;
    review_requirement: string | null;
  };
  duplicate_group: string | null;
  source_components: SourceComponent[];
}

export interface BookDetailEntry extends EntryBase {
  origin: "book_review";
  record: BookSourceRecord;
}

export interface Chapter {
  id: string;
  number: number | null;
  title: string;
}

export interface LibrarySource {
  id: string;
  title: string;
  author: string | null;
  copyright_year: number | null;
  reviewed_on: string | null;
  chapters: Chapter[];
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

export interface ReviewsIndex {
  topics: LibraryTopic[];
  sources: LibrarySource[];
  entries: ReviewIndexEntry[];
  rejected: number;
}

export interface BookDetail {
  source: LibrarySource;
  evidence: Map<string, EvidenceRecord>;
  corrections: Map<string, CorrectionRecord>;
  entries: Map<string, BookDetailEntry>;
}
