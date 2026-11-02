/*
 * Integrity of the imported Library pack (v1.0.0) against its manifest and
 * the canonical bundle kept as a development fixture in data/library/.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBookDetail, parseGuidance, parseReviewsIndex } from "./validate";

const PUBLIC = "public/library-data/v1.0.0/";
const FIXTURES = "data/library/v1.0.0/";

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

describe("Library pack v1.0.0", () => {
  it("matches the manifest's sizes and SHA-256 hashes", () => {
    expect(manifest.bundle_version).toBe("1.0.0");
    for (const f of manifest.files as {
      path: string;
      bytes: number;
      sha256: string;
    }[]) {
      const p = f.path.startsWith("runtime/")
        ? `${PUBLIC}${f.path.slice("runtime/".length)}`
        : `${FIXTURES}${f.path}`;
      const bytes = read(p);
      expect(bytes.length, p).toBe(f.bytes);
      expect(createHash("sha256").update(bytes).digest("hex"), p).toBe(
        f.sha256,
      );
    }
  });

  it("keeps the canonical totals and the 24 / 1,466 runtime split", () => {
    expect(bundle.entries).toHaveLength(1490);
    expect(bundle.totals).toEqual(manifest.totals);
    expect(guidance.entries).toHaveLength(24);
    expect(index.entries).toHaveLength(1466);
    const ids = [...guidance.entries, ...index.entries].map((e: Raw) => e.id);
    expect(new Set(ids).size).toBe(1490);
    expect(ids.every((id) => canonical.has(id))).toBe(true);
    const counts: Record<string, number> = {};
    for (const e of index.entries)
      counts[e.classification] = (counts[e.classification] ?? 0) + 1;
    expect(counts).toEqual({
      verified_guidance: 63,
      source_derived_reference: 649,
      needs_review: 754,
    });
    expect(guidance.topics).toHaveLength(11);
    expect(bundle.evidence).toHaveLength(179);
    expect(bundle.corrections).toHaveLength(105);
  });

  it("resolves all seven book detail files from the index", () => {
    expect(Object.keys(books).sort()).toEqual([
      "B001",
      "B002",
      "B003",
      "B004",
      "B005",
      "B006",
      "B007",
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
    expect(detailCount).toBe(1466);
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
    expect(evidence).toHaveLength(179);
    expect(corrections).toHaveLength(105);
    expect(new Set(evidence.map((e) => e.id)).size).toBe(179);
    expect(evidence).toEqual(expect.arrayContaining(bundle.evidence));
    expect(corrections).toEqual(expect.arrayContaining(bundle.corrections));
  });

  it("keeps the canonical bundle out of the public folder", () => {
    expect(existsSync("public/library-data/v1.0.0/library.bundle.json")).toBe(
      false,
    );
    expect(existsSync("public/library-data/v1.0.0/library.schema.json")).toBe(
      false,
    );
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
    expect(r.entries).toHaveLength(1466);
    expect(r.rejected).toBe(0);
    const counts: Record<string, number> = {};
    for (const e of r.entries) counts[e.status] = (counts[e.status] ?? 0) + 1;
    expect(counts).toEqual({
      verified_principle: 63,
      source_reference: 649,
      needs_review: 754,
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
    expect(total).toBe(1466);
  });
});
