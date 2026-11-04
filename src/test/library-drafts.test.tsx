// @vitest-environment jsdom
/*
 * Library → household drafts on the real Tasks and Goals pages, backed by the
 * in-memory Firestore and the real Library guidance file. Opening or
 * canceling a draft writes nothing; saving uses the usual forms.
 */
import type { User } from "firebase/auth";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  useEffect,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock(
  "firebase/firestore",
  async () => (await import("@/test/fake-firestore")).firestoreModule,
);
vi.mock(
  "@/lib/firebase",
  async () => (await import("@/test/fake-firestore")).firebaseModule,
);
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const { fakeDb } = await import("@/test/fake-firestore");
const { doc, onSnapshot } = await import("firebase/firestore");
const { SessionContext } = await import("@/components/SessionProvider");
const { default: GoalsPage } = await import("@/app/goals/page");
const { default: TasksPage } = await import("@/app/tasks/page");
const { seedHousehold } = await import("@/lib/seed");
const { db } = await import("@/lib/firebase");
const { clearLibraryCache } = await import("@/lib/library/load");

type SessionState = import("@/components/SessionProvider").SessionState;
type Household = import("@/lib/types").Household;
type RequirementState = import("@/lib/types").RequirementState;
type Task = import("@/lib/types").Task;

function LiveSession({ children }: { children: ReactNode }) {
  const [household, setHousehold] = useState<Household | null>(null);
  useEffect(
    () =>
      onSnapshot(doc(db(), "households", "h1"), (s) =>
        setHousehold({ id: s.id, ...s.data() } as Household),
      ),
    [],
  );
  if (!household) return null;
  const user = {
    uid: "u1",
    email: "u1@example.test",
    displayName: "Alex",
  } as unknown as User;
  const state: SessionState = {
    status: "ready",
    user,
    household,
    member: {
      uid: "u1",
      displayName: "Alex",
      email: "u1@example.test",
      photoURL: null,
      role: "member",
    },
    seedError: null,
  };
  return (
    <SessionContext.Provider
      value={{ state, signIn: async () => {}, signOut: async () => {} }}
    >
      {children}
    </SessionContext.Provider>
  );
}

const mount = (ui: ReactNode) => render(<LiveSession>{ui}</LiveSession>);
const goTo = (url: string) => window.history.replaceState(null, "", url);
const params = () => new URLSearchParams(window.location.search);
const household = () => fakeDb.get("households/h1") as unknown as Household;
const state = () => (household().requirementState ?? {}) as RequirementState;
const tasks = () => fakeDb.list("households/h1/tasks") as unknown as Task[];
const dialog = () => document.querySelector("dialog[open]") as HTMLElement;
const field = (root: HTMLElement, label: string) =>
  within(root).getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;
/** Everything the household has stored, for "nothing was written" checks. */
const snapshot = () =>
  JSON.stringify({
    household: household(),
    tasks: tasks(),
    inventory: fakeDb.list("households/h1/inventory"),
  });

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  try {
    return new Response(readFileSync(`public${url}`, "utf8"), { status: 200 });
  } catch {
    return new Response("not found", { status: 404 });
  }
});

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

