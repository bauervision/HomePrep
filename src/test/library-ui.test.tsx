// @vitest-environment jsdom
/*
 * Library interactions on the real static pack, served through a fake fetch.
 * The Library reads only `/library-data/`; nothing here touches Firestore.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { LibraryView } = await import("@/components/library/LibraryView");
const { clearLibraryCache } = await import("@/lib/library/load");

const file = (p: string) =>
  readFileSync(`public/${p.replace(/^\//, "")}`, "utf8");

type Handler = (
  url: string,
) => Promise<Response | undefined> | Response | undefined;
let override: Handler | null = null;
const fetchMock = vi.fn(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    expect(init?.method ?? "GET").toBe("GET");
    const custom = await override?.(url);
    if (custom) return custom;
    try {
      return new Response(file(url), { status: 200 });
    } catch {
      return new Response("not found", { status: 404 });
    }
  },
);
const requested = () => fetchMock.mock.calls.map((c) => String(c[0]));

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement &
    Record<string, unknown>;
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
beforeEach(() => {
  clearLibraryCache();
  override = null;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/library/");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function open(url = "/library/") {
  window.history.replaceState(null, "", url);
  return render(<LibraryView />);
}
const params = () => new URLSearchParams(window.location.search);
const cards = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-entry-id]"));
const cardIds = () => cards().map((c) => c.dataset.entryId);
const pill = (name: RegExp) =>
  within(screen.getByRole("group", { name: "Topic" })).getByRole("button", {
    name,
  });
const dialog = () => document.querySelector("dialog[open]") as HTMLElement;
const search = (q: string) =>
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: q } });
async function popstate(fn: () => void) {
  await act(async () => {
    fn();
    await new Promise((r) => setTimeout(r, 20));
  });
}

const ALL = "27 guidance entries";
/** Next.js adds the trailing slash in the export; the test router doesn't. */
const route = (href: string | null) => href?.replace("/?", "?");
const GUIDANCE_URL = "/library-data/v1.4.0/guidance.json";
const pillLabels = () =>
  within(screen.getByRole("group", { name: "Topic" }))
    .getAllByRole("button")
    .map((b) => b.textContent?.replace(/\d+$/, ""));

