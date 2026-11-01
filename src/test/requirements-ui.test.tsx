// @vitest-environment jsdom
/*
 * Editable preparedness requirements on the real Goals and Dashboard pages,
 * backed by the in-memory Firestore. Nothing here touches production.
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
const { seedHousehold } = await import("@/lib/seed");
const { db } = await import("@/lib/firebase");

type SessionState = import("@/components/SessionProvider").SessionState;
type Household = import("@/lib/types").Household;
type RequirementState = import("@/lib/types").RequirementState;

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
const state = () =>
  ((fakeDb.get("households/h1") as unknown as Household).requirementState ??
    {}) as RequirementState;
const row = (id: string) => screen.getByTestId(`requirement-${id}`);
const expand = (id: string) =>
  fireEvent.click(within(row(id)).getByRole("button", { expanded: false }));
const detail = () => screen.getByTestId("goal-detail");
const goalBadge = () =>
  within(detail().parentElement!.parentElement!).getAllByText(
    /^(Met|Open|Needs review)$/,
  )[0].textContent;

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

describe("goal requirements checklist", () => {
  it("shows an actionable checklist with sources for a capability goal", async () => {
    goTo("/goals/?milestone=72h&goal=sanitation");
    mount(<GoalsPage />);
    await screen.findByTestId("requirements");
    expect(row("72h.sanitation.supplies")).toBeTruthy();
    expect(row("72h.sanitation.hygiene")).toBeTruthy();
    expect(row("72h.sanitation.toilet")).toBeTruthy();
    expect(screen.getByTestId("requirement-tally").textContent).toBe(
      "0 of 3 core done",
    );
    // 240 rolls recorded: the goal needs review, it is not met.
    expect(goalBadge()).toBe("Needs review");
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

  it("persists attestation as household-confirmed and survives a refresh", async () => {
    goTo("/goals/?milestone=72h&goal=plan");
    const view = mount(<GoalsPage />);
    await screen.findByTestId("requirements");
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
    expect(screen.getByTestId("requirement-tally").textContent).toBe(
      "1 of 4 core done · 1 household-confirmed",
    );

    view.unmount();
    mount(<GoalsPage />);
    await screen.findByTestId("requirements");
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

  it("links an inventory item as evidence", async () => {
    goTo("/goals/?milestone=72h&goal=medical");
    mount(<GoalsPage />);
    await screen.findByTestId("requirements");
    expand("72h.medical.first-aid");
    const select = within(row("72h.medical.first-aid")).getByLabelText(
      "Link an inventory item to First aid kit",
    );
    fireEvent.change(select, { target: { value: "kit" } });
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
    // Unlink.
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

  it("marks a conditional recommendation not applicable with a reason, then restores it", async () => {
    goTo("/goals/?milestone=72h&goal=medical");
    mount(<GoalsPage />);
    await screen.findByTestId("requirements");
    expect(screen.getByTestId("requirement-tally").textContent).toBe(
      "0 of 4 core done",
    );
    expand("72h.medical.power");
    fireEvent.click(
      within(row("72h.medical.power")).getByRole("button", {
        name: "Not applicable",
      }),
    );
    fireEvent.change(screen.getByLabelText("Reason (optional)"), {
      target: { value: "No powered devices" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Mark not applicable" }),
    );
    await waitFor(() =>
      expect(state()["72h.medical.power"]?.notApplicable).toMatchObject({
        reason: "No powered devices",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("requirement-tally").textContent).toBe(
        "0 of 3 core done",
      ),
    );
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

  it("customizes a recommendation, shows the original, and restores the default", async () => {
    goTo("/goals/?milestone=72h&goal=plan");
    mount(<GoalsPage />);
    await screen.findByTestId("requirements");
    expand("72h.plan.meeting");
    fireEvent.click(
      within(row("72h.plan.meeting")).getByRole("button", {
        name: "Customize",
      }),
    );
    const title = within(row("72h.plan.meeting")).getByLabelText("Requirement");
    fireEvent.change(title, { target: { value: "Meet at the library" } });
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
    fireEvent.click(within(r).getByRole("button", { name: "Restore default" }));
    await waitFor(() => expect(state()["72h.plan.meeting"]).toBeUndefined());
  });

  it("adds, edits and deletes a custom requirement (with confirmation)", async () => {
    goTo("/goals/?milestone=72h&goal=comms");
    mount(<GoalsPage />);
    await screen.findByTestId("requirements");
    fireEvent.click(screen.getByRole("button", { name: "Add requirement" }));
    fireEvent.change(screen.getByLabelText("Requirement"), {
      target: { value: "Charge the two-way radios" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add requirement" }));
    await waitFor(() =>
      expect(
        Object.keys(state()).filter((k) => k.startsWith("custom-")),
      ).toHaveLength(1),
    );
    const id = Object.keys(state()).find((k) => k.startsWith("custom-"))!;
    await waitFor(() => expect(row(id)).toBeTruthy());
    expect(within(row(id)).getByText("Custom")).toBeTruthy();
    expect(screen.getByTestId("requirement-tally").textContent).toBe(
      "0 of 4 core done",
    );

    expand(id);
    fireEvent.click(within(row(id)).getByRole("button", { name: "Edit" }));
    fireEvent.change(within(row(id)).getByLabelText("Requirement"), {
      target: { value: "Charge both two-way radios" },
    });
    fireEvent.click(within(row(id)).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(state()[id]?.custom?.title).toBe("Charge both two-way radios"),
    );

    const ask = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(within(row(id)).getByRole("button", { name: "Delete" }));
    expect(ask).toHaveBeenCalledWith(
      'Delete requirement "Charge both two-way radios"?',
    );
    expect(state()[id]).toBeTruthy();
    ask.mockReturnValueOnce(true);
    fireEvent.click(within(row(id)).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(state()[id]).toBeUndefined());
  });

  it("keeps the water target and adds supporting requirements without duplicating it", async () => {
    fakeDb.set("households/h1/inventory/jugs", {
      name: "Water jugs",
      category: "Water",
      quantity: 15,
      unit: "gal",
      location: "",
      expiresOn: null,
      notes: "",
    });
    goTo("/goals/?milestone=72h&goal=water");
    mount(<GoalsPage />);
    await screen.findByTestId("requirements");
    expect(screen.getByText("Recommended baseline")).toBeTruthy();
    expect(screen.getByLabelText(/Custom household target/)).toBeTruthy();
    expect(screen.queryByTestId("requirement-water.supply")).toBeNull();
    expect(row("water.storage")).toBeTruthy();
    expect(screen.getByText(/not required\s+for the goal/)).toBeTruthy();
    expect(goalBadge()).toBe("Met");
  });
});

describe("dashboard and goals agree", () => {
  it("shows the same status for every 72-hour goal", async () => {
    fakeDb.set("households/h1", {
      ...(fakeDb.get("households/h1") as object),
      requirementState: {
        "72h.plan.meeting": {
          confirmed: { by: "A", at: "2026-10-31T00:00:00.000Z" },
          updatedAt: "2026-10-31T00:00:00.000Z",
        },
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
        within(screen.getByTestId(`essential-${k}`))
          .getByRole("img")
          .getAttribute("aria-label"),
      ]),
    );
    expect(onDashboard).toMatchObject({
      medical: "Needs review",
      sanitation: "Needs review",
      power: "Not met",
    });
    dash.unmount();

    for (const k of keys) {
      goTo(`/goals/?milestone=72h&goal=${k}`);
      const v = mount(<GoalsPage />);
      await screen.findByTestId("goal-detail");
      const label = goalBadge();
      const expected = onDashboard[k] === "Not met" ? "Open" : onDashboard[k];
      expect([k, label]).toEqual([k, expected]);
      v.unmount();
    }
  });
});

describe("live recalculation", () => {
  it("recalculates when a linked item is used up", async () => {
    fakeDb.set("households/h1", {
      ...(fakeDb.get("households/h1") as object),
      requirementState: {
        "72h.medical.first-aid": {
          inventoryIds: ["kit"],
          updatedAt: "2026-10-31T00:00:00.000Z",
        },
      },
    });
    goTo("/goals/?milestone=72h&goal=medical");
    mount(<GoalsPage />);
    await screen.findByTestId("requirements");
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