beforeEach(async () => {
  vi.stubGlobal("crypto", webcrypto);
  goTo("/");
  clearLibraryCache();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  fakeDb.reset();
  window.localStorage.clear();
  fakeDb.set("households/h1", {
    name: "Bauer",
    ownerUid: "u0",
    householdSize: 5,
    adults: 2,
    children: 3,
    profileVersion: 1,
  });
  await seedHousehold("h1");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Task drafts from a Library card", () => {
  it("opens the usual task form prefilled, and Cancel writes nothing", async () => {
    goTo("/tasks/?draft=HP-C02");
    const before = snapshot();
    mount(<TasksPage />);
    const d = await waitFor(() => {
      const el = dialog();
      expect(el?.textContent).toMatch(/New task from the Library/);
      return el;
    });
    await waitFor(() =>
      expect(field(d, "Task").value).toBe("Agree on two meeting places"),
    );
    const notes = field(d, "Notes").value;
    expect(notes).toMatch(/^Steps:\n1\. Choose at least two meeting places/);
    expect(notes).toMatch(/Include assistance and pickup needs\./);
    expect(notes).toMatch(
      /Done when: Record both places and confirm everyone understands the plan\./,
    );
    expect(notes).toMatch(/Limits:\n- A meeting point is not usable/);
    expect(notes).toMatch(/From the HomePrep Library/);
    expect(
      (within(d).getByLabelText("Category") as HTMLSelectElement).value,
    ).toBe("Communications");
    expect(
      within(d)
        .getByRole("link", { name: "Agree on two meeting places" })
        .getAttribute("href"),
    ).toBe("/library/?entry=HP-C02");
    expect(snapshot()).toBe(before); // opening wrote nothing

    fireEvent.click(within(d).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(params().get("draft")).toBeNull());
    expect(dialog()).toBeNull();
    expect(snapshot()).toBe(before);
  });

  it("saves an edited draft as a normal task that links back to the card", async () => {
    goTo("/tasks/?draft=HP-C02");
    const count = tasks().length;
    mount(<TasksPage />);
    const d = await waitFor(() => {
      const el = dialog();
      expect(field(el, "Task").value).toBe("Agree on two meeting places");
      return el;
    });
    fireEvent.change(field(d, "Task"), {
      target: { value: "Pick our two meeting places" },
    });
    fireEvent.click(within(d).getByRole("button", { name: "Create task" }));
    fireEvent.submit(
      within(d).getByRole("button", { name: "Create task" }).closest("form")!,
    );
    await waitFor(() => expect(tasks()).toHaveLength(count + 1));
    const t = tasks().find((x) => x.libraryEntryId === "HP-C02")!;
    expect(t).toMatchObject({
      title: "Pick our two meeting places",
      category: "Communications",
      milestone: "72h",
      status: "todo",
    });
    expect(t.notes).toMatch(/Done when:/);
    await waitFor(() => expect(params().get("draft")).toBeNull());

    // The saved task links back to its card.
    fireEvent.click(await screen.findByText("Pick our two meeting places"));
    expect(
      within(dialog())
        .getByRole("link", { name: "open it in the Library" })
        .getAttribute("href"),
    ).toBe("/library/?entry=HP-C02");
  });

  it("says so, and writes nothing, for a card that doesn't exist", async () => {
    goTo("/tasks/?draft=HP-NOPE");
    const before = snapshot();
    mount(<TasksPage />);
    await waitFor(() =>
      expect(dialog()?.textContent).toMatch(/isn’t available/),
    );
    expect(snapshot()).toBe(before);
  });
});

