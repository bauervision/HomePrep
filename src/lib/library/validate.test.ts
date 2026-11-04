import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readParams } from "./browse";
import { citationParts, formatDate, pageRange, STATUS_LABEL } from "./format";
import {
  detailUrl,
  LibraryDataError,
  parseBookDetail,
  parseGuidance,
  parseReviewsIndex,
  safeHttpsUrl,
} from "./validate";

const PUBLIC = "public/library-data/v1.3.0/";
const load = (p: string) => JSON.parse(readFileSync(PUBLIC + p, "utf8"));
type Raw = Record<string, unknown>;
const clone = <T>(v: T): T => structuredClone(v);

const guidance = load("guidance.json");
const index = load("reviews-index.json");
const b001 = load("books/B001.json");
const bookEntry = index.entries.find((e: Raw) => e.id === "B001-027");

describe("guidance fails closed", () => {
  it("rejects a book record placed in the guidance payload", () => {
    const raw = clone(guidance);
    const book = clone(b001.entries[0]);
    raw.entries.push(book);
    const g = parseGuidance(raw);
    expect(g.entries).toHaveLength(24);
    expect(g.rejected).toBe(1);
    expect(g.entries.some((e) => e.id === book.id)).toBe(false);
  });

  it("rejects a core card with a classification, unknown status or origin", () => {
    for (const change of [
      { classification: "verified_guidance" },
      { display_status: "verified_principle" },
      { display_status: "mystery" },
      { origin: "unknown" },
      { execution_eligible: true },
      { automatic_execution_allowed: true },
      { readiness_credit: "full" },
    ]) {
      const raw = clone(guidance);
      Object.assign(raw.entries[0], change);
      const g = parseGuidance(raw);
      expect(
        g.entries.map((e) => e.id),
        JSON.stringify(change),
      ).not.toContain(raw.entries[0].id);
      expect(g.rejected).toBe(1);
    }
  });

  it("rejects malformed core cards instead of showing partial guidance", () => {
    const raw = clone(guidance);
    delete raw.entries[0].source_record.steps;
    raw.entries[1].source_record.completion = null;
    raw.entries[2].title = "";
    raw.entries[3].evidence = [{ evidence_id: "B001:E01", relationship: "x" }];
    const g = parseGuidance(raw);
    expect(g.entries).toHaveLength(20);
    expect(g.rejected).toBe(4);
  });

  it("throws on a payload that isn't the expected shape or version", () => {
    expect(() => parseGuidance(null)).toThrow(LibraryDataError);
    expect(() => parseGuidance([])).toThrow(LibraryDataError);
    expect(() =>
      parseGuidance({ ...guidance, content_version: "2.0.0" }),
    ).toThrow(/content version/);
    expect(() => parseGuidance({ ...guidance, entries: undefined })).toThrow(
      /entries/,
    );
    expect(() => parseReviewsIndex({ ...index, sources: "x" })).toThrow(
      LibraryDataError,
    );
  });
});

