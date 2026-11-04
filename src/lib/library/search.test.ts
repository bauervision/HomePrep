/*
 * Search behavior against the real Library guidance: typo tolerance, ranking
 * intent and filtering. Asserts outcomes, not scores.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { browse } from "./browse";
import { buildIndex, editDistance, normalize, search } from "./search";
import { LIBRARY_VERSION } from "./types";
import { parseGuidance } from "./validate";

const g = parseGuidance(
  JSON.parse(
    readFileSync(
      `public/library-data/v${LIBRARY_VERSION}/guidance.json`,
      "utf8",
    ),
  ),
);
const gi = buildIndex(g.entries, g.topics);
const ids = (q: string) => search(gi, q).map((e) => e.id);

describe("guidance search", () => {
  it("puts the right core card first for common typos", () => {
    expect(ids("boilng watr")[0]).toBe("HP-W05"); // Boil water when appropriate
    expect(ids("frige")[0]).toBe("HP-F04"); // Respond to a refrigeration outage
    expect(ids("handwashng")[0]).toBe("HP-S01"); // Keep a handwashing station available
    expect(ids("meeting places")[0]).toBe("HP-C02");
  });

  it("finds Shelter cards by hazard and by typo", () => {
    expect(ids("tornado")[0]).toBe("HP-H01");
    expect(ids("evacuaton")).toContain("HP-H03");
    expect(ids("accessible backup")[0]).toBe("HP-H02");
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

describe("browse", () => {
  it("derives topic counts from the data, with Shelter as its own topic", () => {
    const all = browse(gi, g.topics, "", { topic: null });
    expect(all.results).toHaveLength(27);
    expect(Object.fromEntries(all.topicCounts)).toEqual({
      water: 6,
      food: 5,
      power: 5,
      sanitation: 4,
      communications: 4,
      shelter: 3,
    });
    // Research-only topics have no guidance, so they get no pill.
    expect(all.topics.map((t) => t.id)).toEqual([
      "water",
      "food",
      "power",
      "sanitation",
      "communications",
      "shelter",
    ]);
  });

  it("filters by topic and keeps the other counts under the query", () => {
    const shelter = browse(gi, g.topics, "", { topic: "shelter" });
    expect(shelter.results.map((e) => e.id)).toEqual([
      "HP-H01",
      "HP-H02",
      "HP-H03",
    ]);
    expect(shelter.topicCounts.get("water")).toBe(6);
    const flood = browse(gi, g.topics, "flood", { topic: "shelter" });
    expect(flood.results.map((e) => e.id)).toContain("HP-H01");
    expect(flood.results.every((e) => e.topic_ids.includes("shelter"))).toBe(
      true,
    );
  });
});

describe("edit distance", () => {
  it("counts transpositions as one edit and stops early", () => {
    expect(editDistance("frige", "fridge", 2)).toBe(1);
    expect(editDistance("wtaer", "water", 2)).toBe(1);
    expect(editDistance("abc", "xyz", 1)).toBe(2);
  });
});
