/*
 * Integrity of the imported Library pack (v1.3.0) against its manifest and
 * the canonical bundle kept as a development fixture in data/library/. The
 * previous v1.0.0, v1.1.0 and v1.2.0 packs stay in place and must be preserved
 * record-for-record.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBookDetail, parseGuidance, parseReviewsIndex } from "./validate";

const VERSION = "1.3.0";
const PUBLIC = `public/library-data/v${VERSION}/`;
const FIXTURES = `data/library/v${VERSION}/`;
/** Earlier packs, oldest first, with their manifest file counts. */
const PREVIOUS = [
  { version: "1.0.0", files: 11 },
  { version: "1.1.0", files: 14 },
  { version: "1.2.0", files: 19 },
];

type Raw = Record<string, unknown> & { id: string };
type Book = { entries: Raw[]; evidence: Raw[]; corrections: Raw[] };
const read = (p: string) => readFileSync(p);
const json = (p: string) => JSON.parse(read(p).toString("utf8"));
const pub = (v: string) => `public/library-data/v${v}/`;
const fixtures = (v: string) => `data/library/v${v}/`;

const manifest = json(`${FIXTURES}manifest.json`);
const bundle = json(`${FIXTURES}library.bundle.json`);
const guidance = json(`${PUBLIC}guidance.json`);
const index = json(`${PUBLIC}reviews-index.json`);
const books: Record<string, Book> = Object.fromEntries(
  index.sources.map((s: Raw) => [s.id, json(`${PUBLIC}books/${s.id}.json`)]),
);
const canonical = new Map<string, Raw>(
  bundle.entries.map((e: Raw) => [e.id, e]),
);
const entry = (id: string) =>
  books[id.slice(0, 4)].entries.find((x) => x.id === id)!;
const cite = (id: string) =>
  (entry(id).source_citations as Record<string, unknown>[])[0];

function expectManifestHashes(version: string, files: number) {
  const m = json(`${fixtures(version)}manifest.json`);
  expect(m.bundle_version).toBe(version);
  expect(m.files).toHaveLength(files);
  for (const f of m.files as {
    path: string;
    bytes: number;
    sha256: string;
  }[]) {
    const p = f.path.startsWith("runtime/")
      ? `${pub(version)}${f.path.slice("runtime/".length)}`
      : `${fixtures(version)}${f.path}`;
    const bytes = read(p);
    expect(bytes.length, p).toBe(f.bytes);
    expect(createHash("sha256").update(bytes).digest("hex"), p).toBe(f.sha256);
  }
}

