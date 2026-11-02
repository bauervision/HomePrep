/*
 * Integrity of the imported Library pack (v1.1.0) against its manifest and
 * the canonical bundle kept as a development fixture in data/library/. The
 * previous v1.0.0 pack stays in place and must be preserved record-for-record.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBookDetail, parseGuidance, parseReviewsIndex } from "./validate";

const PUBLIC = "public/library-data/v1.1.0/";
const FIXTURES = "data/library/v1.1.0/";
const PREV_PUBLIC = "public/library-data/v1.0.0/";
const PREV_FIXTURES = "data/library/v1.0.0/";

type Raw = Record<string, unknown> & { id: string };
const read = (p: string) => readFileSync(p);
const json = (p: string) => JSON.parse(read(p).toString("utf8"));

const manifest = json(`${FIXTURES}manifest.json`);
const bundle = json(`${FIXTURES}library.bundle.json`);
const guidance = json(`${PUBLIC}guidance.json`);
const index = json(`${PUBLIC}reviews-index.json`);
const books: Record<
  string,
  { entries: Raw[]; evidence: Raw[]; corrections: Raw[] }
> = Object.fromEntries(
  index.sources.map((s: Raw) => [s.id, json(`${PUBLIC}books/${s.id}.json`)]),
);
const canonical = new Map<string, Raw>(
  bundle.entries.map((e: Raw) => [e.id, e]),
);

function expectManifestHashes(pub: string, fixtures: string, version: string) {
  const m = json(`${fixtures}manifest.json`);
  expect(m.bundle_version).toBe(version);
  expect(m.files).toHaveLength(version === "1.0.0" ? 11 : 14);
  for (const f of m.files as {
    path: string;
    bytes: number;
    sha256: string;
  }[]) {
    const p = f.path.startsWith("runtime/")
      ? `${pub}${f.path.slice("runtime/".length)}`
      : `${fixtures}${f.path}`;
    const bytes = read(p);
    expect(bytes.length, p).toBe(f.bytes);
    expect(createHash("sha256").update(bytes).digest("hex"), p).toBe(f.sha256);
  }
}

describe("Library pack v1.1.0", () => {
  it("matches the manifest's sizes and SHA-256 hashes", () => {
    expectManifestHashes(PUBLIC, FIXTURES, "1.1.0");
  });

  it("keeps the canonical totals and the 24 / 2,122 runtime split", () => {
    expect(bundle.entries).toHaveLength(2146);
    expect(bundle.totals).toEqual(manifest.totals);
    expect(guidance.content_version).toBe("1.1.0");
    expect(index.content_version).toBe("1.1.0");
    expect(guidance.entries).toHaveLength(24);
    expect(index.entries).toHaveLength(2122);
    const ids = [...guidance.entries, ...index.entries].map((e: Raw) => e.id);
    expect(new Set(ids).size).toBe(2146);
    expect(ids.every((id) => canonical.has(id))).toBe(true);
    const counts: Record<string, number> = {};
    for (const e of index.entries)
      counts[e.classification] = (counts[e.classification] ?? 0) + 1;
    expect(counts).toEqual({
      verified_guidance: 83,
      source_derived_reference: 988,
      needs_review: 1051,
    });
    expect(guidance.topics).toHaveLength(11);
    expect(bundle.evidence).toHaveLength(246);
    expect(bundle.corrections).toHaveLength(172);
  });

  it("resolves all ten book detail files from the index", () => {
    expect(Object.keys(books).sort()).toEqual([
      "B001",
      "B002",
      "B003",
      "B004",
      "B005",
      "B006",
      "B007",
      "B008",
      "B009",
      "B010",
    ]);
    for (const e of index.entries) {
      expect(e.detail_path).toBe(`books/${e.source_id}.json`);
      expect(existsSync(`${PUBLIC}${e.detail_path}`)).toBe(true);
      expect(books[e.source_id].entries.some((b) => b.id === e.id)).toBe(true);
    }
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
    expect(detailCount).toBe(2122);
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
    expect(evidence).toHaveLength(246);
    expect(corrections).toHaveLength(172);
    expect(new Set(evidence.map((e) => e.id)).size).toBe(246);
    expect(evidence).toEqual(expect.arrayContaining(bundle.evidence));
    expect(corrections).toEqual(expect.arrayContaining(bundle.corrections));
  });

  it("keeps the canonical bundle out of the public folder", () => {
    for (const dir of [PUBLIC, PREV_PUBLIC]) {
      expect(existsSync(`${dir}library.bundle.json`)).toBe(false);
      expect(existsSync(`${dir}library.schema.json`)).toBe(false);
      expect(existsSync(`${dir}manifest.json`)).toBe(false);
    }
  });

  it("keeps B010's armed-retaking passage as a high-level reference only", () => {
    const e = books.B010.entries.find((x) => x.id === "B010-076")!;
    expect(e.title).toBe("Armed retaking and harassment proposal");
    expect(e.classification).toBe("needs_review");
    const sr = e.source_record as Record<string, unknown>;
    expect(sr.source_components ?? []).toEqual([]);
    expect(e.execution_eligible).toBe(false);
  });

  it("keeps unnumbered printed pages separate from PDF pages", () => {
    const cite = (book: string, id: string) =>
      (
        books[book].entries.find((x) => x.id === id)!
          .source_citations as Record<string, unknown>[]
      )[0];
    // B009 front matter is unnumbered; so is B010's cover.
    expect(cite("B009", "B009-001")).toMatchObject({
      book_page_start: null,
      book_page_end: null,
      pdf_page_start: 1,
    });
    expect(cite("B009", "B009-002")).toMatchObject({
      book_page_start: null,
      book_page_end: null,
      pdf_page_start: 2,
      pdf_page_end: 4,
    });
    expect(cite("B010", "B010-001")).toMatchObject({
      book_page_start: null,
      book_page_end: 1,
      pdf_page_start: 1,
      pdf_page_end: 2,
    });
    // Printed page 20 is PDF page 21 in B010.
    expect(cite("B010", "B010-033")).toMatchObject({
      book_page_start: 20,
      book_page_end: 20,
      pdf_page_start: 21,
      pdf_page_end: 21,
    });
  });
});

describe("Preservation of the v1.0.0 pack", () => {
  const prevIndex = json(`${PREV_PUBLIC}reviews-index.json`);
  const prevGuidance = json(`${PREV_PUBLIC}guidance.json`);
  const prevBundle = json(`${PREV_FIXTURES}library.bundle.json`);

  it("leaves the previous versioned files byte-identical to their manifest", () => {
    expectManifestHashes(PREV_PUBLIC, PREV_FIXTURES, "1.0.0");
  });

  it("keeps every previous record identical, with new ones appended", () => {
    expect(guidance.entries).toEqual(prevGuidance.entries);
    // Same eleven topic groups; prefixes only gain the new books' tags.
    type Topic = { id: string; label: string; source_prefixes: string[] };
    const pick = (t: Topic) => [t.id, t.label];
    expect(guidance.topics.map(pick)).toEqual(prevGuidance.topics.map(pick));
    prevGuidance.topics.forEach((t: Topic, i: number) =>
      expect(guidance.topics[i].source_prefixes).toEqual(
        expect.arrayContaining(t.source_prefixes),
      ),
    );
    expect(guidance.evidence).toEqual(prevGuidance.evidence);
    // Same IDs, order and contents for the first 1,466 review entries.
    expect(index.entries.slice(0, 1466)).toEqual(prevIndex.entries);
    expect(
      index.entries
        .slice(1466)
        .every((e: Raw) =>
          ["B008", "B009", "B010"].includes(e.source_id as string),
        ),
    ).toBe(true);
    for (const e of prevBundle.entries as Raw[])
      expect(canonical.get(e.id), e.id).toEqual(e);
    expect(bundle.evidence).toEqual(
      expect.arrayContaining(prevBundle.evidence),
    );
    expect(bundle.corrections).toEqual(
      expect.arrayContaining(prevBundle.corrections),
    );
    for (const id of ["B001", "B002", "B003", "B004", "B005", "B006", "B007"]) {
      const prev = json(`${PREV_PUBLIC}books/${id}.json`);
      expect(books[id].entries, id).toEqual(prev.entries);
      expect(books[id].evidence, id).toEqual(prev.evidence);
      expect(books[id].corrections, id).toEqual(prev.corrections);
    }
  });

  it("allows no action, execution or readiness credit on any entry", () => {
    for (const e of bundle.entries) {
      expect(e.execution_eligible).toBe(false);
      expect(e.automatic_execution_allowed).toBe(false);
      expect(e.readiness_credit).toBe("none");
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
    expect(r.entries).toHaveLength(2122);
    expect(r.rejected).toBe(0);
    const counts: Record<string, number> = {};
    for (const e of r.entries) counts[e.status] = (counts[e.status] ?? 0) + 1;
    expect(counts).toEqual({
      verified_principle: 83,
      source_reference: 988,
      needs_review: 1051,
    });
  });

  it("parses every book file without losing records, citations or components", () => {
    let total = 0;
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
        // Every referenced correction and evidence record resolves.
        for (const c of p.correction_ids)
          expect(d.corrections.has(c), c).toBe(true);
        for (const ev of p.evidence)
          expect(d.evidence.has(ev.evidence_id), ev.evidence_id).toBe(true);
      }
    }
    let components = 0;
    for (const raw of Object.values(books))
      for (const e of raw.entries)
        components += (
          (e.source_record as { source_components?: unknown[] })
            .source_components ?? []
        ).length;
    expect(components).toBe(846);
    expect(total).toBe(2122);
  });
});
