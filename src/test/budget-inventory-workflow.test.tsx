// @vitest-environment jsdom
/*
 * End-to-end UI workflow on the real pages, hooks and services, backed by the
 * in-memory Firestore (live listeners + transactional commits):
 *   Budget: propose → acquire (actual cost) → add to inventory (fail → retry)
 *   Inventory: live list, refresh, search/filter, second member, other household
 *   Dashboard: record counts, budget summary, readiness
 * This verifies application wiring; it does not exercise Firestore security
 * rules (that needs the emulator, which this project does not use).
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
const { default: BudgetPage } = await import("@/app/purchases/page");
const { default: InventoryPage } = await import("@/app/inventory/page");
const { default: DashboardPage } = await import("@/app/page");

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
    household: {
      id: hid,
      name: `Household ${hid}`,
      ownerUid: "u1",
      householdSize: 5,
    },
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

const mount = (page: ReactNode, uid = "u1", hid = "h1") =>
  render(
    <Session uid={uid} hid={hid}>
      {page}
    </Session>,
  );

beforeAll(() => {
  // jsdom lacks the modal dialog API used by <Modal>.
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

beforeEach(() => fakeDb.reset());
afterEach(cleanup);

const purchases = (hid = "h1") => fakeDb.list(`households/${hid}/purchases`);
const inventory = (hid = "h1") => fakeDb.list(`households/${hid}/inventory`);
const field = (root: HTMLElement, label: string | RegExp) =>
  within(root).getByLabelText(label) as HTMLInputElement | HTMLSelectElement;
const set = (el: HTMLElement, value: string) =>
  fireEvent.change(el, { target: { value } });
const dialog = () => screen.getByRole("dialog");

describe("Budget → Inventory → Dashboard", () => {
  it("persists each stage in Firestore and keeps every page in sync", async () => {
    const budget = mount(<BudgetPage />);
    const inv = mount(<InventoryPage />);
    const dash = mount(<DashboardPage />);
    const B = within(budget.container);
    const I = within(inv.container);
    const D = () => within(dash.container);

    await B.findByText("No planned purchases.");
    await I.findByText(/No items yet/);

    // 1–2. Propose a purchase; it is written to the household's purchases.
    fireEvent.click(B.getByRole("button", { name: "Propose purchase" }));
    set(field(dialog(), "Item"), "Water Barrel");
    set(field(dialog(), "Category"), "Water");
    set(field(dialog(), "Quantity"), "1");
    set(field(dialog(), "Unit"), "each");
    set(field(dialog(), "Est. price / unit ($)"), "100");
    set(
      field(dialog(), "Product link (optional)"),
      "https://example.com/barrel",
    );
    await act(async () => {
      fireEvent.click(
        within(dialog()).getByRole("button", { name: "Add purchase" }),
      );
    });
    await waitFor(() => expect(purchases()).toHaveLength(1));
    const pid = purchases()[0].id;
    expect(purchases()[0]).toMatchObject({
      name: "Water Barrel",
      status: "proposed",
      productUrl: "https://example.com/barrel",
      inventoryItemId: null,
    });
    await waitFor(() =>
      expect(D().getByTestId("dashboard-budget").textContent).toContain(
        "1 planned",
      ),
    );
    expect(D().getByTestId("dashboard-budget").textContent).toContain(
      "$100.00",
    );

    // 3–5. Mark acquired with an actual cost. No inventory is created.
    fireEvent.click(
      B.getAllByRole("button", { name: "Mark Water Barrel acquired" })[0],
    );
    set(field(dialog(), /Actual cost, total paid/), "100");
    await act(async () => {
      fireEvent.click(
        within(dialog()).getByRole("button", { name: "Mark acquired" }),
      );
    });
    await within(dialog()).findByText(/is marked acquired/);
    expect(fakeDb.get(`households/h1/purchases/${pid}`)).toMatchObject({
      status: "acquired",
      actualCostCents: 10000,
    });
    expect(inventory()).toHaveLength(0);

    // Dashboard: nothing planned, but the acquired purchase is still visible.
    await waitFor(() => {
      const text = D().getByTestId("dashboard-budget").textContent!;
      expect(text).toContain("0 planned");
      expect(text).toContain("$0.00");
      expect(text).toContain("1 acquired");
      expect(text).toContain("$100.00");
      expect(text).toContain("1 not yet in inventory");
    });
    expect(D().getByLabelText("Water: 0 recorded items")).toBeTruthy();
    expect(I.getByText(/No items yet/)).toBeTruthy();

    // 6–7. Choose Add to inventory: the existing form opens prefilled.
    fireEvent.click(
      within(dialog()).getByRole("button", { name: "Add to inventory" }),
    );
    expect((field(dialog(), "Name") as HTMLInputElement).value).toBe(
      "Water Barrel",
    );
    expect(field(dialog(), "Category").value).toBe("Water");
    expect(field(dialog(), "Unit").value).toBe("each");
    set(field(dialog(), "Storage location"), "Garage");

    // 8–9. A failed commit writes nothing, keeps the input, and allows retry.
    fakeDb.failNext("commit");
    await act(async () => {
      fireEvent.click(
        within(dialog()).getByRole("button", { name: "Add to inventory" }),
      );
    });
    await within(dialog()).findByText(/Inventory was not updated/);
    expect(inventory()).toHaveLength(0);
    expect(
      fakeDb.get(`households/h1/purchases/${pid}`)!.inventoryItemId,
    ).toBeNull();
    expect(
      (field(dialog(), "Storage location") as HTMLInputElement).value,
    ).toBe("Garage");

    await act(async () => {
      fireEvent.click(
        within(dialog()).getByRole("button", { name: "Try again" }),
      );
    });
    await within(dialog()).findByText(/Saved to Inventory as/);

    // 10. One linked inventory record exists.
    expect(inventory()).toHaveLength(1);
    expect(inventory()[0]).toMatchObject({
      id: `purchase-${pid}`,
      name: "Water Barrel",
      category: "Water",
      quantity: 1,
      unit: "each",
      location: "Garage",
      sourcePurchaseId: pid,
    });
    expect(fakeDb.get(`households/h1/purchases/${pid}`)!.inventoryItemId).toBe(
      `purchase-${pid}`,
    );

    // 11. Inventory page updates live, without a reload.
    await I.findByText("Water Barrel");
    expect(I.getByText("1 items recorded")).toBeTruthy();

    // 12. Dashboard updates: one Water record, but an empty barrel (unit "each")
    // does not count toward potable water.
    await waitFor(() =>
      expect(D().getByLabelText("Water: 1 recorded item")).toBeTruthy(),
    );
    expect(D().getByText("1 items · Manage")).toBeTruthy();
    expect(D().getByTestId("dashboard-budget").textContent).not.toContain(
      "not yet in inventory",
    );
    expect(D().getAllByText("0 / 15 gal")).toHaveLength(2); // milestone + essentials

    // Budget row now shows the link instead of an add action (no duplicates).
    fireEvent.click(within(dialog()).getByRole("button", { name: "Done" }));
    fireEvent.click(B.getByLabelText("Show acquired"));
    expect(B.getAllByText("In inventory").length).toBeGreaterThan(0);
    expect(
      B.queryByRole("button", { name: "Add Water Barrel to inventory" }),
    ).toBeNull();

    // Refresh: a fresh mount re-reads Firestore and still shows the item.
    inv.unmount();
    const again = mount(<InventoryPage />);
    expect(
      await within(again.container).findByText("Water Barrel"),
    ).toBeTruthy();
  });

  it("lets a later Add to inventory run for an acquired purchase that was skipped", async () => {
    fakeDb.set("households/h1/purchases/p1", {
      name: "Hand-crank radio",
      category: "Communications",
      quantity: 1,
      unit: "each",
      estimatedPrice: 45,
      priority: 2,
      status: "acquired",
      notes: "",
    });
    const budget = mount(<BudgetPage />);
    const B = within(budget.container);
    fireEvent.click(
      (
        await B.findAllByRole("button", {
          name: "Add Hand-crank radio to inventory",
        })
      )[0],
    );
    await act(async () => {
      fireEvent.click(
        within(dialog()).getByRole("button", { name: "Add to inventory" }),
      );
    });
    await within(dialog()).findByText(/Saved to Inventory as/);
    expect(inventory()).toHaveLength(1);
  });
});

describe("Inventory page", () => {
  it("adds qualifying water that the dashboard counts toward readiness", async () => {
    const inv = mount(<InventoryPage />);
    const dash = mount(<DashboardPage />);
    const I = within(inv.container);
    await I.findByText(/No items yet/);
    fireEvent.click(I.getByRole("button", { name: "Add item" }));
    set(field(dialog(), "Name"), "Water jugs");
    set(field(dialog(), "Quantity"), "15");
    await act(async () => {
      fireEvent.click(
        within(dialog()).getByRole("button", { name: "Add item" }),
      );
    });
    await I.findByText("Water jugs");
    await waitFor(() =>
      // Shown on the 72-hour milestone and in the essentials list.
      expect(within(dash.container).getAllByText("15 / 15 gal")).toHaveLength(
        2,
      ),
    );
  });

  it("keeps search and category filters working on live data", async () => {
    fakeDb.set("households/h1/inventory/a", {
      name: "Water Barrel",
      category: "Water",
      quantity: 1,
      unit: "each",
      location: "Garage",
      expiresOn: null,
      notes: "",
    });
    fakeDb.set("households/h1/inventory/b", {
      name: "Canned soup",
      category: "Food",
      quantity: 12,
      unit: "meals",
      location: "Pantry",
      expiresOn: null,
      notes: "",
    });
    const inv = mount(<InventoryPage />);
    const I = within(inv.container);
    await I.findByText("Canned soup");
    set(I.getByLabelText("Search inventory"), "barrel");
    expect(I.queryByText("Canned soup")).toBeNull();
    expect(I.getByText("Water Barrel")).toBeTruthy();
    set(I.getByLabelText("Search inventory"), "");
    set(I.getByDisplayValue("All"), "Food");
    expect(I.getByText("Canned soup")).toBeTruthy();
    expect(I.queryByText("Water Barrel")).toBeNull();
  });
});

describe("household data isolation", () => {
  it("shows the same records to members of one household and none to another", async () => {
    fakeDb.set("households/h1/inventory/a", {
      name: "Water Barrel",
      category: "Water",
      quantity: 1,
      unit: "each",
      location: "",
      expiresOn: null,
      notes: "",
    });
    fakeDb.set("households/h1/purchases/p1", {
      name: "Weather radio",
      category: "Communications",
      quantity: 1,
      unit: "each",
      estimatedPrice: 40,
      priority: 1,
      status: "approved",
      notes: "",
    });

    const first = mount(<InventoryPage />, "u1", "h1");
    const second = mount(<InventoryPage />, "u2", "h1");
    const other = mount(<InventoryPage />, "u3", "h2");
    expect(
      await within(first.container).findByText("Water Barrel"),
    ).toBeTruthy();
    expect(
      await within(second.container).findByText("Water Barrel"),
    ).toBeTruthy();
    expect(
      await within(other.container).findByText(/No items yet/),
    ).toBeTruthy();

    const secondBudget = mount(<BudgetPage />, "u2", "h1");
    const otherBudget = mount(<BudgetPage />, "u3", "h2");
    expect(
      (await within(secondBudget.container).findAllByText("Weather radio"))
        .length,
    ).toBeGreaterThan(0);
    expect(
      await within(otherBudget.container).findByText("No planned purchases."),
    ).toBeTruthy();
  });
});