describe(`Library pack v${VERSION}`, () => {
  it("matches the manifest's sizes and SHA-256 hashes", () => {
    expectManifestHashes(VERSION, 23);
  });

  it("keeps the canonical totals and the 24 / 3,714 runtime split", () => {
    expect(bundle.entries).toHaveLength(3738);
    expect(bundle.totals).toEqual(manifest.totals);
    expect(guidance.content_version).toBe(VERSION);
    expect(index.content_version).toBe(VERSION);
    expect(guidance.entries).toHaveLength(24);
    expect(index.entries).toHaveLength(3714);
    const ids = [...guidance.entries, ...index.entries].map((e: Raw) => e.id);
    expect(new Set(ids).size).toBe(3738);
    expect(ids.every((id) => canonical.has(id))).toBe(true);
    const counts: Record<string, number> = {};
    for (const e of index.entries)
      counts[e.classification] = (counts[e.classification] ?? 0) + 1;
    expect(counts).toEqual({
      verified_guidance: 160,
      source_derived_reference: 1496,
      needs_review: 2058,
    });
    expect(guidance.topics).toHaveLength(11);
    expect(bundle.evidence).toHaveLength(440);
    expect(bundle.corrections).toHaveLength(419);
  });

  it("resolves all nineteen book detail files from the index", () => {
    expect(Object.keys(books).sort()).toEqual(
      Array.from(
        { length: 19 },
        (_, i) => `B${String(i + 1).padStart(3, "0")}`,
      ),
    );
    const perBook: Record<string, number> = {};
    for (const e of index.entries) {
      expect(e.detail_path).toBe(`books/${e.source_id}.json`);
      expect(existsSync(`${PUBLIC}${e.detail_path}`)).toBe(true);
      expect(books[e.source_id].entries.some((b) => b.id === e.id)).toBe(true);
      perBook[e.source_id] = (perBook[e.source_id] ?? 0) + 1;
    }
    expect(perBook).toMatchObject({
      B011: 159,
      B012: 265,
      B013: 159,
      B014: 215,
      B015: 340,
      B016: 163,
      B017: 209,
      B018: 39,
      B019: 43,
    });
  });

  it("projects records losslessly from the canonical bundle", () => {
    // Core cards and full book records are identical to the bundle.
    for (const e of guidance.entries) expect(e).toEqual(canonical.get(e.id));
    let detailCount = 0;
    for (const b of Object.values(books))
      for (const e of b.entries) {
        detailCount++;
        expect(e).toEqual(canonical.get(e.id));
      }
    expect(detailCount).toBe(3714);
    // The index is the same record without original claims and components.
    for (const e of index.entries) {
      const { detail_path, ...rest } = e;
      const { source_record, ...expected } = canonical.get(e.id)!;
      expect(detail_path).toBeTruthy();
      expect(source_record).toBeTruthy();
      expect(rest).toEqual(expected);
      expect(JSON.stringify(e)).not.toContain("original_claim");
      expect(JSON.stringify(e)).not.toContain("source_components");
    }
    // Every evidence record and correction is present, namespaced.
    const evidence = [
      ...guidance.evidence,
      ...Object.values(books).flatMap((b) => b.evidence),
    ];
    const corrections = Object.values(books).flatMap((b) => b.corrections);
    expect(evidence).toHaveLength(440);
    expect(corrections).toHaveLength(419);
    expect(new Set(evidence.map((e) => e.id)).size).toBe(440);
    expect(evidence).toEqual(expect.arrayContaining(bundle.evidence));
    expect(corrections).toEqual(expect.arrayContaining(bundle.corrections));
  });

  it("keeps the canonical bundle out of the public folder", () => {
    for (const v of [...PREVIOUS.map((p) => p.version), VERSION]) {
      expect(existsSync(`${pub(v)}library.bundle.json`)).toBe(false);
      expect(existsSync(`${pub(v)}library.schema.json`)).toBe(false);
      expect(existsSync(`${pub(v)}manifest.json`)).toBe(false);
    }
  });

  it("allows no action, execution or readiness credit on any entry", () => {
    for (const e of bundle.entries) {
      expect(e.execution_eligible).toBe(false);
      expect(e.automatic_execution_allowed).toBe(false);
      expect(e.readiness_credit).toBe("none");
    }
  });

  it("keeps B010's armed-retaking passage as a high-level reference only", () => {
    const e = entry("B010-076");
    expect(e.title).toBe("Armed retaking and harassment proposal");
    expect(e.classification).toBe("needs_review");
    const sr = e.source_record as Record<string, unknown>;
    expect(sr.source_components ?? []).toEqual([]);
  });

  it("keeps unnumbered printed pages separate from PDF pages", () => {
    // B009 front matter is unnumbered; so is B010's cover.
    expect(cite("B009-002")).toMatchObject({
      book_page_start: null,
      book_page_end: null,
      pdf_page_start: 2,
      pdf_page_end: 4,
    });
    expect(cite("B010-033")).toMatchObject({
      book_page_start: 20,
      pdf_page_start: 21,
    });
    // B014: unnumbered cover, then printed = PDF - 1 through the Final Word.
    expect(cite("B014-001")).toMatchObject({
      book_page_start: null,
      book_page_end: 1,
      pdf_page_start: 1,
      pdf_page_end: 2,
    });
    expect(cite("B014-215")).toMatchObject({
      book_page_start: 51,
      book_page_end: 51,
      pdf_page_start: 52,
      pdf_page_end: 52,
    });
    // B015: unnumbered cover, then printed page = PDF page (no minus-one).
    expect(cite("B015-001")).toMatchObject({
      book_page_start: null,
      book_page_end: 2,
      pdf_page_start: 1,
      pdf_page_end: 2,
    });
    for (const e of books.B015.entries.slice(1))
      for (const c of e.source_citations as Record<string, number>[]) {
        expect(c.book_page_start, e.id).toBe(c.pdf_page_start);
        expect(c.book_page_end, e.id).toBe(c.pdf_page_end);
      }
  });

  it("keeps editorial chapter containers labelled as the source has them", () => {
    const chapter = (book: string, id: string) =>
      index.sources
        .find((s: Raw) => s.id === book)
        .chapters.find((c: Raw) => c.id === id);
    // Both final B015 headings say Chapter 20; CH21 is editorial only.
    expect(chapter("B015", "CH20").title).toMatch(/source Chapter20\(first\)/);
    expect(chapter("B015", "CH21").title).toMatch(/source Chapter20\(second\)/);
    expect(chapter("B014", "CH11").title).toMatch(/Final Word — unnumbered/);
  });

  it("keeps B015's conflicting tourniquet records and unsafe ORS record apart", () => {
    const p58 = entry("B015-192");
    const p92 = entry("B015-289");
    expect(p58.title).toBe("Loosen tourniquet every ten minutes");
    expect(p58.classification).toBe("needs_review");
    expect(p58.safety_flags).toContain("unsafe_tourniquet_release");
    expect(cite("B015-192")).toMatchObject({ book_page_start: 58 });
    expect(p92.title).toBe("Later tourniquet instruction:do not remove");
    expect(p92.classification).toBe("verified_guidance");
    expect(cite("B015-289")).toMatchObject({ book_page_start: 92 });
    const ors = entry("B015-276");
    expect(ors.classification).toBe("needs_review");
    expect(ors.safety_flags).toContain("unsafe_rehydration_recipe");
  });

  it("keeps B013's printed frequency error with its correction", () => {
    const e = entry("B013-140");
    expect(e.title).toBe("Frequency table: FRS 3");
    expect(e.correction_ids).toEqual(["B013:C05"]);
    const c = books.B013.corrections.find((x) => x.id === "B013:C05")!;
    expect(JSON.stringify(c)).toMatch(/462\.6215MHz as the book’s error/);
    expect(JSON.stringify(c)).toMatch(/462\.6125MHz/);
  });

  it("keeps B018 and B019 covers unnumbered with their opposite page offsets", () => {
    for (const id of ["B018-001", "B019-001"])
      expect(cite(id)).toMatchObject({
        book_page_start: null,
        book_page_end: null,
        pdf_page_start: 1,
        pdf_page_end: 1,
      });
    // B018: PDF 2 is printed page 1. B019: PDF 2 is printed page 3.
    const offset = { B018: 1, B019: -1 } as const;
    for (const [book, diff] of Object.entries(offset))
      for (const e of books[book].entries)
        for (const c of e.source_citations as Record<string, number | null>[]) {
          if (c.book_page_start === null) continue;
          expect(c.pdf_page_start! - c.book_page_start, e.id).toBe(diff);
          expect(c.pdf_page_end! - c.book_page_end!, e.id).toBe(diff);
        }
  });

  it("keeps B018 tactical and B019 canning and wild-plant claims under review", () => {
    for (const id of ["B018-014", "B018-036", "B018-037", "B018-038"]) {
      const e = entry(id);
      expect(e.classification, id).toBe("needs_review");
      expect(e.safety_flags, id).toContain("unsafe_force_risk");
      expect(e.correction_ids, id).not.toHaveLength(0);
    }
    for (const id of ["B019-008", "B019-019", "B019-023", "B019-042"]) {
      const e = entry(id);
      expect(e.classification, id).toBe("needs_review");
      expect(e.safety_flags, id).toContain("food_safety");
      expect(e.correction_ids, id).not.toHaveLength(0);
    }
  });
});