describe("Goal drafts from a Library card", () => {
  it("opens New Goal prefilled in the mapped goal, and Cancel writes nothing", async () => {
    goTo("/goals/?milestone=72h&goal=plan&draft=HP-H02");
    const before = snapshot();
    mount(<GoalsPage />);
    const form = await screen.findByRole("form", { name: "New goal" });
    expect(field(form, "Goal title").value).toBe(
      "Arrange an accessible backup place to stay",
    );
    expect(field(form, "Description (optional)").value).toMatch(
      /^Done when: Record at least two destinations/,
    );
    const notes = field(form, "Notes (optional)").value;
    expect(notes.length).toBeLessThanOrEqual(600);
    expect(notes).toMatch(/^From the HomePrep Library/);
    expect(notes).toMatch(/Steps:\n1\. Identify several places/);
    expect(screen.getByText(/Drafted from the Library card/)).toBeTruthy();
    expect(screen.getByTestId("goal-detail").textContent).toMatch(
      /Family plan|Know where to go/,
    );
    expect(snapshot()).toBe(before);

    fireEvent.click(within(form).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(params().get("draft")).toBeNull());
    expect(screen.queryByRole("form", { name: "New goal" })).toBeNull();
    expect(snapshot()).toBe(before);
  });

  it("saves as a household goal that counts as open, with a link back to the card", async () => {
    goTo("/goals/?milestone=72h&goal=plan&draft=HP-H02");
    mount(<GoalsPage />);
    const form = await screen.findByRole("form", { name: "New goal" });
    fireEvent.click(within(form).getByRole("button", { name: "Save goal" }));
    await waitFor(() =>
      expect(
        Object.values(state()).filter((r) => r.custom?.libraryEntryId),
      ).toHaveLength(1),
    );
    const [id, rec] = Object.entries(state()).find(
      ([, r]) => r.custom?.libraryEntryId,
    )!;
    expect(id).toMatch(/^custom-/);
    expect(rec.custom).toMatchObject({
      milestone: "72h",
      goal: "library-shelter",
      title: "Arrange an accessible backup place to stay",
      libraryEntryId: "HP-H02",
    });
    // Saving a draft is not completing it.
    expect(rec.confirmed).toBeUndefined();
    await waitFor(() => expect(params().get("draft")).toBeNull());
    const row = await screen.findByTestId(`requirement-${id}`);
    expect(row.dataset.status).toBe("not-started");
    const toggle = document.getElementById(`req-toggle-${id}`)!;
    if (toggle.getAttribute("aria-expanded") !== "true")
      fireEvent.click(toggle);
    expect(
      within(row)
        .getByRole("link", { name: "open it in the Library" })
        .getAttribute("href"),
    ).toBe("/library/?entry=HP-H02");
  });
});

describe("View existing goal", () => {
  it("opens the built-in requirement, keeping the household's wording, notes and completion", async () => {
    const at = "2026-10-20T12:00:00.000Z";
    fakeDb.set("households/h1", {
      ...household(),
      requirementState: {
        "72h.comms.reconnect": {
          text: { title: "How the Bauers find each other" },
          notes: "Meet at the library, then Grandma’s.",
          confirmed: { by: "Alex", at },
          updatedAt: at,
        },
      },
    });
    const before = JSON.stringify(state());
    goTo("/goals/?milestone=72h&goal=comms&requirement=72h.comms.reconnect");
    mount(<GoalsPage />);
    const row = await screen.findByTestId("requirement-72h.comms.reconnect");
    // Opened and focused by the deep link.
    await waitFor(() =>
      expect(document.activeElement?.id).toBe("req-toggle-72h.comms.reconnect"),
    );
    expect(row.textContent).toMatch(/How the Bauers find each other/);
    expect(row.textContent).toMatch(/Meet at the library, then Grandma’s\./);
    expect(row.dataset.status).toBe("confirmed");
    // The updated recommendation is kept as the original under the wording.
    expect(row.textContent).toMatch(/two accessible meeting places/);
    expect(JSON.stringify(state())).toBe(before);
  });
});

