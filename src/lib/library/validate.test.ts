import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readParams } from "./browse";
import { formatDate, STATUS_LABEL } from "./format";
import { LIBRARY_VERSION } from "./types";
import { LibraryDataError, parseGuidance, safeHttpsUrl } from "./validate";

const guidance = JSON.parse(
  readFileSync(`public/library-data/v${LIBRARY_VERSION}/guidance.json`, "utf8"),
);
/** A book record from the private research archive (never publishable). */
const bookRecord = JSON.parse(
  readFileSync("data/library/v1.3.0/runtime/books/B001.json", "utf8"),
).entries[0];
const clone = <T>(v: T): T => structuredClone(v);

describe("guidance fails closed", () => {
  it("accepts every published card as authority-supported guidance", () => {
    const g = parseGuidance(guidance);
    expect(g.entries).toHaveLength(27);
    expect(g.rejected).toBe(0);
    expect(g.entries.every((e) => e.status === "authority_supported")).toBe(
      true,
    );
    expect(STATUS_LABEL.authority_supported).toBe(
      "Authority-supported guidance",
    );
  });

  it("rejects a book record placed in the guidance payload", () => {
    const raw = clone(guidance);
    raw.entries.push(clone(bookRecord));
    const g = parseGuidance(raw);
    expect(g.entries).toHaveLength(27);
    expect(g.rejected).toBe(1);
    expect(g.entries.some((e) => e.id === bookRecord.id)).toBe(false);
  });

  it("rejects a core card with a classification, unknown status or origin", () => {
    for (const change of [
      { classification: "verified_guidance" },
      { display_status: "verified_principle" },
      { display_status: "mystery" },
      { origin: "book_review" },
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
    raw.entries[4].source_citations = [{ book_page_start: "6" }];
    const g = parseGuidance(raw);
    expect(g.entries).toHaveLength(22);
    expect(g.rejected).toBe(5);
  });

  it("throws on a payload that isn't the expected shape or version", () => {
    expect(() => parseGuidance(null)).toThrow(LibraryDataError);
    expect(() => parseGuidance([])).toThrow(LibraryDataError);
    expect(() =>
      parseGuidance({ ...guidance, content_version: "1.3.0" }),
    ).toThrow(/content version/);
    expect(() => parseGuidance({ ...guidance, entries: undefined })).toThrow(
      /entries/,
    );
  });

  it("resolves only core evidence, with page dates for the Shelter sources", () => {
    const g = parseGuidance(guidance);
    expect(g.evidence.size).toBe(23);
    expect(g.evidence.get("CORE:A19")).toMatchObject({
      publisher: "FEMA / Ready.gov",
      url: "https://www.ready.gov/tornadoes",
      accessed_on: "2026-11-04",
      page_last_updated: "2026-06-02",
    });
    for (const e of g.entries)
      for (const ref of e.evidence)
        expect(g.evidence.has(ref.evidence_id), ref.evidence_id).toBe(true);
  });

  it("accepts only HTTPS evidence links", () => {
    expect(safeHttpsUrl("https://www.epa.gov/x")).toBe("https://www.epa.gov/x");
    expect(safeHttpsUrl("http://www.epa.gov/x")).toBeNull();
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpsUrl("../../source-archive/a.pdf")).toBeNull();
    expect(safeHttpsUrl(null)).toBeNull();
  });

  it("formats review dates as calendar dates", () => {
    expect(formatDate("2026-10-30")).toBe("Oct 30, 2026");
    expect(formatDate(null)).toBeNull();
  });
});

describe("Library URL parameters", () => {
  it("reads valid state", () => {
    expect(
      readParams(new URLSearchParams("q=boil&topic=water&entry=HP-W05")),
    ).toEqual({
      q: "boil",
      topic: "water",
      entry: "HP-W05",
      retiredReviews: false,
      invalid: [],
    });
  });

  it("recognizes links to the retired Book reviews collection", () => {
    for (const q of [
      "view=reviews",
      "view=reviews&book=B001&status=needs-review",
      "book=B007",
      "status=verified",
      "entry=B001-027",
      "view=reviews&entry=B015-192",
    ]) {
      const p = readParams(new URLSearchParams(q));
      expect(p.retiredReviews, q).toBe(true);
      // A book-review entry never opens; there is nothing to show.
      expect(p.entry, q).toBeNull();
      expect(p.invalid, q).toEqual([]);
    }
    expect(
      readParams(new URLSearchParams("view=guidance")).retiredReviews,
    ).toBe(false);
  });

  it("reports invalid values instead of trusting them", () => {
    const p = readParams(
      new URLSearchParams('view=everything&entry=<script>&topic=a"b'),
    );
    expect(p.entry).toBeNull();
    expect(p.topic).toBeNull();
    expect(p.invalid.sort()).toEqual(["entry", "topic", "view"]);
  });
});
