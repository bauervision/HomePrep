// @vitest-environment jsdom
/*
 * The Goals workspace on the real Goals, Tasks, Inventory and Dashboard
 * pages, backed by the in-memory Firestore. Nothing here touches production.
 */
import type { User } from "firebase/auth";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
const { default: DashboardPage } = await import("@/app/page");
const { default: GoalsPage } = await import("@/app/goals/page");
const { default: TasksPage } = await import("@/app/tasks/page");
const { default: InventoryPage } = await import("@/app/inventory/page");
const { seedHousehold } = await import("@/lib/seed");
const { db } = await import("@/lib/firebase");
const { confirmedState } = await import("@/test/requirement-state");

type SessionState = import("@/components/SessionProvider").SessionState;
type Household = import("@/lib/types").Household;
type RequirementState = import("@/lib/types").RequirementState;
type Task = import("@/lib/types").Task;

/** Session whose household document is read live, like SessionProvider. */
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
      role: "owner",
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
const set = (el: HTMLElement, value: string) =>
  fireEvent.change(el, { target: { value } });
const state = () =>
  ((fakeDb.get("households/h1") as unknown as Household).requirementState ??
    {}) as RequirementState;
const setState = (requirementState: RequirementState) =>
  fakeDb.set("households/h1", {
    ...(fakeDb.get("households/h1") as object),
    requirementState,
  });
const task = (id: string) =>
  fakeDb.get(`households/h1/tasks/${id}`) as unknown as Task;
const row = (id: string) => screen.getByTestId(`requirement-${id}`);
const toggleOf = (id: string) =>
  document.getElementById(`req-toggle-${id}`) as HTMLButtonElement;
const expand = (id: string) => fireEvent.click(toggleOf(id));
const detail = () => screen.getByTestId("goal-detail");
const tally = () => screen.getByTestId("requirement-tally").textContent;
const goalBadge = () =>
  within(detail().parentElement!.parentElement!).getAllByText(
    /^(Met|Open|Needs review)$/,
  )[0].textContent;
/** Rows counted toward progress (core list), excluding not-applicable ones. */
const countedRows = () =>
  within(screen.getByRole("list", { name: "Counted requirements" }))
    .getAllByRole("listitem")
    .filter((li) => li.dataset.testid?.startsWith("requirement-"))
    .filter((li) => li.dataset.status !== "not-applicable");
const planButton = () =>
  within(screen.getByTestId("goal-progress")).getByRole("button");