describe("Library regression: saved work and destination", () => {
  it("discovers a completed 30-day contact task after remount and offers an explicit follow-up", async () => {
    goTo("/tasks/?draft=HP-C01");
    const first = mount(<TasksPage />);
    const d = await waitFor(() => {
      expect(field(dialog(), "Task").value).toBe(
        "Keep an offline contact plan",
      );
      return dialog();
    });
    fireEvent.change(field(d, "Milestone"), { target: { value: "30d" } });
    fireEvent.change(field(d, "Status"), { target: { value: "complete" } });
    fireEvent.click(within(d).getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(params().get("draft")).toBeNull());
    first.unmount();
    goTo("/tasks/?draft=HP-C01");
    mount(<TasksPage />);
    const existing = await screen.findByRole("link", {
      name: "View existing task",
    });
    expect(dialog().textContent).toMatch(/Complete.*30 days/);
    expect(
      within(dialog()).queryByRole("button", { name: "Create task" }),
    ).toBeNull();
    fireEvent.click(
      within(dialog()).getByRole("button", { name: "Add another task" }),
    );
    const count = tasks().length;
    fireEvent.click(
      within(dialog()).getByRole("button", { name: "Create task" }),
    );
    await screen.findByText(/An identical task/);
    expect(tasks()).toHaveLength(count);
    expect(existing).toBeTruthy();
  });

  it("retains every goal field and saves at 30 days in Communications", async () => {
    goTo("/goals/?milestone=72h&goal=comms&draft=HP-C04");
    mount(<GoalsPage />);
    const form = await screen.findByRole("form", { name: "New goal" });
    fireEvent.change(field(form, "Goal title"), {
      target: { value: "Our school pickup check-in" },
    });
    fireEvent.change(field(form, "Description (optional)"), {
      target: { value: "Everyone receives the practice message" },
    });
    fireEvent.change(field(form, "Notes (optional)"), {
      target: { value: "Use our backup contacts" },
    });
    fireEvent.change(field(form, "Linked task (optional)"), {
      target: { value: "seed72-lighting-comms" },
    });
    fireEvent.change(field(form, "Completed by"), {
      target: { value: "task" },
    });
    fireEvent.change(screen.getByLabelText("Milestone"), {
      target: { value: "30d" },
    });
    expect(field(form, "Goal title").value).toBe("Our school pickup check-in");
    expect(field(form, "Description (optional)").value).toBe(
      "Everyone receives the practice message",
    );
    expect(field(form, "Notes (optional)").value).toBe(
      "Use our backup contacts",
    );
    expect(field(form, "Linked task (optional)").value).toBe(
      "seed72-lighting-comms",
    );
    expect(field(form, "Completed by").value).toBe("task");
    expect(
      within(form).getByRole("option", {
        name: "Verify emergency lighting and communications",
      }),
    ).toBeTruthy();
    fireEvent.click(within(form).getByRole("button", { name: "Save goal" }));
    await waitFor(() =>
      expect(
        Object.values(state()).some(
          (r) => r.custom?.libraryEntryId === "HP-C04",
        ),
      ).toBe(true),
    );
    const rec = Object.values(state()).find(
      (r) => r.custom?.libraryEntryId === "HP-C04",
    )!;
    expect(rec.custom).toMatchObject({
      milestone: "30d",
      goal: "library-communications",
      title: "Our school pickup check-in",
      taskId: "seed72-lighting-comms",
      method: "task",
    });
  });
});

describe("Signed-in Library recognition", () => {
  it("shows a legacy completed task with saved details without writing household data", async () => {
    const { LibraryView } = await import("@/components/library/LibraryView");
    fakeDb.set("households/h1/tasks/legacy-card-task", {
      title: "Our saved contact card",
      notes: "Source: /library/?entry=HP-C01",
      category: "Communications",
      milestone: "30d",
      status: "complete",
      priority: 2,
    });
    const before = snapshot();
    goTo("/library/?entry=HP-C01");
    mount(<LibraryView />);
    const link = await screen.findByRole("link", {
      name: "View existing task",
    });
    expect(link.getAttribute("href")).toBe("/tasks/?task=legacy-card-task");
    expect(dialog().textContent).toMatch(
      /Our saved contact card.*Complete.*30/,
    );
    expect(
      within(dialog()).getByRole("link", { name: "Add another task" }),
    ).toBeTruthy();
    expect(snapshot()).toBe(before);
  });
});