describe.each(PREVIOUS)("Preservation of the v$version pack", (prev) => {
  const p = pub(prev.version);
  const prevIndex = json(`${p}reviews-index.json`);
  const prevGuidance = json(`${p}guidance.json`);
  const prevBundle = json(`${fixtures(prev.version)}library.bundle.json`);

  it("leaves the previous versioned files byte-identical to their manifest", () => {
    expectManifestHashes(prev.version, prev.files);
  });

  it("keeps every previous record identical and in order, with new ones appended", () => {
    expect(guidance.entries).toEqual(prevGuidance.entries);
    expect(guidance.evidence).toEqual(prevGuidance.evidence);
    // Same eleven topic groups; prefixes only ever gain new books' tags.
    type Topic = { id: string; label: string; source_prefixes: string[] };
    const pick = (t: Topic) => [t.id, t.label];
    expect(guidance.topics.map(pick)).toEqual(prevGuidance.topics.map(pick));
    prevGuidance.topics.forEach((t: Topic, i: number) =>
      expect(guidance.topics[i].source_prefixes).toEqual(
        expect.arrayContaining(t.source_prefixes),
      ),
    );
    const n = prevIndex.entries.length;
    expect(index.entries.slice(0, n)).toEqual(prevIndex.entries);
    const prevBooks = new Set(prevIndex.sources.map((s: Raw) => s.id));
    expect(
      index.entries.slice(n).every((e: Raw) => !prevBooks.has(e.source_id)),
    ).toBe(true);
    for (const e of prevBundle.entries as Raw[])
      expect(canonical.get(e.id), e.id).toEqual(e);
    expect(bundle.evidence).toEqual(
      expect.arrayContaining(prevBundle.evidence),
    );
    expect(bundle.corrections).toEqual(
      expect.arrayContaining(prevBundle.corrections),
    );
    for (const id of prevBooks as Set<string>) {
      const old = json(`${p}books/${id}.json`);
      expect(books[id].entries, id).toEqual(old.entries);
      expect(books[id].evidence, id).toEqual(old.evidence);
      expect(books[id].corrections, id).toEqual(old.corrections);
    }
  });
});