describe("Library: guidance", () => {
  it("opens on the guidance cards, loading only guidance, with no review collection", async () => {
    open();
    expect(screen.getByRole("status").textContent).toMatch(/Loading guidance/);
    await screen.findByText(ALL);
    expect(cards()).toHaveLength(27);
    expect(requested()).toEqual([GUIDANCE_URL]);
    expect(screen.queryByRole("button", { name: /Book reviews/ })).toBeNull();
    expect(screen.queryByRole("group", { name: "Collection" })).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /Needs review|Source reference|Verified principle|book review/i,
    );
    expect(document.body.textContent).not.toMatch(
      /example plan for five people/,
    );
  });

  it("shows each card's topic icon and label above the title, out of the metadata", async () => {
    open();
    await screen.findByText(ALL);
    for (const [id, topic, label] of [
      ["HP-W01", "water", "Water"],
      ["HP-F01", "food", "Food and preservation"],
      ["HP-P01", "power", "Power and heat"],
      ["HP-S01", "sanitation", "Sanitation"],
      ["HP-C02", "communications", "Communications"],
      ["HP-H01", "shelter", "Shelter"],
    ]) {
      const card = cards().find((c) => c.dataset.entryId === id)!;
      expect(card.dataset.topic).toBe(topic);
      const cue = card.querySelector(`[data-topic="${topic}"]`)!;
      // Recognizable without color: an icon and the visible label.
      expect(cue.textContent).toBe(label);
      expect(cue.querySelector("svg")).toBeTruthy();
      // The label comes before the title, and isn't repeated in the metadata.
      expect(card.textContent!.indexOf(label)).toBeLessThan(
        card.textContent!.indexOf(
          card.querySelector(".text-\\[15px\\]")!.textContent!,
        ),
      );
      expect(card.textContent!.split(label)).toHaveLength(2);
      expect(card.textContent).toMatch(/Authority-supported guidance/);
    }
    // Neighboring topics use different accents.
    const accent = (id: string) =>
      cards()
        .find((c) => c.dataset.entryId === id)!
        .className.match(/border-l-(\w+)-/)![1];
    expect(new Set(["HP-W01", "HP-F01", "HP-P01"].map(accent)).size).toBe(3);
  });

  it("filters by topic with an icon, a check and pressed state, and shows Shelter from the data", async () => {
    open();
    await screen.findByText(ALL);
    expect(pillLabels()).toEqual([
      "All topics",
      "Water",
      "Food and preservation",
      "Power and heat",
      "Sanitation",
      "Communications",
      "Shelter",
    ]);
    expect(pill(/^Shelter/).textContent).toBe("Shelter3");
    expect(pill(/^Shelter/).querySelector("svg")).toBeTruthy();
    // All topics is neutral; topic pills carry their accent before selection.
    expect(pill(/^All topics/).dataset.topic).toBeUndefined();

    fireEvent.click(pill(/^Communications/));
    const comms = pill(/^Communications/);
    expect(comms.getAttribute("aria-pressed")).toBe("true");
    expect(comms.className).toMatch(/outline-violet/);
    expect(comms.querySelector("svg.lucide-check")).toBeTruthy();
    expect(pill(/^All topics/).getAttribute("aria-pressed")).toBe("false");
    expect(params().get("topic")).toBe("communications");
    expect(cards()).toHaveLength(4);
    for (const c of cards()) {
      expect(c.dataset.topic).toBe("communications");
      expect(c.className).toMatch(/border-l-violet/);
    }

    fireEvent.click(pill(/^Shelter/));
    expect(cardIds()).toEqual(["HP-H01", "HP-H02", "HP-H03"]);
    fireEvent.click(pill(/^Shelter/));
    expect(params().get("topic")).toBeNull();
    expect(cards()).toHaveLength(27);
  });

  it("finds typo queries, keeps topic cues, and offers recovery when nothing matches", async () => {
    open();
    await screen.findByText(ALL);
    search("frige");
    await waitFor(() => expect(cardIds()[0]).toBe("HP-F04"));
    expect(cards()[0].dataset.topic).toBe("food");
    // No water card matches "frige", so its pill is disabled.
    expect((pill(/^Water/) as HTMLButtonElement).disabled).toBe(true);
    search("tornado");
    await waitFor(() => expect(cardIds()[0]).toBe("HP-H01"));
    search("");
    fireEvent.click(pill(/^Water/));
    search("zzzzqqq");
    await screen.findByText(/No guidance matches “zzzzqqq” with this topic/);
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    await waitFor(() => expect(cards()).toHaveLength(6));
    search("zzzzqqq");
    fireEvent.click(
      await screen.findByRole("button", { name: "Reset filters" }),
    );
    expect(params().get("topic")).toBeNull();
  });

  it("shows a core card's full guidance and its topic in the detail header", async () => {
    open();
    await screen.findByText(ALL);
    const trigger = cards().find((c) => c.dataset.entryId === "HP-W01")!;
    fireEvent.click(trigger);
    expect(params().get("entry")).toBe("HP-W01");
    const d = dialog();
    const header = d.querySelector("header")!;
    expect(header.querySelector('[data-topic="water"]')!.textContent).toBe(
      "Water",
    );
    expect(
      within(d).getByText(/Quantities shown are examples for five people/),
    ).toBeTruthy();
    for (const h of [
      "When to use",
      "Steps",
      "Limits",
      "Observable completion requirements",
      "Authority sources",
    ])
      expect(within(d).getByRole("heading", { name: h })).toBeTruthy();
    const link = within(d).getByRole("link", { name: /www\.cdc\.gov/ });
    expect(link.getAttribute("href")).toMatch(/^https:\/\/www\.cdc\.gov\//);
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(d.textContent).not.toMatch(/Milestone associations/);
    expect(d.textContent).not.toMatch(/Research metadata only/);

    await popstate(() => window.history.back());
    expect(params().get("entry")).toBeNull();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(
      cards().find((c) => c.dataset.entryId === "HP-W01"),
    );
  });

  it("deep-links to a Shelter card with its sources, page dates and review date", async () => {
    open("/library/?entry=HP-H01");
    await within(document.body).findByRole("heading", { name: "Steps" });
    const d = dialog();
    expect(d.querySelector('header [data-topic="shelter"]')!.textContent).toBe(
      "Shelter",
    );
    expect(d.textContent).toMatch(/Reviewed Nov 4, 2026/);
    expect(d.textContent).toMatch(/^.*Tornado or severe wind warning/);
    expect(d.textContent).toMatch(/closed attic/);
    for (const host of ["www.ready.gov"])
      expect(
        within(d).getAllByRole("link", { name: new RegExp(host) }).length,
      ).toBeGreaterThanOrEqual(3);
    expect(d.textContent).toMatch(
      /Page updated Jun 2, 2026 · Checked Nov 4, 2026/,
    );
    // Filter context survives the deep link.
    cleanup();
    open("/library/?topic=shelter&entry=HP-H02");
    await within(document.body).findByRole("heading", { name: "Steps" });
    expect(cardIds()).toEqual(["HP-H01", "HP-H02", "HP-H03"]);
  });

  it("closes a detail with Escape (dialog close) and returns focus", async () => {
    open("/library/?topic=water");
    await waitFor(() => expect(cards()).toHaveLength(6));
    fireEvent.click(cards()[4]);
    const id = params().get("entry");
    expect(id).toBe("HP-W05");
    await popstate(() => (dialog() as HTMLDialogElement).close());
    expect(params().get("entry")).toBeNull();
    expect(params().get("topic")).toBe("water");
    expect(document.activeElement?.getAttribute("data-entry-id")).toBe(id);
  });

  it("shows Unavailable for a missing or invalid entry, with a way back", async () => {
    open("/library/?entry=HP-NOPE");
    await within(document.body).findByText("Entry unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Back to Library" }));
    expect(params().get("entry")).toBeNull();
    cleanup();
    open("/library/?entry=%3Cscript%3E");
    await within(document.body).findByText("Entry unavailable");
  });

  it("recovers from invalid parameters", async () => {
    open("/library/?view=everything&topic=nonsense");
    await screen.findByText(ALL);
    expect(screen.getByRole("status").textContent).toMatch(/view, topic/);
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(params().toString()).toBe("");
  });
});