describe("Revised Library category destinations", () => {
  it.each([
    ["HP-H02", "7d", "library-shelter", "Shelter"],
    ["HP-C04", "30d", "library-communications", "Communications"],
  ])(
    "saves %s at %s and reopens in %s after refresh",
    async (cardId, milestone, destination, label) => {
      goTo("/goals/?milestone=72h&draft=" + cardId);
      const first = mount(<GoalsPage />);
      const form = await screen.findByRole("form", { name: "New goal" });
      const title = field(form, "Goal title").value;
      const before = snapshot();
      fireEvent.change(screen.getByLabelText("Milestone"), {
        target: { value: milestone },
      });
      expect(snapshot()).toBe(before);
      expect(field(form, "Goal title").value).toBe(title);
      expect(
        screen.getByText(
          "Destination: " +
            label +
            " - " +
            (milestone === "7d" ? "7 days" : "30 days"),
        ),
      ).toBeTruthy();
      fireEvent.submit(form);
      fireEvent.submit(form);
      await waitFor(() => expect(params().get("draft")).toBeNull());
      const entries = Object.entries(state()).filter(
        ([, r]) => r.custom?.libraryEntryId === cardId,
      );
      expect(entries).toHaveLength(1);
      const [id, record] = entries[0];
      expect(record.custom).toMatchObject({
        title,
        milestone,
        goal: destination,
      });
      expect(record.confirmed).toBeUndefined();
      expect(Object.keys(household().goalDestinations!)).toEqual([
        milestone + ":" + destination,
      ]);
      expect(params().get("goal")).toBe(destination);
      first.unmount();
      mount(<GoalsPage />);
      const row = await screen.findByTestId("requirement-" + id);
      expect(row.textContent).toContain(title);
      expect(row.dataset.status).toBe("not-started");
      expect(screen.getByRole("heading", { name: label })).toBeTruthy();
      expect(
        within(row)
          .getByRole("link", { name: "open it in the Library" })
          .getAttribute("href"),
      ).toBe("/library/?entry=" + cardId);
    },
  );

  it("creates no destination on draft, milestone switch or cancel", async () => {
    goTo("/goals/?milestone=72h&draft=HP-H02");
    mount(<GoalsPage />);
    const form = await screen.findByRole("form", { name: "New goal" });
    const before = snapshot();
    for (const milestone of ["7d", "30d", "60d", "90d"])
      fireEvent.change(screen.getByLabelText("Milestone"), {
        target: { value: milestone },
      });
    fireEvent.click(within(form).getByRole("button", { name: "Cancel" }));
    expect(snapshot()).toBe(before);
    expect(household().goalDestinations).toBeUndefined();
  });
});

describe("Task link selection", () => {
  it("reveals, focuses and highlights the exact completed 30-day row through filters and refresh", async () => {
    fakeDb.set("households/h1/tasks/contact-30", {
      title: "Our saved offline contacts",
      notes: "Saved",
      milestone: "30d",
      category: "Communications",
      status: "complete",
      priority: 2,
    });
    fakeDb.set("households/h2/tasks/contact-30", {
      title: "Another household secret",
      milestone: "30d",
      status: "complete",
    });
    goTo("/tasks/?milestone=72h&complete=hide&task=contact-30");
    const scroll = vi.fn();
    const previous = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      const first = mount(<TasksPage />);
      const button = await screen.findByRole("button", {
        name: /Our saved offline contacts/,
      });
      await waitFor(() => expect(document.activeElement).toBe(button));
      expect(scroll).toHaveBeenCalled();
      expect(button.closest("li")?.dataset.highlighted).toBe("true");
      expect(button.closest("li")?.dataset.taskId).toBe("contact-30");
      expect(button.tagName).toBe("BUTTON"); // native Enter/Space activation
      expect(
        (screen.getByLabelText("Milestone") as HTMLSelectElement).value,
      ).toBe("72h");
      expect(
        (screen.getByLabelText("Show complete") as HTMLInputElement).checked,
      ).toBe(false);
      expect(screen.queryByText("Another household secret")).toBeNull();
      fireEvent.click(button);
      expect(field(dialog(), "Task").value).toBe("Our saved offline contacts");
      fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(document.activeElement).toBe(button));
      first.unmount();
      mount(<TasksPage />);
      const restored = await screen.findByRole("button", {
        name: /Our saved offline contacts/,
      });
      await waitFor(() => expect(document.activeElement).toBe(restored));
      expect(restored.closest("li")?.dataset.highlighted).toBe("true");
    } finally {
      HTMLElement.prototype.scrollIntoView = previous;
    }
  });

  it("shows a generic message for an unavailable task without reading another household", async () => {
    fakeDb.set("households/h2/tasks/foreign", {
      title: "Private foreign task",
    });
    goTo("/tasks/?task=foreign");
    mount(<TasksPage />);
    await screen.findByText("That task is unavailable in this household.");
    expect(screen.queryByText("Private foreign task")).toBeNull();
  });
});
