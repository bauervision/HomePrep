// @vitest-environment jsdom
/*
 * Household-aware goals, dashboard deep links, category-preset inventory
 * creation and the version label, on the real pages backed by the in-memory
 * Firestore. Nothing here touches production Firestore.
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
const { SignIn, TopBar } = await import("@/components/AppShell");
const { default: DashboardPage } = await import("@/app/page");
const { default: InventoryPage } = await import("@/app/inventory/page");
const { default: GoalsPage } = await import("@/app/goals/page");
const { default: TasksPage } = await import("@/app/tasks/page");
const { seedHousehold } = await import("@/lib/seed");
const { db } = await import("@/lib/firebase");

type SessionState = import("@/components/SessionProvider").SessionState;
type Household = import("@/lib/types").Household;

const pkgVersion: string = (await import("../../package.json")).version;

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
    displayName: "u1",
  } as unknown as User;
  const state: SessionState = {
    status: "ready",
    user,
    household,
    member: {
      uid: "u1",
      displayName: "u1",
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
const dialog = () => screen.getByRole("dialog");
const set = (el: HTMLElement, value: string) =>
  fireEvent.change(el, { target: { value } });
const field = (root: HTMLElement, label: string | RegExp) =>
  within(root).getByLabelText(label) as HTMLInputElement | HTMLSelectElement;
const inventory = () =>
  fakeDb.list("households/h1/inventory") as Record<string, unknown>[];
const household = () => fakeDb.get("households/h1") as Record<string, unknown>;

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
  await seedHousehold("h1");
  fakeDb.set("households/h1/inventory/jugs", {
    name: "Water jugs",
    category: "Water",
    quantity: 8,
    unit: "gal",
    location: "",
    expiresOn: null,
    notes: "",
  });
  fakeDb.set("households/h1/inventory/straw", {
    name: "Water Straw",
    category: "Water",
    quantity: 1,
    unit: "each",
    location: "",
    expiresOn: null,
    notes: "",
  });
});
afterEach(cleanup);

describe("dashboard deep links", () => {
  it("links each essential, category and uncounted item to its destination", async () => {
    mount(<DashboardPage />);
    const water = await screen.findByTestId("essential-water");
    expect(water.getAttribute("href")).toBe("/goals/?milestone=72h&goal=water");
    expect(screen.getByTestId("essential-plan").getAttribute("href")).toBe(
      "/goals/?milestone=72h&goal=plan",
    );
    expect(
      screen
        .getByRole("link", { name: "Sanitation: 0 recorded items" })
        .getAttribute("href"),
    ).toBe("/inventory/?category=Sanitation");
    const warning = screen.getByTestId("unmeasured-warning");
    expect(
      within(warning)
        .getByRole("link", { name: "Fix Water Straw" })
        .getAttribute("href"),
    ).toBe("/inventory/?item=straw");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "5 people (2 adults, 3 children)",
    );
  });

  it("links priorities to the existing task editor", async () => {
    mount(<DashboardPage />);
    const list = await screen.findByRole("list", {
      name: "72 hours priorities",
    });
    const first = within(list).getAllByRole("link")[0];
    expect(first.getAttribute("href")).toMatch(/^\/tasks\/\?task=seed72-/);
  });
});

describe("inventory category deep links", () => {
  it("filters from the URL, survives refresh and follows back/forward", async () => {
    goTo("/inventory/?category=Water");
    const first = mount(<InventoryPage />);
    await screen.findByText("Water jugs");
    expect((screen.getByLabelText("Category") as HTMLSelectElement).value).toBe(
      "Water",
    );
    expect(screen.getByRole("button", { name: "Add Water item" })).toBeTruthy();

    // Refresh: a fresh mount on the same URL shows the same view.
    first.unmount();
    mount(<InventoryPage />);
    await screen.findByText("Water jugs");

    // Changing the filter updates the URL in place.
    set(screen.getByLabelText("Category"), "Food");
    expect(window.location.search).toBe("?category=Food");
    await screen.findByText(/No Food items recorded yet/);

    // Browser back/forward restore the filter from the URL.
    act(() => {
      window.history.pushState(null, "", "/inventory/?category=Water");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await screen.findByText("Water jugs");
    act(() => {
      goTo("/inventory/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect((screen.getByLabelText("Category") as HTMLSelectElement).value).toBe(
      "All",
    );
  });

  it("opens Add item preset to a zero-item category, which stays changeable", async () => {
    goTo("/inventory/?category=Sanitation&add=1");
    mount(<InventoryPage />);
    await screen.findByText(/No Sanitation items recorded yet/);
    const d = dialog();
    expect(field(d, "Category").value).toBe("Sanitation");
    expect(field(d, "Unit").value).toBe("each");

    set(field(d, "Name"), "Toilet paper");
    set(field(d, "Quantity"), "30");
    set(field(d, "Unit"), "pack");
    set(field(d, "Amount in one pack"), "8");
    set(field(d, "Unit inside one pack"), "roll");
    expect(within(d).getByTestId("quantity-total").textContent).toBe(
      "Total: 30 pack × 8 roll = 240 roll",
    );
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Add item" }));
    });
    expect(inventory().find((i) => i.name === "Toilet paper")).toMatchObject({
      category: "Sanitation",
      quantity: 30,
      unit: "pack",
      contains: { amount: 8, unit: "roll" },
    });
    // The one-shot add parameter is cleared; the filter remains.
    expect(window.location.search).toBe("?category=Sanitation");
    await screen.findByText("Toilet paper");
  });

  it("lets the preset category be changed before saving", async () => {
    goTo("/inventory/?category=Water&add=1");
    mount(<InventoryPage />);
    const d = await screen.findByRole("dialog");
    set(field(d, "Name"), "Rice");
    set(field(d, "Category"), "Food");
    expect(field(d, "Unit").value).toBe("meals");
    set(field(d, "Quantity"), "20");
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Add item" }));
    });
    expect(inventory().find((i) => i.name === "Rice")).toMatchObject({
      category: "Food",
      unit: "meals",
    });
  });

  it("confirms a newly reached target once and saves exactly one item", async () => {
    fakeDb.remove("households/h1/inventory/jugs");
    goTo("/inventory/?category=Water");
    mount(<InventoryPage />);
    await screen.findByText("Water Straw");
    fireEvent.click(screen.getByRole("button", { name: "Add Water item" }));
    const d = dialog();
    set(field(d, "Name"), "Bottled water");
    set(field(d, "Quantity"), "8");
    set(field(d, "Unit"), "case");
    set(field(d, "Amount in one case"), "40");
    const submit = within(d).getByRole("button", { name: "Add item" });
    await act(async () => {
      fireEvent.click(submit);
      fireEvent.click(submit); // a second, fast submit must not duplicate
    });
    expect(inventory().filter((i) => i.name === "Bottled water")).toHaveLength(
      1,
    );
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain(
      "72-hour water target reached. 40 gallons recorded; 15 gallons required.",
    );

    // Saving the unchanged record again reports nothing new.
    fireEvent.click(screen.getByRole("button", { name: "Bottled water" }));
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
    });
    expect(screen.queryByText(/target reached/)).toBeNull();
  });

  it("opens a record from an item deep link", async () => {
    goTo("/inventory/?item=straw");
    mount(<InventoryPage />);
    const d = await screen.findByRole("dialog");
    expect(field(d, "Name").value).toBe("Water Straw");
    // The record can be reclassified as equipment instead of being guessed.
    fireEvent.click(within(d).getByLabelText(/Equipment, not stored supply/));
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Save" }));
    });
    expect(inventory().find((i) => i.name === "Water Straw")).toMatchObject({
      readinessRole: "equipment",
      quantity: 1,
      unit: "each",
    });
    expect(window.location.search).toBe("");
  });
});

describe("goal detail", () => {
  it("shows baseline, target and contributions, and keeps custom targets across size changes", async () => {
    goTo("/goals/?milestone=72h&goal=water");
    mount(<GoalsPage />);
    const detail = await screen.findByTestId("goal-detail");
    expect(detail.textContent).toContain("15 gal");
    expect(detail.textContent).toContain("1 gal × 5 people × 3 days");
    expect(detail.textContent).toContain("Uses the recommendation");
    expect(within(detail).getByText("Water jugs")).toBeTruthy();
    expect(within(detail).getByText("Water Straw")).toBeTruthy(); // not counted
    // Inventory actions: add in place, or open the filtered inventory with a
    // way back to this goal.
    expect(
      within(detail).getByRole("button", { name: "Add Water Item" }),
    ).toBeTruthy();
    expect(
      within(detail)
        .getByRole("link", { name: "View Water Inventory" })
        .getAttribute("href"),
    ).toBe(
      "/inventory/?category=Water&from=%2Fgoals%2F%3Fmilestone%3D72h%26goal%3Dwater",
    );

    const before = JSON.stringify(inventory());
    set(within(detail).getByLabelText(/Custom household target/), "40");
    await act(async () => {
      fireEvent.click(
        within(detail).getByRole("button", { name: "Save target" }),
      );
    });
    expect(household().targetOverrides).toEqual({ "72h": { water: 40 } });
    await waitFor(() =>
      expect(screen.getByTestId("goal-detail").textContent).toContain(
        "Custom target",
      ),
    );

    // The household grows to 9: the recommendation follows, the target stays.
    await act(async () => {
      fakeDb.set("households/h1", {
        ...household(),
        adults: 2,
        children: 7,
        householdSize: 9,
      });
    });
    await waitFor(() =>
      expect(screen.getByTestId("goal-detail").textContent).toContain(
        "1 gal × 9 people × 3 days",
      ),
    );
    expect(screen.getByTestId("goal-detail").textContent).toContain("40 gal");
    expect(household().targetOverrides).toEqual({ "72h": { water: 40 } });

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Reset to recommended" }),
      );
    });
    expect(household().targetOverrides).toEqual({});
    await waitFor(() =>
      expect(screen.getByTestId("goal-detail").textContent).toContain(
        "Uses the recommendation",
      ),
    );
    expect(JSON.stringify(inventory())).toBe(before);
  });

  it("links capability goals to inventory and their tasks", async () => {
    goTo("/goals/?milestone=72h&goal=plan");
    mount(<GoalsPage />);
    const detail = await screen.findByTestId("goal-detail");
    // Planning goal: no inventory actions; its task opens in place.
    expect(
      within(detail).queryByRole("button", { name: /^Add .* Item$/ }),
    ).toBeNull();
    fireEvent.click(
      within(detail).getByRole("button", { name: "Work on the planning task" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      (within(dialog).getByLabelText("Task") as HTMLInputElement).value,
    ).toBe(
      (fakeDb.get("households/h1/tasks/seed72-plan") as { title: string })
        .title,
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(window.location.pathname).toBe("/goals/");

    // Selecting another goal updates the URL and keeps history.
    const length = window.history.length;
    fireEvent.click(screen.getByRole("link", { name: /Medical & first aid/ }));
    expect(window.location.search).toBe("?milestone=72h&goal=medical");
    expect(window.history.length).toBe(length + 1);
    await waitFor(() =>
      expect(
        within(screen.getByTestId("goal-detail"))
          .getByRole("link", { name: "View Medical Inventory" })
          .getAttribute("href"),
      ).toMatch(/^\/inventory\/\?category=Medical&from=/),
    );
    expect(
      within(screen.getByTestId("goal-detail")).getByRole("button", {
        name: "Add Medical Item",
      }),
    ).toBeTruthy();
  });

  it("asks for a household size instead of assuming one", async () => {
    fakeDb.set("households/h1", { name: "Bauer", ownerUid: "u1" });
    goTo("/goals/?milestone=7d&goal=food");
    mount(<GoalsPage />);
    const detail = await screen.findByTestId("goal-detail");
    expect(
      within(detail).getByRole("link", { name: "Set household size" }),
    ).toBeTruthy();
  });
});

describe("task deep link", () => {
  it("opens the existing task for editing and clears the link on close", async () => {
    goTo("/tasks/?task=seed72-water");
    mount(<TasksPage />);
    const d = await screen.findByRole("dialog");
    set(within(d).getByLabelText("Status"), "in_progress");
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Save" }));
    });
    expect(fakeDb.get("households/h1/tasks/seed72-water")).toMatchObject({
      status: "in_progress",
    });
    expect(window.location.search).toBe("");
  });
});

describe("version label", () => {
  it("shows the package.json version on sign-in and beneath the navbar brand", async () => {
    render(
      <SessionContext.Provider
        value={{
          state: { status: "signedOut" },
          signIn: async () => {},
          signOut: async () => {},
        }}
      >
        <SignIn />
      </SessionContext.Provider>,
    );
    expect(screen.getByTestId("app-version").textContent).toBe(
      `v${pkgVersion}`,
    );
    cleanup();

    mount(<TopBar />);
    const brand = await screen.findByRole("link", {
      name: "HomePrep dashboard",
    });
    expect(within(brand).getByTestId("app-version").textContent).toBe(
      `v${pkgVersion}`,
    );
  });
});