describe("Library: retired book-review links", () => {
  it("falls back to Guidance with a notice, never requesting review data", async () => {
    for (const url of [
      "/library/?view=reviews",
      "/library/?view=reviews&book=B007&status=needs-review",
      "/library/?view=reviews&entry=B015-192",
      "/library/?entry=B001-027",
    ]) {
      cleanup();
      clearLibraryCache();
      fetchMock.mockClear();
      open(url);
      await screen.findByText(ALL);
      await waitFor(() => expect(params().get("notice")).toBe("reviews"));
      for (const k of ["view", "book", "status", "entry"])
        expect(params().get(k), `${url} ${k}`).toBeNull();
      expect(screen.getByRole("status").textContent).toMatch(
        /Book reviews are no longer part of the household Library/,
      );
      expect(dialog()).toBeNull();
      expect(requested()).toEqual([GUIDANCE_URL]);
    }
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(params().get("notice")).toBeNull();
  });

  it("keeps guidance search and topic from an old link", async () => {
    open("/library/?view=reviews&q=boil&topic=water");
    await waitFor(() => expect(params().get("notice")).toBe("reviews"));
    expect(params().get("q")).toBe("boil");
    expect(params().get("topic")).toBe("water");
    await waitFor(() => expect(cardIds()[0]).toBe("HP-W05"));
  });
});