const openGoal = async (url: string) => {
  goTo(url);
  const view = mount(<GoalsPage />);
  await screen.findByTestId("requirements");
  return view;
};

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
  goTo("/");
  fakeDb.reset();
  window.localStorage.clear();
  fakeDb.set("households/h1", {
    name: "Bauer",
    ownerUid: "u1",
    householdSize: 5,
    adults: 2,
    children: 3,
    profileVersion: 1,
  });
  fakeDb.set("households/h2", {
    name: "Other",
    ownerUid: "u2",
    householdSize: 2,
  });
  await seedHousehold("h1");
  fakeDb.set("households/h1/inventory/tp", {
    name: "Toilet paper",
    category: "Sanitation",
    quantity: 30,
    unit: "pack",
    contains: { amount: 8, unit: "roll" },
    location: "",
    expiresOn: null,
    notes: "",
  });
  fakeDb.set("households/h1/inventory/kit", {
    name: "First aid kit",
    category: "Medical",
    quantity: 1,
    unit: "kit",
    location: "",
    expiresOn: null,
    notes: "",
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("every requirement is shown", () => {
  it("shows all five Cooking requirements with a Start Plan action", async () => {
    await openGoal("/goals/?milestone=7d&goal=cooking");
    for (const id of [
      "7d.cooking.no-cook",
      "7d.cooking.method",
      "7d.cooking.outdoors",
      "7d.cooking.co-alarm",
      "7d.cooking.fuel",
    ])
      expect(row(id)).toBeTruthy();
    expect(tally()).toBe("0 of 5 done");
    expect(countedRows()).toHaveLength(5);
    expect(planButton().textContent).toBe("Start Plan");
    expect(screen.getByText("Your Preparedness Goals")).toBeTruthy();
    // No "+N more" summary stands in for the list.
    expect(detail().textContent).not.toMatch(/\+\d+ more/);
    // "+ New Goal" closes the list.
    const section = screen.getByTestId("requirements");
    const buttons = within(section).getAllByRole("button");
    expect(buttons.at(-1)!.textContent).toBe("New Goal");
  });

  it("shows all three Sanitation requirements with sources", async () => {
    await openGoal("/goals/?milestone=72h&goal=sanitation");
    expect(row("72h.sanitation.supplies")).toBeTruthy();
    expect(row("72h.sanitation.hygiene")).toBeTruthy();
    expect(row("72h.sanitation.toilet")).toBeTruthy();
    expect(tally()).toBe("0 of 3 done");
    expect(countedRows()).toHaveLength(3);
    // 240 rolls recorded: the goal needs review, it is not met.
    expect(goalBadge()).toBe("Needs review");
    expect(planButton().textContent).toBe("Review Requirements");
    expect(screen.getByRole("note").textContent).toMatch(
      /Previously met by recorded Sanitation items/,
    );

    expand("72h.sanitation.supplies");
    const r = row("72h.sanitation.supplies");
    expect(
      within(r).getByText(/Toilet paper alone does not cover this/),
    ).toBeTruthy();
    expect(within(r).getByText(/Official guidance · 1 source/)).toBeTruthy();
    const src = within(r).getByRole("link", {
      name: "FEMA / Ready.gov: Build A Kit",
    });
    expect(src.getAttribute("href")).toBe("https://www.ready.gov/kit");
    expect(src.getAttribute("rel")).toContain("noopener");
    expect(within(r).getByText(/category alone doesn’t count/)).toBeTruthy();
  });

  it("keeps the denominator equal to the counted rows shown", async () => {
    for (const url of [
      "/goals/?milestone=72h&goal=medical",
      "/goals/?milestone=72h&goal=plan",
      "/goals/?milestone=7d&goal=hygiene",
      "/goals/?milestone=7d&goal=meds",
      "/goals/?milestone=72h&goal=water",
    ]) {
      const view = await openGoal(url);
      const n = Number(tally()!.match(/of (\d+)/)![1]);
      expect([url, countedRows().length]).toEqual([url, n]);
      view.unmount();
    }
  });
});

describe("guided plan action", () => {
  it("Start Plan opens and focuses the first open requirement", async () => {
    await openGoal("/goals/?milestone=7d&goal=cooking");
    expect(toggleOf("7d.cooking.no-cook").getAttribute("aria-expanded")).toBe(
      "false",
    );
    fireEvent.click(planButton());
    await waitFor(() =>
      expect(document.activeElement).toBe(toggleOf("7d.cooking.no-cook")),
    );
    expect(toggleOf("7d.cooking.no-cook").getAttribute("aria-expanded")).toBe(
      "true",
    );
    // Its action is exposed, and the user stays in Goals.
    expect(
      within(row("7d.cooking.no-cook")).getByText(
        /no-cook meals, then confirm/,
      ),
    ).toBeTruthy();
    expect(window.location.pathname).toBe("/goals/");
  });

  it("Continue Plan moves on to the next open requirement", async () => {
    await openGoal("/goals/?milestone=7d&goal=cooking");
    fireEvent.click(
      within(row("7d.cooking.no-cook")).getByRole("checkbox", {
        name: "Household confirms: No-cook meal option",
      }),
    );
    await waitFor(() => expect(planButton().textContent).toBe("Continue Plan"));
    expect(tally()).toBe("1 of 5 done");
    fireEvent.click(planButton());
    await waitFor(() =>
      expect(document.activeElement).toBe(toggleOf("7d.cooking.method")),
    );
  });

  it("Review Plan opens every requirement of a complete goal", async () => {
    setState(confirmedState(["72h"]));
    await openGoal("/goals/?milestone=72h&goal=plan");
    expect(planButton().textContent).toBe("Review Plan");
    fireEvent.click(planButton());
    await waitFor(() =>
      expect(document.activeElement?.id).toBe("goal-requirements"),
    );
    for (const b of screen
      .getAllByRole("button")
      .filter((x) => x.id.startsWith("req-toggle-")))
      expect(b.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("household goals CRUD", () => {
  it("persists attestation as household-confirmed and survives a refresh", async () => {
    const view = await openGoal("/goals/?milestone=72h&goal=plan");
    const box = within(row("72h.plan.meeting")).getByRole("checkbox", {
      name: "Household confirms: Household meeting place",
    });
    fireEvent.click(box);
    await waitFor(() =>
      expect(state()["72h.plan.meeting"]?.confirmed).toMatchObject({
        by: "Alex",
      }),
    );
    await waitFor(() =>
      expect(
        within(row("72h.plan.meeting")).getByText("Household confirmed"),
      ).toBeTruthy(),
    );
    expect(tally()).toBe("1 of 4 done");
    expect(screen.getByTestId("goal-progress").textContent).toContain(
      "1 household-confirmed",
    );

    view.unmount();
    await openGoal("/goals/?milestone=72h&goal=plan");
    expect(
      (
        within(row("72h.plan.meeting")).getByRole(
          "checkbox",
        ) as HTMLInputElement
      ).checked,
    ).toBe(true);
    // Only this household's document changed.
    expect(
      (fakeDb.get("households/h2") as unknown as Household).requirementState,
    ).toBeUndefined();
  });

  it("creates, edits and deletes a household goal in place", async () => {
    await openGoal("/goals/?milestone=72h&goal=comms");
    expect(tally()).toBe("0 of 3 done");
    fireEvent.click(screen.getByRole("button", { name: "New Goal" }));
    // Goal and milestone come from context; only the goal itself is asked for.
    expect(screen.queryByLabelText("Milestone")).toBeTruthy(); // page selector
    expect(
      within(screen.getByRole("form", { name: "New goal" })).queryByLabelText(
        /Milestone|Category/,
      ),
    ).toBeNull();
    const form = screen.getByRole("form", { name: "New goal" });
    set(within(form).getByLabelText("Goal title"), "Charge the two-way radios");
    set(within(form).getByLabelText("Notes (optional)"), "Batteries in drawer");
    set(within(form).getByLabelText("Linked inventory item (optional)"), "kit");
    fireEvent.click(within(form).getByRole("button", { name: "Save goal" }));
    await waitFor(() =>
      expect(
        Object.keys(state()).filter((k) => k.startsWith("custom-")),
      ).toHaveLength(1),
    );
    const id = Object.keys(state()).find((k) => k.startsWith("custom-"))!;
    expect(state()[id]).toMatchObject({
      custom: {
        milestone: "72h",
        goal: "comms",
        title: "Charge the two-way radios",
      },
      notes: "Batteries in drawer",
      inventoryIds: ["kit"],
    });
    // Appears at once, counts toward progress, and the user stays here.
    await waitFor(() => expect(row(id)).toBeTruthy());
    expect(within(row(id)).getByText("Custom")).toBeTruthy();
    expect(tally()).toBe("1 of 4 done");
    expect(window.location.search).toBe("?milestone=72h&goal=comms");

    expand(id);
    expect(within(row(id)).getByText("Batteries in drawer")).toBeTruthy();
    fireEvent.click(within(row(id)).getByRole("button", { name: "Edit" }));
    set(
      within(row(id)).getByLabelText("Goal title"),
      "Charge both two-way radios",
    );
    fireEvent.click(within(row(id)).getByRole("button", { name: "Save goal" }));
    await waitFor(() =>
      expect(state()[id]?.custom?.title).toBe("Charge both two-way radios"),
    );
    expect(state()[id].inventoryIds).toEqual(["kit"]); // links kept

    const ask = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(within(row(id)).getByRole("button", { name: "Delete" }));
    expect(ask).toHaveBeenCalledWith(
      'Delete goal "Charge both two-way radios"?',
    );
    expect(state()[id]).toBeTruthy();
    ask.mockReturnValueOnce(true);
    fireEvent.click(within(row(id)).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(state()[id]).toBeUndefined());
    await waitFor(() => expect(tally()).toBe("0 of 3 done"));
    // Inventory is never touched by goals.
    expect(fakeDb.list("households/h1/inventory")).toHaveLength(2);
  });

  it("completes a task-linked household goal only through its task", async () => {
    await openGoal("/goals/?milestone=7d&goal=cooking");
    fireEvent.click(screen.getByRole("button", { name: "New Goal" }));
    const form = screen.getByRole("form", { name: "New goal" });
    set(within(form).getByLabelText("Goal title"), "Practice with the stove");
    set(
      within(form).getByLabelText("Linked task (optional)"),
      "seed7d-cooking",
    );
    set(within(form).getByLabelText("Completed by"), "task");
    fireEvent.click(within(form).getByRole("button", { name: "Save goal" }));
    const id = await waitFor(() => {
      const k = Object.keys(state()).find((x) => x.startsWith("custom-"));
      expect(k).toBeTruthy();
      return k!;
    });
    expect(state()[id].custom).toMatchObject({
      taskId: "seed7d-cooking",
      method: "task",
    });
    await waitFor(() => expect(row(id)).toBeTruthy());
    // No checkbox can bypass the task.
    expect(within(row(id)).queryByRole("checkbox")).toBeNull();

    await act(async () => {
      fakeDb.set("households/h1/tasks/seed7d-cooking", {
        ...task("seed7d-cooking"),
        status: "complete",
      });
    });
    await waitFor(() =>
      expect(within(row(id)).getByText("Evidence supported")).toBeTruthy(),
    );
  });

  it("customizes a recommendation, keeps the original, and restores the default", async () => {
    await openGoal("/goals/?milestone=72h&goal=plan");
    expand("72h.plan.meeting");
    fireEvent.click(
      within(row("72h.plan.meeting")).getByRole("button", {
        name: "Customize",
      }),
    );
    set(
      within(row("72h.plan.meeting")).getByLabelText("Goal title"),
      "Meet at the library",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save wording" }));
    await waitFor(() =>
      expect(state()["72h.plan.meeting"]?.text).toEqual({
        title: "Meet at the library",
      }),
    );
    const r = await waitFor(() => {
      const el = row("72h.plan.meeting");
      expect(within(el).getByText("Meet at the library")).toBeTruthy();
      return el;
    });
    expect(within(r).getByText("Original recommendation")).toBeTruthy();
    expect(within(r).getByText("Household meeting place")).toBeTruthy();
    // Only this household's wording changed.
    expect(
      (fakeDb.get("households/h2") as unknown as Household).requirementState,
    ).toBeUndefined();
    fireEvent.click(within(r).getByRole("button", { name: "Restore default" }));
    await waitFor(() => expect(state()["72h.plan.meeting"]).toBeUndefined());
  });

  it("marks a conditional recommendation not applicable, then restores it", async () => {
    await openGoal("/goals/?milestone=72h&goal=medical");
    expect(tally()).toBe("0 of 4 done");
    expand("72h.medical.power");
    fireEvent.click(
      within(row("72h.medical.power")).getByRole("button", {
        name: "Not applicable",
      }),
    );
    set(screen.getByLabelText("Reason (optional)"), "No powered devices");
    fireEvent.click(
      screen.getByRole("button", { name: "Mark not applicable" }),
    );
    await waitFor(() =>
      expect(state()["72h.medical.power"]?.notApplicable).toMatchObject({
        reason: "No powered devices",
      }),
    );
    await waitFor(() => expect(tally()).toBe("0 of 3 done"));
    expect(countedRows()).toHaveLength(3);
    // Core guidance offers no "Not applicable" control.
    expand("72h.medical.info");
    expect(
      within(row("72h.medical.info")).queryByRole("button", {
        name: "Not applicable",
      }),
    ).toBeNull();

    fireEvent.click(
      within(row("72h.medical.power")).getByRole("button", { name: "Restore" }),
    );
    await waitFor(() => expect(state()["72h.medical.power"]).toBeUndefined());
  });

  it("protects safety guidance from dismissal and rewording", async () => {
    await openGoal("/goals/?milestone=7d&goal=cooking");
    expand("7d.cooking.outdoors");
    const r = row("7d.cooking.outdoors");
    expect(within(r).getByText("Safety")).toBeTruthy();
    expect(within(r).getByText(/Never use charcoal grills/)).toBeTruthy();
    expect(
      within(r).queryByRole("button", { name: "Not applicable" }),
    ).toBeNull();
    expect(within(r).queryByRole("button", { name: "Customize" })).toBeNull();
    expect(within(r).getByText(/can’t be marked not applicable/)).toBeTruthy();
  });
});

describe("evidence", () => {
  it("links an inventory item as evidence", async () => {
    await openGoal("/goals/?milestone=72h&goal=medical");
    expand("72h.medical.first-aid");
    set(
      within(row("72h.medical.first-aid")).getByLabelText(
        "Link an inventory item to First aid kit",
      ),
      "kit",
    );
    await waitFor(() =>
      expect(state()["72h.medical.first-aid"]?.inventoryIds).toEqual(["kit"]),
    );
    await waitFor(() =>
      expect(
        within(row("72h.medical.first-aid")).getByText("Evidence supported"),
      ).toBeTruthy(),
    );
    // A first aid kit does not establish medication continuity.
    expect(
      within(row("72h.medical.medications")).getByText("Not started"),
    ).toBeTruthy();
    fireEvent.click(
      within(row("72h.medical.first-aid")).getByRole("button", {
        name: "Unlink First aid kit",
      }),
    );
    await waitFor(() =>
      expect(state()["72h.medical.first-aid"]).toBeUndefined(),
    );
    expect(fakeDb.list("households/h1/inventory")).toHaveLength(2);
  });

  it("recalculates when a linked item is used up", async () => {
    setState({
      "72h.medical.first-aid": {
        inventoryIds: ["kit"],
        updatedAt: "2026-10-31T00:00:00.000Z",
      },
    });
    await openGoal("/goals/?milestone=72h&goal=medical");
    expect(
      within(row("72h.medical.first-aid")).getByText("Evidence supported"),
    ).toBeTruthy();
    await act(async () => {
      fakeDb.set("households/h1/inventory/kit", {
        ...(fakeDb.get("households/h1/inventory/kit") as object),
        quantity: 0,
      });
    });
    await waitFor(() =>
      expect(
        within(row("72h.medical.first-aid")).getByText("Needs review"),
      ).toBeTruthy(),
    );
  });
});

describe("tasks in context", () => {
  it("edits and completes a related task without leaving Goals", async () => {
    await openGoal("/goals/?milestone=7d&goal=cooking");
    const before = fakeDb.list("households/h1/tasks").length;
    const original = task("seed7d-cooking");
    fireEvent.click(screen.getByRole("button", { name: original.title }));
    let d = await screen.findByRole("dialog");
    // Category and milestone are kept as they are; no delete here.
    expect(within(d).queryByLabelText("Category")).toBeNull();
    expect(within(d).queryByLabelText("Milestone")).toBeNull();
    expect(within(d).queryByRole("button", { name: "Delete" })).toBeNull();
    set(within(d).getByLabelText("Task"), "Set up the camp stove outside");
    set(within(d).getByLabelText("Notes"), "Check the propane");
    set(within(d).getByLabelText("Priority"), "1");
    set(within(d).getByLabelText("Status"), "in_progress");
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Save" }));
    });
    expect(task("seed7d-cooking")).toMatchObject({
      title: "Set up the camp stove outside",
      notes: "Check the propane",
      priority: 1,
      status: "in_progress",
      category: original.category,
      milestone: "7d",
      seedKey: "7d:cooking",
    });
    expect(fakeDb.list("households/h1/tasks")).toHaveLength(before);
    await waitFor(() =>
      expect(
        within(row("7d.cooking.method")).getByText("In progress"),
      ).toBeTruthy(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Set up the camp stove outside" }),
    );
    d = await screen.findByRole("dialog");
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Complete task" }));
    });
    expect(task("seed7d-cooking").status).toBe("complete");
    await waitFor(() =>
      expect(
        within(row("7d.cooking.method")).getByText("Evidence supported"),
      ).toBeTruthy(),
    );
    // Only the requirement that uses this task changed.
    expect(
      within(row("7d.cooking.no-cook")).getByText("Not started"),
    ).toBeTruthy();
    expect(state()).toEqual({});
    expect(fakeDb.list("households/h1/tasks")).toHaveLength(before);
    expect(window.location.pathname).toBe("/goals/");
  });

  it("shows the same task change on the Tasks page", async () => {
    const view = await openGoal("/goals/?milestone=7d&goal=cooking");
    fireEvent.click(
      screen.getByRole("button", { name: task("seed7d-cooking").title }),
    );
    const d = await screen.findByRole("dialog");
    set(within(d).getByLabelText("Task"), "Cook outdoors plan");
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Save" }));
    });
    view.unmount();
    goTo("/tasks/");
    mount(<TasksPage />);
    expect(await screen.findByText("Cook outdoors plan")).toBeTruthy();
  });
});

describe("inventory in context", () => {
  it("adds an item preset to the goal's category without linking it", async () => {
    await openGoal("/goals/?milestone=72h&goal=sanitation");
    fireEvent.click(
      screen.getByRole("button", { name: "Add Sanitation Item" }),
    );
    const d = await screen.findByRole("dialog");
    expect(
      (within(d).getByLabelText("Category") as HTMLSelectElement).value,
    ).toBe("Sanitation");
    set(within(d).getByLabelText("Name"), "Heavy-duty bags");
    set(within(d).getByLabelText("Quantity"), "2");
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Add item" }));
    });
    const items = fakeDb.list("households/h1/inventory") as unknown as {
      name: string;
      category: string;
    }[];
    expect(items.filter((i) => i.name === "Heavy-duty bags")).toEqual([
      expect.objectContaining({ category: "Sanitation" }),
    ]);
    // Adding stock never completes a requirement by itself.
    expect(state()).toEqual({});
    expect(window.location.search).toBe("?milestone=72h&goal=sanitation");
  });

  it("uses the requirement category mapping for Cooking (CO detectors)", async () => {
    await openGoal("/goals/?milestone=7d&goal=cooking");
    expect(
      screen
        .getByRole("link", { name: "View Safety Inventory" })
        .getAttribute("href"),
    ).toBe(
      "/inventory/?category=Safety&from=%2Fgoals%2F%3Fmilestone%3D7d%26goal%3Dcooking",
    );
  });

  it("returns from filtered inventory to the same goal", async () => {
    goTo(
      "/inventory/?category=Medical&from=%2Fgoals%2F%3Fmilestone%3D72h%26goal%3Dmedical",
    );
    const view = mount(<InventoryPage />);
    const back = await screen.findByRole("link", { name: "Back to goal" });
    expect(back.getAttribute("href")).toBe(
      "/goals/?milestone=72h&goal=medical",
    );
    view.unmount();
    // Only in-app goal links are offered.
    goTo("/inventory/?from=https%3A%2F%2Fevil.example%2F");
    mount(<InventoryPage />);
    await screen.findByText(/items recorded/);
    expect(screen.queryByRole("link", { name: "Back to goal" })).toBeNull();
  });
});

describe("resume and mobile selection", () => {
  it("reopens the last goal viewed for the milestone", async () => {
    const view = await openGoal("/goals/?milestone=7d&goal=hygiene");
    view.unmount();
    await openGoal("/goals/?milestone=7d");
    expect(row("7d.hygiene.supplies")).toBeTruthy();
  });

  it("opens the first open goal when none was viewed", async () => {
    await openGoal("/goals/?milestone=72h");
    expect(screen.getByTestId("goal-detail")).toBeTruthy();
    expect((screen.getByLabelText("Goal") as HTMLSelectElement).value).toBe(
      "water",
    );
  });

  it("offers a compact goal picker instead of the long list on phones", async () => {
    await openGoal("/goals/?milestone=7d&goal=cooking");
    const nav = screen.getByRole("navigation", { name: "Goals" });
    expect(nav.closest("section")!.className).toMatch(/\bhidden lg:block\b/);
    const picker = screen.getByLabelText("Goal") as HTMLSelectElement;
    expect(picker.closest(".lg\\:hidden")).toBeTruthy();
    expect(Array.from(picker.options).map((o) => o.textContent)).toContain(
      "Cooking without power · 0 / 5 done",
    );
    set(picker, "hygiene");
    expect(window.location.search).toBe("?milestone=7d&goal=hygiene");
    await waitFor(() => expect(row("7d.hygiene.supplies")).toBeTruthy());
  });
});

describe("water and food", () => {
  it("keeps the water target as its counted requirement", async () => {
    fakeDb.set("households/h1/inventory/jugs", {
      name: "Water jugs",
      category: "Water",
      quantity: 15,
      unit: "gal",
      location: "",
      expiresOn: null,
      notes: "",
    });
    await openGoal("/goals/?milestone=72h&goal=water");
    // The quantity requirement is the one counted row, open by default.
    expect(countedRows().map((r) => r.dataset.testid)).toEqual([
      "requirement-water.supply",
    ]);
    expect(toggleOf("water.supply").getAttribute("aria-expanded")).toBe("true");
    expect(within(row("water.supply")).queryByRole("checkbox")).toBeNull();
    expect(screen.getByText("Recommended baseline")).toBeTruthy();
    expect(screen.getByLabelText(/Custom household target/)).toBeTruthy();
    expect(within(row("water.supply")).getByText("15 / 15 gal")).toBeTruthy();
    expect(tally()).toBe("1 of 1 done");
    expect(row("water.storage")).toBeTruthy();
    expect(screen.getByText(/not counted\s+toward progress/)).toBeTruthy();
    expect(goalBadge()).toBe("Met");
    expect(planButton().textContent).toBe("Review Plan");
  });
});

describe("dashboard and goals agree", () => {
  it("shows the same status and counts for every 72-hour goal", async () => {
    setState({
      "72h.plan.meeting": {
        confirmed: { by: "A", at: "2026-10-31T00:00:00.000Z" },
        updatedAt: "2026-10-31T00:00:00.000Z",
      },
    });
    const dash = mount(<DashboardPage />);
    await screen.findByTestId("essential-water");
    const keys = [
      "water",
      "food",
      "medical",
      "power",
      "comms",
      "sanitation",
      "plan",
    ];
    const onDashboard = Object.fromEntries(
      keys.map((k) => [
        k,
        {
          label: within(screen.getByTestId(`essential-${k}`))
            .getByRole("img")
            .getAttribute("aria-label"),
          text: screen.getByTestId(`essential-${k}`).textContent,
        },
      ]),
    );
    expect(onDashboard.medical.label).toBe("Needs review");
    expect(onDashboard.sanitation.label).toBe("Needs review");
    expect(onDashboard.power.label).toBe("Not met");
    expect(onDashboard.plan.text).toContain("1 / 4 done");
    dash.unmount();

    for (const k of keys) {
      const v = await openGoal(`/goals/?milestone=72h&goal=${k}`);
      const label = goalBadge();
      const expected =
        onDashboard[k].label === "Not met" ? "Open" : onDashboard[k].label;
      expect([k, label]).toEqual([k, expected]);
      if (!["water", "food"].includes(k)) {
        const [, done, of] = tally()!.match(/^(\d+) of (\d+)/)!;
        const option = Array.from(
          (screen.getByLabelText("Goal") as HTMLSelectElement).options,
        ).find((o) => o.value === k)!.textContent!;
        if (expected !== "Needs review")
          expect(option).toContain(`${done} / ${of} done`);
      }
      v.unmount();
    }
  });
});
