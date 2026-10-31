// @vitest-environment jsdom
/*
 * Readiness objectives on the real pages, hooks and services, backed by the
 * in-memory Firestore. Objective selection is a per-user localStorage
 * preference; nothing here touches production Firestore.
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
import type { AnchorHTMLAttributes, ReactNode } from "react";
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

const { fakeDb } = await import("@/test/fake-firestore");
const { SessionContext } = await import("@/components/SessionProvider");
const { default: DashboardPage } = await import("@/app/page");
const { default: InventoryPage } = await import("@/app/inventory/page");
const { default: TasksPage } = await import("@/app/tasks/page");
const { default: BudgetPage } = await import("@/app/purchases/page");
const { seedHousehold } = await import("@/lib/seed");
const { objectiveStorageKey } = await import("@/lib/objective");

type SessionState = import("@/components/SessionProvider").SessionState;

function Session({
  uid,
  hid,
  children,
}: {
  uid: string;
  hid: string;
  children: ReactNode;
}) {
  const user = {
    uid,
    email: `${uid}@example.test`,
    displayName: uid,
  } as unknown as User;
  const state: SessionState = {
    status: "ready",
    user,
    household: { id: hid, name: hid, ownerUid: "u1", householdSize: 5 },
    member: {
      uid,
      displayName: uid,
      email: user.email!,
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
const mount = (ui: ReactNode, uid = "u1", hid = "h1") =>
  render(
    <Session uid={uid} hid={hid}>
      {ui}
    </Session>,
  );

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
  window.history.replaceState(null, "", "/");
  fakeDb.reset();
  window.localStorage.clear();
  fakeDb.set("households/h1", { name: "h1", ownerUid: "u1", householdSize: 5 });
  await seedHousehold("h1");
  fakeDb.set("households/h1/inventory/jugs", {
    name: "Water jugs",
    category: "Water",
    quantity: 8,
    unit: "gal",
    location: "Garage",
    expiresOn: null,
    notes: "",
  });
});
afterEach(cleanup);

const radio = (name: RegExp) => screen.getByRole("radio", { name });
const heading = () => screen.getByRole("heading", { level: 1 }).textContent!;

describe("dashboard objective selection", () => {
  it("defaults to 72 hours and switches every section to the selected objective", async () => {
    mount(<DashboardPage />);
    await waitFor(() => expect(heading()).toContain("72-hour readiness"));
    expect(radio(/^72 hours/).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("72-hour essentials")).toBeTruthy();

    fireEvent.click(radio(/^30 days/));
    expect(heading()).toContain("30-day readiness");
    expect(radio(/^30 days/).getAttribute("aria-checked")).toBe("true");
    expect(radio(/^72 hours/).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("30-day essentials")).toBeTruthy();
    // Same 8 gal of water, now against the 30-day target.
    expect(screen.getAllByText("8 / 150 gal").length).toBeGreaterThan(0);
    expect(screen.getByText("Water treatment")).toBeTruthy();
    expect(screen.getByText(/Builds on/).textContent).toContain("72 hours");

    // Priorities and completion come from 30-day tasks only.
    const priorities = screen.getByRole("list", { name: "30 days priorities" });
    expect(
      within(priorities).getByText(
        "Develop a water filtration and treatment plan",
      ),
    ).toBeTruthy();
    expect(within(priorities).queryByText(/potable water/)).toBeNull();
    const link = screen.getByRole("link", {
      name: /0\/7 done · 30 days tasks/,
    });
    expect(link.getAttribute("href")).toBe("/tasks/?milestone=30d");
  });

  it("supports keyboard selection", async () => {
    mount(<DashboardPage />);
    await waitFor(() => expect(heading()).toContain("72-hour"));
    fireEvent.keyDown(radio(/^72 hours/), { key: "ArrowRight" });
    expect(heading()).toContain("7-day readiness");
    expect(document.activeElement).toBe(radio(/^7 days/));
    fireEvent.keyDown(radio(/^7 days/), { key: "End" });
    expect(heading()).toContain("90-day readiness");
    fireEvent.keyDown(radio(/^90 days/), { key: "ArrowRight" });
    expect(heading()).toContain("72-hour readiness");
  });

  it("persists the choice per user and household without writing to Firestore", async () => {
    const before = JSON.stringify(fakeDb.get("households/h1"));
    const first = mount(<DashboardPage />);
    await waitFor(() => expect(heading()).toContain("72-hour"));
    fireEvent.click(radio(/^60 days/));
    expect(window.localStorage.getItem(objectiveStorageKey("u1", "h1"))).toBe(
      "60d",
    );
    expect(JSON.stringify(fakeDb.get("households/h1"))).toBe(before);
    first.unmount();

    mount(<DashboardPage />);
    await waitFor(() => expect(heading()).toContain("60-day readiness"));
    cleanup();

    // Another member of the same household keeps their own default.
    mount(<DashboardPage />, "u2", "h1");
    await waitFor(() => expect(heading()).toContain("72-hour readiness"));
  });

  it("does not seed or modify tasks when selecting a milestone", async () => {
    const count = fakeDb.list("households/h1/tasks").length;
    mount(<DashboardPage />);
    await waitFor(() => expect(heading()).toContain("72-hour"));
    for (const name of [/^7 days/, /^30 days/, /^60 days/, /^90 days/])
      fireEvent.click(radio(name));
    expect(fakeDb.list("households/h1/tasks")).toHaveLength(count);
  });

  it("reflects task completion and readiness changes live", async () => {
    mount(<DashboardPage />);
    await waitFor(() => expect(heading()).toContain("72-hour"));
    fireEvent.click(radio(/^7 days/));
    expect(heading()).toContain("0 of 7 essentials met");
    await act(async () => {
      fakeDb.set("households/h1/tasks/seed7d-cooking", {
        ...fakeDb.get("households/h1/tasks/seed7d-cooking")!,
        status: "complete",
      });
    });
    await waitFor(() => expect(heading()).toContain("1 of 7 essentials met"));
    expect(
      screen.getByRole("link", { name: /1\/7 done · 7 days tasks/ }),
    ).toBeTruthy();
  });
});

describe("tasks page milestone filter", () => {
  it("shows each milestone's starter tasks and keeps statuses", async () => {
    window.history.pushState({}, "", "/tasks/?milestone=60d");
    mount(<TasksPage />);
    expect(
      await screen.findByText("Conduct a household preparedness drill"),
    ).toBeTruthy();
    expect(
      screen.queryByText("Store 3 days of potable water for everyone"),
    ).toBeNull();
    window.history.pushState({}, "", "/");
  });
});

describe("inventory readiness preview", () => {
  const dialog = () => screen.getByRole("dialog");
  const set = (el: HTMLElement, value: string) =>
    fireEvent.change(el, { target: { value } });

  it("projects water for the selected objective without writing until saved", async () => {
    mount(<InventoryPage />);
    await screen.findByText("Water jugs");
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    set(within(dialog()).getByLabelText("Name"), "More water");
    set(within(dialog()).getByLabelText("Quantity"), "2");
    const preview = within(dialog()).getByTestId("readiness-preview");
    expect(preview.textContent).toContain("10 / 15 gallons");
    expect(preview.textContent).toContain(
      "67% of objective · 5 gallons remaining",
    );
    expect(preview.textContent).toContain("72 hours objective");
    expect(fakeDb.list("households/h1/inventory")).toHaveLength(1);

    // Unsupported unit: nothing counted.
    set(within(dialog()).getByLabelText("Unit"), "each");
    expect(
      within(dialog()).getByTestId("readiness-preview").textContent,
    ).toContain("8 / 15 gallons");
    expect(
      within(dialog()).getByText(/isn’t counted as potable water/),
    ).toBeTruthy();

    // Qualitative category: guidance, no percentage.
    set(within(dialog()).getByLabelText("Category"), "Medical");
    expect(within(dialog()).queryByTestId("readiness-preview")).toBeNull();
    expect(
      within(dialog()).getByTestId("readiness-guidance").textContent,
    ).toContain("first-aid");
    expect(fakeDb.list("households/h1/inventory")).toHaveLength(1);
  });

  it("uses the persisted objective and does not double-count edits", async () => {
    window.localStorage.setItem(objectiveStorageKey("u1", "h1"), "7d");
    mount(<InventoryPage />);
    fireEvent.click(await screen.findByText("Water jugs"));
    set(within(dialog()).getByLabelText("Quantity"), "10");
    const text = within(dialog()).getByTestId("readiness-preview").textContent!;
    expect(text).toContain("10 / 35 gallons");
    expect(text).toContain("this entry +2");

    await act(async () => {
      fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
    });
    await waitFor(() =>
      expect(fakeDb.get("households/h1/inventory/jugs")!.quantity).toBe(10),
    );
    // The dashboard reflects the persisted value.
    cleanup();
    mount(<DashboardPage />);
    await waitFor(() => expect(heading()).toContain("7-day readiness"));
    expect(screen.getAllByText("10 / 35 gal").length).toBeGreaterThan(0);
  });

  it("shows the preview when an acquired Budget purchase is added to inventory", async () => {
    fakeDb.set("households/h1/purchases/p1", {
      name: "Water Barrel",
      category: "Water",
      quantity: 1,
      unit: "each",
      estimatedPrice: 100,
      priority: 1,
      status: "acquired",
      notes: "",
    });
    fakeDb.set("households/h1/purchases/p2", {
      name: "Jug refill",
      category: "Water",
      quantity: 5,
      unit: "gal",
      estimatedPrice: 1,
      priority: 1,
      status: "acquired",
      notes: "",
    });
    mount(<BudgetPage />);
    fireEvent.click(
      (
        await screen.findAllByRole("button", {
          name: "Add Water Barrel to inventory",
        })
      )[0],
    );
    let preview = within(dialog()).getByTestId("readiness-preview");
    expect(preview.textContent).toContain("8 / 15 gallons");
    expect(
      within(dialog()).getByText(/isn’t counted as potable water/),
    ).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));

    fireEvent.click(
      screen.getAllByRole("button", { name: "Add Jug refill to inventory" })[0],
    );
    // Adding to the existing jugs replaces their share: 8 + 5, not 8 + 13.
    set(within(dialog()).getByLabelText("Add as"), "jugs");
    preview = within(dialog()).getByTestId("readiness-preview");
    expect(preview.textContent).toContain("13 / 15 gallons");
    expect(fakeDb.get("households/h1/inventory/jugs")!.quantity).toBe(8);
  });
});
