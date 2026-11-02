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

describe("Library: guidance", () => {
  it("opens on the 24 guidance cards, loading only guidance", async () => {
    open();
    expect(screen.getByRole("status").textContent).toMatch(/Loading guidance/);
    await screen.findByText("24 guidance entries");
    expect(cards()).toHaveLength(24);
    expect(requested()).toEqual(["/library-data/v1.0.0/guidance.json"]);
    expect(
      screen
        .getByRole("button", { name: /Guidance/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(document.body.textContent).not.toMatch(
      /Needs review|Source reference|Verified principle/,
    );
    expect(document.body.textContent).toMatch(/example plan for five people/);
  });

  it("filters by one topic at a time with pressed state, and toggles back", async () => {
    open();
    await screen.findByText("24 guidance entries");
    const labels = within(screen.getByRole("group", { name: "Topic" }))
      .getAllByRole("button")
      .map((b) => b.textContent?.replace(/\d+$/, ""));
    expect(labels).toEqual([
      "All topics",
      "Water",
      "Food and preservation",
      "Power and heat",
      "Sanitation",
      "Communications",
    ]);
    fireEvent.click(pill(/^Water/));
    expect(pill(/^Water/).getAttribute("aria-pressed")).toBe("true");
    expect(pill(/^All topics/).getAttribute("aria-pressed")).toBe("false");
    expect(params().get("topic")).toBe("water");
    expect(cards()).toHaveLength(6);
    fireEvent.click(pill(/^Sanitation/));
    expect(cards()).toHaveLength(4);
    fireEvent.click(pill(/^Sanitation/));
    expect(params().get("topic")).toBeNull();
    expect(cards()).toHaveLength(24);
  });

  it("finds typo queries and offers recovery when nothing matches", async () => {
    open();
    await screen.findByText("24 guidance entries");
    search("frige");
    await waitFor(() => expect(cardIds()[0]).toBe("HP-F04"));
    // No water card matches "frige", so its pill is disabled.
    expect((pill(/^Water/) as HTMLButtonElement).disabled).toBe(true);
    search("");
    fireEvent.click(pill(/^Water/));
    search("zzzzqqq");
    await screen.findByText(/No guidance match “zzzzqqq” with these filters/);
    expect(screen.queryByRole("status")).toBeNull(); // not a loading state
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    await waitFor(() => expect(cards()).toHaveLength(6));
    search("zzzzqqq");
    fireEvent.click(
      await screen.findByRole("button", { name: "Reset filters" }),
    );
    expect(params().get("topic")).toBeNull();
  });

  it("disables topics that have no matches under the current search", async () => {
    open("/library/?q=handwashng");
    await waitFor(() => expect(cardIds()[0]).toBe("HP-S01"));
    expect((pill(/^Power and heat/) as HTMLButtonElement).disabled).toBe(true);
    expect((pill(/^Sanitation/) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows a core card's full guidance, with authority links, as a five-person example", async () => {
    open();
    await screen.findByText("24 guidance entries");
    const trigger = cards().find((c) => c.dataset.entryId === "HP-W01")!;
    fireEvent.click(trigger);
    expect(params().get("entry")).toBe("HP-W01");
    const d = dialog();
    expect(within(d).getByText("Example plan for five people.")).toBeTruthy();
    for (const h of [
      "When to use",
      "Prerequisites",
      "Steps",
      "Limits",
      "Observable completion requirements",
      "Maintenance",
      "Escalation",
      "Editorial adaptation",
      "Authority sources",
    ])
      expect(within(d).getByRole("heading", { name: h })).toBeTruthy();
    expect(d.textContent).toMatch(/Household completion: not assessed/);
    expect(d.textContent).toMatch(
      /irrigation well contributes no drinking-water/,
    );
    expect(d.textContent).not.toMatch(/Book p\./);
    const link = within(d).getByRole("link", { name: /www\.cdc\.gov/ });
    expect(link.getAttribute("href")).toMatch(/^https:\/\/www\.cdc\.gov\//);
    expect(link.getAttribute("rel")).toContain("noopener");
    // 14 days is shown as recorded, not mapped to an app objective.
    expect(d.textContent).toMatch(/14 days/);

    // Back closes the detail and keeps the filter context.
    await popstate(() => window.history.back());
    expect(params().get("entry")).toBeNull();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(
      cards().find((c) => c.dataset.entryId === "HP-W01"),
    );
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
    await screen.findByText("24 guidance entries");
    expect(screen.getByRole("status").textContent).toMatch(/view, topic/);
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(params().toString()).toBe("");
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
    await screen.findByText("24 guidance entries");
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
    override = (url) =>
      url.endsWith("reviews-index.json")
        ? new Response(JSON.stringify({ content_version: "1.0.0" }), {
            status: 200,
          })
        : undefined;
    open("/library/?view=reviews");
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /book review index.*sources/,
    );
  });

  it("reuses loaded files within the session", async () => {
    const first = open();
    await screen.findByText("24 guidance entries");
    first.unmount();
    open();
    await screen.findByText("24 guidance entries");
    expect(requested()).toEqual(["/library-data/v1.0.0/guidance.json"]);
  });
});

describe("Library: book reviews", () => {
  it("loads the index on entering, with its own labels, filters and pagination", async () => {
    open();
    await screen.findByText("24 guidance entries");
    fireEvent.click(screen.getByRole("button", { name: /Book reviews/ }));
    expect(params().get("view")).toBe("reviews");
    await screen.findByText("1,466 book review records · showing 24");
    expect(requested()).toContain("/library-data/v1.0.0/reviews-index.json");
    expect(requested().some((u) => u.includes("/books/"))).toBe(false);
    expect(cards()).toHaveLength(24);
    expect(document.body.textContent).toMatch(/unresolved claims/);

    const book = screen.getByRole("combobox", { name: "Book" });
    const options = within(book)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toContain("A Farmer’s Water Independence Guide (214)");
    const status = screen.getByRole("combobox", { name: "Review status" });
    expect(
      within(status)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "All review statuses",
      "Verified principle — limited scope (63)",
      "Source reference — not independently verified (649)",
      "Needs review — not approved instructions (754)",
    ]);

    fireEvent.click(screen.getByRole("button", { name: /Show more/ }));
    expect(cards()).toHaveLength(48);
    fireEvent.change(status, { target: { value: "verified" } });
    expect(params().get("status")).toBe("verified");
    await screen.findByText(
      "63 of 1,466 book review records match · showing 24",
    );
    expect(cards()).toHaveLength(24); // pagination reset
    for (const c of cards())
      expect(c.textContent).toMatch(/Verified principle — limited scope/);

    fireEvent.change(book, { target: { value: "B006" } });
    fireEvent.change(status, { target: { value: "" } });
    await screen.findByText(
      "58 of 1,466 book review records match · showing 24",
    );
    fireEvent.click(pill(/^Food and preservation/));
    for (const c of cards()) expect(c.textContent).toMatch(/Cyber Sabotage/);

    // Search results keep their review labels.
    fireEvent.change(book, { target: { value: "" } });
    fireEvent.click(pill(/^All topics/));
    search("boilng watr");
    await waitFor(() => expect(cards().length).toBeGreaterThan(0));
    for (const c of cards())
      expect(c.textContent).toMatch(
        /Verified principle — limited scope|Source reference — not independently verified|Needs review — not approved instructions/,
      );

    // Going back to guidance never shows book records as guidance.
    fireEvent.click(screen.getByRole("button", { name: /^Guidance/ }));
    search("");
    await screen.findByText("24 guidance entries");
    expect(cardIds().every((id) => id?.startsWith("HP-"))).toBe(true);
  });

  it("opens a direct link to a book entry in its own collection, with corrections and collapsed source material", async () => {
    open("/library/?entry=B001-027");
    await within(document.body).findByRole("heading", {
      name: "Reviewed guidance",
    });
    expect(params().get("view")).toBe("reviews");
    const d = dialog();
    expect(d.textContent).toMatch(/Needs review — not approved instructions/);
    expect(d.textContent).not.toMatch(/Authority-supported guidance/);
    expect(within(d).getByText("Bleach treatment")).toBeTruthy();
    expect(d.textContent).toMatch(/B001:C01/);
    expect(
      within(d).getByRole("list", { name: "Safety flags" }).textContent,
    ).toBe("microbialdose");
    expect(d.textContent).toMatch(/Correction or constraint/);
    expect(d.textContent).toMatch(/Book p\. 18 · PDF p\. 19/);
    expect(d.textContent).toMatch(/Chapter 3: Purifying Your Water/);
    const details = d.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")!.textContent).toMatch(
      /Original source material — unreviewed/,
    );
    // The original claim is only inside the collapsed section.
    expect(details.textContent).toMatch(/Eight drops of 6% bleach/);
    expect(d.textContent!.indexOf("Eight drops of 6% bleach")).toBeGreaterThan(
      d.textContent!.indexOf("Original source material"),
    );
    expect(requested()).toEqual([
      "/library-data/v1.0.0/guidance.json",
      "/library-data/v1.0.0/reviews-index.json",
      "/library-data/v1.0.0/books/B001.json",
    ]);
    // Closing a direct link stays on the Library.
    fireEvent.click(within(d).getByRole("button", { name: "Close" }));
    expect(params().get("entry")).toBeNull();
    expect(window.location.pathname).toBe("/library/");
  });

  it("shows unnumbered and mixed page citations exactly", async () => {
    open("/library/?view=reviews&entry=B006-001");
    const list = await within(document.body).findByRole("list", {
      name: "Citations",
    });
    expect(list.textContent).toBe("Book p. unnumbered · PDF p. 1 · Overview");
    cleanup();
    open("/library/?view=reviews&entry=B007-001");
    const mixed = await within(document.body).findByRole("list", {
      name: "Citations",
    });
    expect(mixed.textContent).toBe(
      "Book p. unnumbered–1 · PDF p. 1–2 · Front matter",
    );
  });

  it("resolves evidence within the entry's own book namespace", async () => {
    open("/library/?view=reviews&entry=B005-008");
    await within(document.body).findByRole("heading", { name: "Evidence" });
    const d = dialog();
    expect(d.textContent).toMatch(/B005:E01/);
    expect(d.textContent).toMatch(
      /An essential guide to building an emergency fund/,
    );
    expect(d.textContent).not.toMatch(
      /How to Create an Emergency Water Supply/,
    );
  });

  it("shows a verified principle's scope limits and verification date", async () => {
    open("/library/?view=reviews&entry=B001-008");
    await within(document.body).findByRole("heading", {
      name: "Reviewed guidance",
    });
    const d = dialog();
    expect(d.textContent).toMatch(/Verified principle — limited scope/);
    expect(d.textContent).toMatch(/doesn’t approve the book’s original/);
    expect(d.textContent).toMatch(/Verified Oct 30, 2026/);
  });

  it("keeps nested source components, labeled, inside the collapsed section", async () => {
    open("/library/?view=reviews&entry=B007-009");
    const comps = await within(document.body).findByRole("list", {
      name: "Source components",
    });
    expect(comps.closest("details")!.open).toBe(false);
    expect(within(comps).getAllByRole("listitem")).toHaveLength(13);
    expect(comps.textContent).toMatch(/Materials needed:/);
  });

  it("retries a failed book detail load without showing other content", async () => {
    let fail = true;
    override = (url) =>
      fail && url.endsWith("B001.json")
        ? new Response("x", { status: 503 })
        : undefined;
    open("/library/?view=reviews&entry=B001-027");
    const alert = await within(document.body).findByRole("alert");
    expect(alert.textContent).toMatch(/Couldn’t load the book.*503/);
    expect(dialog().textContent).not.toMatch(/Reviewed guidance/);
    fail = false;
    fireEvent.click(within(dialog()).getByRole("button", { name: "Retry" }));
    await within(document.body).findByRole("heading", {
      name: "Reviewed guidance",
    });
  });

  it("never shows a slow, previously selected book under the current entry", async () => {
    let releaseB002!: () => void;
    const gate = new Promise<void>((r) => (releaseB002 = r));
    override = async (url) => {
      if (!url.endsWith("B002.json")) return undefined;
      await gate;
      return new Response(file(url), { status: 200 });
    };
    const b002 = JSON.parse(
      file("/library-data/v1.0.0/reviews-index.json"),
    ).entries.find((e: { source_id: string }) => e.source_id === "B002");
    open(`/library/?view=reviews&entry=${b002.id}`);
    await within(document.body).findByText(/Loading the full review/);
    // Switch to a B001 entry before B002 arrives.
    await popstate(() =>
      window.history.replaceState(
        null,
        "",
        "/library/?view=reviews&entry=B001-027",
      ),
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
    await within(document.body).findByText("Bleach treatment");
    await act(async () => {
      releaseB002();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(
      screen.getByRole("heading", { name: "Bleach dose and contact time" }),
    ).toBeTruthy();
    expect(dialog().textContent).toMatch(/Bleach treatment/);
    expect(dialog().textContent).not.toContain(b002.title);
  });
});

describe("Library is read-only", () => {
  it("imports no household, Firestore or readiness modules", () => {
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
          /firebase|@\/lib\/(data|hooks|readiness|requirements|goals|tasks|inventory|seed|checklist|objective|household)\b|SessionProvider/,
        );
      }
  });

  it("makes only GET requests for the static pack while browsing", async () => {
    open("/library/?view=reviews&entry=B001-027");
    await within(document.body).findByText("Bleach treatment");
    expect(
      requested().every((u) => u.startsWith("/library-data/v1.0.0/")),
    ).toBe(true);
    expect(window.localStorage.length).toBe(0);
  });
});
