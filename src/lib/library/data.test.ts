/*
 * Integrity of the published Library payload (content 1.4.0) and of the
 * private research archive.
 *
 * - Guidance is the only published Library file. Every content version keeps
 *   its guidance.json public; book-review indexes and detail files from every
 *   version live privately under data/library/v*\/runtime/ and are not served.
 * - 1.4.0 = the 24 unchanged core cards plus the reviewed Shelter cards, built
 *   by scripts/build-library-content.mjs and checked against its manifest.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LIBRARY_VERSION } from "./types";
import { parseGuidance } from "./validate";

type Raw = Record<string, unknown> & { id: string };
type ManifestFile = { path: string; bytes: number; sha256: string };
const read = (p: string) => readFileSync(p);
const json = (p: string) => JSON.parse(read(p).toString("utf8"));
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const pub = (v: string) => `public/library-data/v${v}/`;
const priv = (v: string) => `data/library/v${v}/`;

/** Archived research packs, with manifest sizes and review counts. */
const ARCHIVE = [
  { version: "1.0.0", files: 11, reviews: 1466, books: 7 },
  { version: "1.1.0", files: 14, reviews: 2122, books: 10 },
  { version: "1.2.0", files: 19, reviews: 3260, books: 15 },
  { version: "1.3.0", files: 23, reviews: 3714, books: 19 },
];

/** Where a manifest path lives now: guidance public, the rest private. */
const located = (v: string, path: string) =>
  path === "runtime/guidance.json" ? `${pub(v)}guidance.json` : priv(v) + path;

function expectManifest(v: string, count: number) {
  const m = json(`${priv(v)}manifest.json`);
  expect(m.bundle_version).toBe(v);
  expect(m.files).toHaveLength(count);
  for (const f of m.files as ManifestFile[]) {
    const p = located(v, f.path);
    const bytes = read(p);
    expect(bytes.length, p).toBe(f.bytes);
    expect(sha(bytes), p).toBe(f.sha256);
  }
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p.replace(/\\/g, "/")];
  });
}

const guidance = json(`${pub(LIBRARY_VERSION)}guidance.json`);
const previous = json(`${pub("1.3.0")}guidance.json`);
const shelter = json(`${priv(LIBRARY_VERSION)}shelter-cards.json`);

describe(`Library content ${LIBRARY_VERSION}`, () => {
  it("matches its manifest and is rebuilt exactly by the build script", () => {
    expect(LIBRARY_VERSION).toBe("1.4.0");
    expectManifest(LIBRARY_VERSION, 1);
    const out = execFileSync(
      process.execPath,
      ["scripts/build-library-content.mjs", "--check"],
      { encoding: "utf8" },
    );
    expect(out).toMatch(/up to date/);
  });

  it("keeps the 24 core cards and evidence identical, then adds Shelter", () => {
    expect(guidance.content_version).toBe("1.4.0");
    expect(guidance.entries.slice(0, 24)).toEqual(previous.entries);
    expect(guidance.evidence.slice(0, previous.evidence.length)).toEqual(
      previous.evidence,
    );
    const added = guidance.entries.slice(24);
    expect(added.map((e: Raw) => e.id)).toEqual(["HP-H01", "HP-H02", "HP-H03"]);
    expect(
      added.every((e: Raw) => (e.topic_ids as string[]).join() === "shelter"),
    ).toBe(true);
    // Topic groups: the earlier eleven, plus Shelter after Communications.
    const ids = guidance.topics.map((t: Raw) => t.id);
    expect(ids).toEqual([
      ...previous.topics.slice(0, 5).map((t: Raw) => t.id),
      "shelter",
      ...previous.topics.slice(5).map((t: Raw) => t.id),
    ]);
    expect(guidance.topics.filter((t: Raw) => t.id !== "shelter")).toEqual(
      previous.topics,
    );
  });

  it("keeps each Shelter card's reviewed sources, dates and limits", () => {
    const evidence = new Map<string, Raw>(
      guidance.evidence.map((e: Raw) => [e.id, e]),
    );
    for (const card of shelter.cards as Raw[]) {
      const e = guidance.entries.find((x: Raw) => x.id === card.id);
      expect(e.reviewed_on).toBe("2026-11-04");
      expect(e.source_record.steps).toEqual(card.steps);
      expect(e.source_record.limits).toEqual(card.limits);
      expect(e.source_record.limits.length).toBeGreaterThan(0);
      expect(e.evidence.length).toBeGreaterThan(0);
      for (const ref of e.evidence) {
        const rec = evidence.get(ref.evidence_id) as unknown as {
          record: Record<string, string>;
        };
        expect(rec, ref.evidence_id).toBeTruthy();
        expect(rec.record.url).toMatch(/^https:\/\/www\.ready\.gov\//);
        expect(rec.record.url).toBe(ref.url);
        expect(rec.record.accessed_on).toBe("2026-11-04");
        expect(rec.record.page_last_updated).toMatch(/^2026-\d\d-\d\d$/);
      }
    }
    // Hazard-specific: tornado and flood advice are kept apart.
    const h01 = guidance.entries.find((x: Raw) => x.id === "HP-H01");
    expect(h01.source_record.steps[0]).toMatch(/^Tornado/);
    expect(h01.source_record.steps[1]).toMatch(/^Flood/);
  });

  it("allows no action, execution or readiness credit on any card", () => {
    for (const e of guidance.entries) {
      expect(e.execution_eligible).toBe(false);
      expect(e.automatic_execution_allowed).toBe(false);
      expect(e.readiness_credit).toBe("none");
      expect(e.source_record.automatic_execution_allowed).toBe(false);
    }
    expect(guidance.policy.book_reviews).toBe(
      "private_research_archive_not_published",
    );
  });

  it("parses as 27 authority-supported cards with nothing rejected", () => {
    const g = parseGuidance(guidance);
    expect(g.entries).toHaveLength(27);
    expect(g.rejected).toBe(0);
  });
});

describe("Private research archive", () => {
  it.each(ARCHIVE)(
    "keeps the v$version pack byte-identical to its manifest",
    ({ version, files }) => expectManifest(version, files),
  );

  it.each(ARCHIVE)(
    "keeps all v$version book examinations privately",
    ({ version, reviews, books }) => {
      const index = json(`${priv(version)}runtime/reviews-index.json`);
      expect(index.entries).toHaveLength(reviews);
      expect(index.sources).toHaveLength(books);
      for (const s of index.sources as Raw[])
        expect(existsSync(`${priv(version)}runtime/books/${s.id}.json`)).toBe(
          true,
        );
    },
  );

  it("still holds all 19 book examinations", () => {
    const books = readdirSync(`${priv("1.3.0")}runtime/books`);
    expect(books).toHaveLength(19);
  });
});

describe("Public Library files", () => {
  const files = walk("public/library-data");

  it("publish only guidance, in every content version", () => {
    expect(files.sort()).toEqual(
      ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0"].map(
        (v) => `${pub(v)}guidance.json`,
      ),
    );
  });

  it("contain no review index, book detail, bundle, schema or PDF", () => {
    const all = walk("public");
    for (const f of all) {
      expect(f).not.toMatch(/reviews-index|\/books\/|bundle|schema/);
      expect(f.toLowerCase()).not.toMatch(/\.pdf$/);
    }
  });
});