describe("Library: card actions", () => {
  const actionLinks = () =>
    within(within(dialog()).getByTestId("library-actions"))
      .getAllByRole("link")
      .map((a) => [a.textContent, route(a.getAttribute("href"))]);

  it("offers a task draft and the existing goal for “Agree on two meeting places”", async () => {
    open("/library/?entry=HP-C02");
    await within(document.body).findByTestId("library-actions");
    expect(actionLinks()).toEqual([
      ["Create Task", "/tasks?draft=HP-C02"],
      [
        "View existing goal",
        "/goals?milestone=72h&goal=comms&requirement=72h.comms.reconnect",
      ],
    ]);
    // The actions come before the guidance itself.
    const d = dialog();
    expect(
      d.textContent!.indexOf("Create Task") <
        d.textContent!.indexOf("When to use"),
    ).toBe(true);
    expect(d.textContent).toMatch(/Review the draft before saving/);
  });

  it("offers Create Goal where no built-in goal covers the card", async () => {
    open("/library/?entry=HP-H02");
    await within(document.body).findByTestId("library-actions");
    expect(actionLinks()).toEqual([
      ["Create Task", "/tasks?draft=HP-H02"],
      ["Create Goal", "/goals?milestone=72h&goal=library-shelter&draft=HP-H02"],
    ]);
  });

  it("offers actions on every authority-supported card", async () => {
    open();
    await screen.findByText(ALL);
    for (const id of cardIds()) {
      cleanup();
      open(`/library/?entry=${id}`);
      await within(document.body).findByTestId("library-actions");
      expect(actionLinks()).toHaveLength(2);
    }
  });
});

describe("Library: loading failures", () => {
  it("shows an HTTP failure as an error, not an empty collection, and retries", async () => {
    let fail = true;
    override = (url) =>
      fail && url.endsWith("guidance.json")
        ? new Response("oops", { status: 500 })
        : undefined;
    open();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Couldn’t load the guidance.*500/);
    expect(screen.queryByText(/0 guidance/)).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText(ALL);
  });

  it("treats invalid JSON and a malformed payload as errors", async () => {
    override = (url) =>
      url.endsWith("guidance.json")
        ? new Response("{not json", { status: 200 })
        : undefined;
    open();
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /not in the expected format/,
    );
    cleanup();
    clearLibraryCache();
    override = (url) =>
      url.endsWith("guidance.json")
        ? new Response(JSON.stringify({ content_version: "1.4.0" }), {
            status: 200,
          })
        : undefined;
    open();
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /not in the expected format/,
    );
  });

  it("reuses loaded files within the session", async () => {
    const first = open();
    await screen.findByText(ALL);
    first.unmount();
    open();
    await screen.findByText(ALL);
    expect(requested()).toEqual([GUIDANCE_URL]);
  });
});

describe("Library is read-only", () => {
  it("keeps Library browsing free of writes and readiness mutations", () => {
    const dirs = [
      "src/lib/library",
      "src/components/library",
      "src/app/library",
    ];
    for (const dir of dirs)
      for (const f of readdirSync(dir).filter(
        (n) => /\.tsx?$/.test(n) && !n.includes(".test."),
      )) {
        const src = readFileSync(`${dir}/${f}`, "utf8");
        expect(src, f).not.toMatch(
          /\b(addDoc|setDoc|updateDoc|deleteDoc|runTransaction|writeBatch|seedHousehold|createLibraryTask)\s*\(/,
        );
      }
  });

  it("makes only GET requests for the guidance file while browsing", async () => {
    open("/library/?entry=HP-C02");
    await within(document.body).findByTestId("library-actions");
    expect(requested()).toEqual([GUIDANCE_URL]);
    expect(window.localStorage.length).toBe(0);
  });
});