describe("book reviews fail closed", () => {
  it("marks an unknown or mismatched classification unavailable, never verified", () => {
    const raw = clone(index);
    const i = raw.entries.findIndex((e: Raw) => e.id === "B001-027");
    raw.entries[i].classification = "approved";
    raw.entries[i + 1].display_status = "verified_principle";
    raw.entries[i + 1].classification = "needs_review";
    const r = parseReviewsIndex(raw);
    expect(r.entries[i].status).toBe("unavailable");
    expect(r.entries[i + 1].status).toBe("unavailable");
    expect(STATUS_LABEL.unavailable).toMatch(/not approved instructions/);
  });

  it("drops entries with bad sources, paths or namespaces", () => {
    const raw = clone(index);
    raw.entries[0].source_id = "B999";
    raw.entries[1].detail_path = "../secrets.json";
    raw.entries[2].evidence = [
      { evidence_id: "E01", relationship: "supports", url: null },
    ];
    raw.entries[3].correction_ids = ["C01"];
    raw.entries[4].execution_eligible = true;
    const r = parseReviewsIndex(raw);
    expect(r.entries).toHaveLength(3714 - 5);
    expect(r.rejected).toBe(5);
  });

  it("only requests detail files under books/", () => {
    expect(detailUrl("/library-data/v1.3.0/", "books/B001.json")).toBe(
      "/library-data/v1.3.0/books/B001.json",
    );
    for (const bad of [
      "../x.json",
      "books/../x.json",
      "https://x/y.json",
      "books/B001.js",
    ])
      expect(() => detailUrl("/b/", bad)).toThrow(LibraryDataError);
  });

  it("refuses a detail file for a different book", () => {
    expect(() => parseBookDetail(b001, "B002")).toThrow(/different source/);
  });

  it("resolves evidence only within its own namespace", () => {
    const d = parseBookDetail(b001, "B001");
    expect(d.evidence.has("B001:E01")).toBe(true);
    expect(d.evidence.has("B005:E01")).toBe(false);
    const raw = clone(b001);
    raw.evidence.push({
      ...raw.evidence[0],
      id: "B005:E01",
      source_id: "B005",
    });
    expect(parseBookDetail(raw, "B001").evidence.has("B005:E01")).toBe(false);
    expect(bookEntry.correction_ids).toEqual(["B001:C01"]);
    expect(d.corrections.get("B001:C01")?.title).toBe("Bleach treatment");
  });

  it("leaves out a record whose nested source material is malformed", () => {
    const raw = clone(load("books/B007.json"));
    const e = raw.entries.find((x: Raw) => x.id === "B007-009");
    e.source_record.source_components[0].text = 42;
    expect(parseBookDetail(raw, "B007").entries.has("B007-009")).toBe(false);
  });

  it("accepts only HTTPS evidence links", () => {
    expect(safeHttpsUrl("https://www.epa.gov/x")).toBe("https://www.epa.gov/x");
    expect(safeHttpsUrl("http://www.epa.gov/x")).toBeNull();
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpsUrl("../../source-archive/a.pdf")).toBeNull();
    expect(safeHttpsUrl(null)).toBeNull();
  });
});

describe("citations", () => {
  it("keeps printed and PDF pages separate, with null as unnumbered", () => {
    expect(pageRange(18, 18)).toBe("18");
    expect(pageRange(6, 8)).toBe("6–8");
    expect(pageRange(null, null)).toBe("unnumbered");
    expect(pageRange(null, 1)).toBe("unnumbered–1");
    expect(pageRange(3, null)).toBe("3–unnumbered");
    expect(pageRange(0, 0)).toBe("0");
  });

  it("formats the real B006 (unnumbered) and B007 (mixed) citations", () => {
    const b6 = parseBookDetail(load("books/B006.json"), "B006");
    expect(
      citationParts(b6.entries.get("B006-001")!.source_citations[0]),
    ).toEqual({
      book: "Book p. unnumbered",
      pdf: "PDF p. 1",
      section: "Overview",
    });
    const b7 = parseBookDetail(load("books/B007.json"), "B007");
    expect(
      citationParts(b7.entries.get("B007-001")!.source_citations[0]),
    ).toEqual({
      book: "Book p. unnumbered–1",
      pdf: "PDF p. 1–2",
      section: "Front matter",
    });
  });

  it("treats a malformed page number as malformed, not as unnumbered", () => {
    const raw = clone(index);
    raw.entries[0].source_citations[0].book_page_start = "6";
    expect(parseReviewsIndex(raw).rejected).toBe(1);
  });

  it("formats review dates as calendar dates", () => {
    expect(formatDate("2026-10-30")).toBe("Oct 30, 2026");
    expect(formatDate(null)).toBeNull();
  });
});

describe("Library URL parameters", () => {
  it("reads valid state", () => {
    expect(
      readParams(
        new URLSearchParams(
          "view=reviews&q=boil&topic=water&book=B001&status=needs-review&entry=B001-027",
        ),
      ),
    ).toEqual({
      view: "reviews",
      q: "boil",
      topic: "water",
      book: "B001",
      status: "needs_review",
      entry: "B001-027",
      invalid: [],
    });
  });

  it("defaults to guidance and reports invalid values instead of trusting them", () => {
    const p = readParams(
      new URLSearchParams(
        'view=everything&status=approved&entry=<script>&topic=a"b',
      ),
    );
    expect(p.view).toBe("guidance");
    expect(p.status).toBeNull();
    expect(p.entry).toBeNull();
    expect(p.topic).toBeNull();
    expect(p.invalid.sort()).toEqual(["entry", "status", "topic", "view"]);
  });
});