describe("Library parsing of the real pack", () => {
  const g = parseGuidance(guidance);
  const r = parseReviewsIndex(index);

  it("accepts all 24 core cards as guidance and nothing else", () => {
    expect(g.entries).toHaveLength(24);
    expect(g.rejected).toBe(0);
    expect(g.entries.every((e) => e.origin === "authoritative_core")).toBe(
      true,
    );
    expect(g.entries.every((e) => e.status === "authority_supported")).toBe(
      true,
    );
    expect(g.evidence.size).toBe(guidance.evidence.length);
  });

  it("keeps every book classification as recorded", () => {
    expect(r.entries).toHaveLength(3714);
    expect(r.rejected).toBe(0);
    expect(r.sources).toHaveLength(19);
    const counts: Record<string, number> = {};
    for (const e of r.entries) counts[e.status] = (counts[e.status] ?? 0) + 1;
    expect(counts).toEqual({
      verified_principle: 160,
      source_reference: 1496,
      needs_review: 2058,
    });
  });

  it("parses every book file without losing records, citations or components", () => {
    let total = 0;
    let components = 0;
    for (const [id, raw] of Object.entries(books)) {
      const d = parseBookDetail(raw, id);
      expect(d.entries.size).toBe(raw.entries.length);
      expect(d.evidence.size).toBe(raw.evidence.length);
      expect(d.corrections.size).toBe(raw.corrections.length);
      total += d.entries.size;
      for (const e of raw.entries) {
        const p = d.entries.get(e.id)!;
        const sr = e.source_record as Record<string, unknown> & {
          source_components?: { text: string }[];
          original_claim: { text: string };
        };
        expect(p.source_citations).toEqual(e.source_citations);
        expect(p.safety_flags).toEqual(e.safety_flags);
        expect(p.correction_ids).toEqual(e.correction_ids);
        expect(p.evidence).toEqual(e.evidence);
        expect(p.record.original_claim?.text).toBe(sr.original_claim.text);
        expect(p.record.source_components.map((c) => c.text)).toEqual(
          (sr.source_components ?? []).map((c) => c.text),
        );
        components += p.record.source_components.length;
        // Every referenced correction and evidence record resolves.
        for (const c of p.correction_ids)
          expect(d.corrections.has(c), c).toBe(true);
        for (const ev of p.evidence)
          expect(d.evidence.has(ev.evidence_id), ev.evidence_id).toBe(true);
      }
    }
    expect(components).toBe(1533);
    expect(total).toBe(3714);
  });
});
