/*
 * Search behavior against the real Library corpus: typo tolerance, ranking
 * intent and filtering. Asserts outcomes, not scores.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { browse } from "./browse";
import { buildIndex, editDistance, normalize, search } from "./search";
import { parseGuidance, parseReviewsIndex } from "./validate";

const load = (p: string) =>
  JSON.parse(readFileSync(`public/library-data/v1.1.0/${p}`, "utf8"));
const g = parseGuidance(load("guidance.json"));
const r = parseReviewsIndex(load("reviews-index.json"));
const gi = buildIndex(g.entries, g.topics);
const ri = buildIndex(r.entries, r.topics);
const ids = (q: string) => search(gi, q).map((e) => e.id);
const titles = (q: string) => search(ri, q).map((e) => e.title);

describe("guidance search", () => {
  it("puts the right core card first for common typos", () => {
    expect(ids("boilng watr")[0]).toBe("HP-W05"); // Boil water when appropriate
    expect(ids("frige")[0]).toBe("HP-F04"); // Respond to a refrigeration outage
    expect(ids("handwashng")[0]).toBe("HP-S01"); // Keep a handwashing station available
  });

  it("ranks every exact title first", () => {
    for (const e of g.entries) expect(ids(e.title)[0], e.title).toBe(e.id);
  });

  it("ignores case and punctuation", () => {
    for (const q of [
      "BOIL WATER WHEN APPROPRIATE",
      "boil-water, when appropriate!!",
      "  Boil   Water…  ",
    ])
      expect(ids(q)[0], q).toBe("HP-W05");
    expect(normalize("Farmer’s Water-Independence")).toBe(
      "farmers water independence",
    );
  });

  it("returns nothing for an unrelated query", () => {
    expect(ids("quantum spaceship telescope")).toEqual([]);
    expect(titles("quantum spaceship telescope")).toEqual([]);
    expect(ids("xylophone")).toEqual([]);
  });

  it("keeps multiword intent: every significant word must match", () => {
    expect(ids("water xylophone")).toEqual([]);
    // A common word alone matches many cards; adding a word narrows them.
    expect(ids("water").length).toBeGreaterThan(ids("boil water").length);
  });

  it("matches short queries tightly, by title-word prefix only", () => {
    const wa = search(gi, "wa");
    expect(wa.length).toBeGreaterThan(0);
    for (const e of wa)
      expect(
        normalize(e.title)
          .split(" ")
          .some((w) => w.startsWith("wa")),
      ).toBe(true);
    expect(ids("q")).toEqual([]);
  });

  it("returns the original order for an empty query", () => {
    expect(ids("")).toEqual(g.entries.map((e) => e.id));
  });
});

describe("book review search", () => {
  it("finds relevant records for typos across the whole collection", () => {
    expect(titles("frige").slice(0, 3).join(" ")).toMatch(/[Rr]efrigerat/);
    expect(titles("boilng watr").slice(0, 3).join(" ")).toMatch(/[Bb]oil/);
    expect(titles("handwashng").slice(0, 5).join(" ")).toMatch(
      /[Ww]ash|[Tt]oilet|[Hh]ygien/,
    );
    expect(titles("bleach dose")[0]).toBe("Bleach dose and contact time");
  });

  it("never changes a record's review status", () => {
    const before = new Map(r.entries.map((e) => [e.id, e.status]));
    for (const e of search(ri, "boilng watr"))
      expect(e.status).toBe(before.get(e.id));
  });

  it("doesn't index original claims or nested source material", () => {
    // "Eight drops of 6% bleach … wait 20 minutes" is B001-027's original
    // claim; only its reviewed fields are searchable.
    expect(search(ri, "stir and wait 20 minutes")).toEqual([]);
  });
});

describe("browse", () => {
  it("applies filters over the full collection and derives counts from data", () => {
    const all = browse(ri, r.topics, "", {
      topic: null,
      book: null,
      status: null,
    });
    expect(all.results).toHaveLength(2122);
    expect(Object.fromEntries(all.statusCounts)).toEqual({
      verified_principle: 83,
      source_reference: 988,
      needs_review: 1051,
    });
    expect([...all.bookCounts.values()].reduce((a, b) => a + b)).toBe(2122);
    // Entries can have several topics: facet counts don't sum to the total.
    const topicSum = [...all.topicCounts.values()].reduce((a, b) => a + b);
    expect(topicSum).toBeGreaterThan(2122);
    expect(all.topics).toHaveLength(11);
  });

  it("combines topic, book, status and query", () => {
    const f = { topic: "water", book: "B001", status: "needs_review" as const };
    const res = browse(ri, r.topics, "bleach", f);
    expect(res.results.length).toBeGreaterThan(0);
    for (const e of res.results) {
      expect(e.topic_ids).toContain("water");
      expect(e.source_id).toBe("B001");
      expect(e.status).toBe("needs_review");
    }
    // Facet counts ignore their own filter but respect the others.
    expect(res.statusCounts.get("needs_review")).toBe(res.results.length);
    expect(res.topicCounts.get("water")).toBe(res.results.length);
  });

  it("shows only the five core topics in guidance", () => {
    const res = browse(gi, g.topics, "", {
      topic: null,
      book: null,
      status: null,
    });
    expect(res.topics.map((t) => t.label)).toEqual([
      "Water",
      "Food and preservation",
      "Power and heat",
      "Sanitation",
      "Communications",
    ]);
    expect(res.results.every((e) => e.origin === "authoritative_core")).toBe(
      true,
    );
  });

  it("filters before ranking", () => {
    const res = browse(gi, g.topics, "boilng watr", {
      topic: "food",
      book: null,
      status: null,
    });
    expect(res.results.every((e) => e.topic_ids.includes("food"))).toBe(true);
  });
});

describe("edit distance", () => {
  it("counts transpositions as one edit and stops past the limit", () => {
    expect(editDistance("wtaer", "water", 2)).toBe(1);
    expect(editDistance("frige", "fridge", 2)).toBe(1);
    expect(editDistance("abc", "xyz123", 1)).toBe(2);
  });
});
