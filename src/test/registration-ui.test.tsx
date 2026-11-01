// @vitest-environment jsdom
/*
 * Invite-only onboarding, the Admin workspace, household membership controls
 * and the invitation page, on the real pages backed by the in-memory
 * Firestore. Authorization itself is enforced by firestore.rules (see
 * rules-tests/registration.rules.test.ts); these tests cover what each person
 * sees and the writes the screens make. Nothing here touches production.
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
const push = vi.fn();
let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

const { fakeDb } = await import("@/test/fake-firestore");
const { Timestamp } = await import("firebase/firestore");
const { SessionContext } = await import("@/components/SessionProvider");
const { Onboarding, TopBar } = await import("@/components/AppShell");
const { default: AdminPage } = await import("@/app/admin/page");
const { default: HouseholdPage } = await import("@/app/household/page");
const { default: InvitePage } = await import("@/app/invite/page");

type SessionState = import("@/components/SessionProvider").SessionState;
type Household = import("@/lib/types").Household;
type HouseholdRole = import("@/lib/types").HouseholdRole;

const user = (uid: string, email: string) =>
  ({
    uid,
    email,
    emailVerified: true,
    displayName: uid,
    photoURL: null,
  }) as unknown as User;

function session(opts: {
  uid?: string;
  email?: string;
  role?: HouseholdRole | null;
  admin?: boolean;
}) {
  const u = user(opts.uid ?? "owner", opts.email ?? "owner@example.test");
  const state: SessionState =
    opts.role === null
      ? { status: "noHousehold", user: u, notice: null }
      : {
          status: "ready",
          user: u,
          household: {
            id: "h1",
            ...(fakeDb.get("households/h1") as object),
          } as Household,
          member: {
            uid: u.uid,
            displayName: u.uid,
            email: u.email!,
            photoURL: null,
            role: opts.role ?? "owner",
          },
          seedError: null,
        };
  return (ui: ReactNode) =>
    render(
      <SessionContext.Provider
        value={{
          state,
          admin: !!opts.admin,
          signIn: async () => {},
          signOut: async () => {},
        }}
      >
        {ui}
      </SessionContext.Provider>,
    );
}

const goTo = (url: string) => window.history.replaceState(null, "", url);
const set = (el: HTMLElement, value: string) =>
  fireEvent.change(el, { target: { value } });
const member = (uid: string, role: HouseholdRole) => ({
  uid,
  displayName: uid,
  email: `${uid}@example.test`,
  photoURL: null,
  role,
  joinedAt: Timestamp.fromMillis(role === "owner" ? 1 : 2),
});
const invitations = () =>
  fakeDb
    .list("invitations")
    .map(({ id, ...data }) => ({ id, data: data as Record<string, unknown> }));

beforeEach(() => {
  fakeDb.reset();
  push.mockReset();
  pathname = "/";
  goTo("/");
  fakeDb.set("households/h1", {
    name: "Bauer",
    ownerUid: "owner",
    householdSize: 3,
  });
  fakeDb.set("households/h1/members/owner", member("owner", "owner"));
  fakeDb.set("households/h1/members/co", member("co", "co-owner"));
  fakeDb.set("households/h1/members/kid", member("kid", "member"));
  fakeDb.set("households/h1/inventory/tp", { name: "Bulk TP", quantity: 240 });
  fakeDb.set("registrations/h1", {
    name: "Bauer",
    ownerUid: "owner",
    ownerEmail: "owner@example.test",
    invitationId: "bootstrap",
    memberCount: 3,
    status: "active",
    createdAt: Timestamp.fromMillis(Date.now()),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("invite-only onboarding", () => {
  it("offers no way to create a household without an invitation", () => {
    session({ role: null })(<Onboarding />);
    expect(screen.getByText("Open your invitation")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /create household/i }),
    ).toBeNull();
    expect(screen.queryByText("Open Admin")).toBeNull();
    set(screen.getByLabelText("Invitation link"), "not a link");
    fireEvent.click(screen.getByRole("button", { name: "Open invitation" }));
    expect(screen.getByText(/Paste the whole invitation link/)).toBeTruthy();
    set(
      screen.getByLabelText("Invitation link"),
      "https://homeprep.web.app/invite/?id=AbCdEf1234567890",
    );
    fireEvent.click(screen.getByRole("button", { name: "Open invitation" }));
    expect(push).toHaveBeenCalledWith("/invite/?id=AbCdEf1234567890");
  });
});

describe("admin navigation", () => {
  const navLabels = () =>
    within(screen.getByRole("navigation", { name: "Main" }))
      .getAllByRole("link")
      .map((a) => a.textContent);

  it("is visible only to the platform administrator", () => {
    const v = session({ admin: false })(<TopBar />);
    expect(navLabels()).not.toContain("Admin");
    v.unmount();
    session({ admin: true })(<TopBar />);
    expect(navLabels()).toContain("Admin");
  });
});

describe("admin workspace", () => {
  it("is refused to anyone without the admin claim", () => {
    session({ admin: false })(<AdminPage />);
    expect(
      screen.getByText(/available only to the HomePrep platform administrator/),
    ).toBeTruthy();
    expect(screen.queryByText("Invite Household Owner")).toBeNull();
  });

  it("creates, lists and revokes owner invitations", async () => {
    session({ admin: true, uid: "admin", email: "admin@example.test" })(
      <AdminPage />,
    );
    await screen.findByText("No pending owner invitations.");
    set(screen.getByLabelText("Owner’s Google email"), " Tester@Example.test ");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Create invitation" }),
      );
    });
    const [inv] = invitations();
    expect(inv.data).toMatchObject({
      type: "owner",
      email: "tester@example.test",
      role: "owner",
      status: "pending",
      householdId: null,
      createdBy: "admin",
    });
    expect(fakeDb.get(`auditLog/${inv.id}_created`)).toMatchObject({
      action: "created",
      email: "tester@example.test",
    });
    const link = screen.getByTestId("invitation-link");
    expect(
      (within(link).getByLabelText("Invitation link") as HTMLInputElement)
        .value,
    ).toBe(`${window.location.origin}/invite/?id=${inv.id}`);
    // It doesn't claim to send email.
    expect(link.textContent).toMatch(/No email is sent/);
    const pending = await screen.findByTestId("pending-invitations");
    expect(pending.textContent).toContain("tester@example.test");

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => {
      fireEvent.click(within(pending).getByRole("button", { name: "Revoke" }));
    });
    expect(fakeDb.get(`invitations/${inv.id}`)).toMatchObject({
      status: "revoked",
      revokedBy: "admin",
    });
    expect(fakeDb.get(`auditLog/${inv.id}_revoked`)).toBeTruthy();
    await screen.findByText("No pending owner invitations.");
  });

  it("summarizes registrations without household content", async () => {
    session({ admin: true, uid: "admin" })(<AdminPage />);
    const list = await screen.findByTestId("registrations");
    expect(list.textContent).toContain("Bauer");
    expect(list.textContent).toContain("owner@example.test");
    expect(list.textContent).toContain("3 members");
    expect(list.textContent).toContain("existing household");
    expect(document.body.textContent).not.toContain("Bulk TP");
  });
});

describe("household membership", () => {
  it("lets the owner invite members and co-owners", async () => {
    session({ role: "owner" })(<HouseholdPage />);
    set(await screen.findByLabelText("Email"), "carol@example.test");
    set(screen.getByLabelText("Role"), "co-owner");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Create invitation" }),
      );
    });
    const [inv] = invitations();
    expect(inv.data).toMatchObject({
      type: "member",
      email: "carol@example.test",
      role: "co-owner",
      householdId: "h1",
      householdName: "Bauer",
    });
    // Member invitations are household-private: no platform audit entry.
    expect(fakeDb.list("auditLog")).toEqual([]);
    expect(screen.getByTestId("invitation-link")).toBeTruthy();
    expect(
      (await screen.findByTestId("member-invitations")).textContent,
    ).toMatch(/carol@example.test/);
  });

  it("lets the owner change roles and remove members, but not the owner", async () => {
    session({ role: "owner" })(<HouseholdPage />);
    const kid = await screen.findByTestId("member-kid");
    set(within(kid).getByLabelText("Role for kid"), "co-owner");
    await waitFor(() =>
      expect(fakeDb.get("households/h1/members/kid")).toMatchObject({
        role: "co-owner",
      }),
    );
    const own = screen.getByTestId("member-owner");
    expect(within(own).queryByRole("combobox")).toBeNull();
    expect(within(own).queryByRole("button")).toBeNull();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => {
      fireEvent.click(
        within(screen.getByTestId("member-co")).getByRole("button", {
          name: "Remove",
        }),
      );
    });
    expect(fakeDb.get("households/h1/members/co")).toBeUndefined();
    expect(fakeDb.get("registrations/h1")).toMatchObject({
      memberCount: 2,
      lastChange: "co",
    });
  });

  it("lets a co-owner invite and remove members only", async () => {
    session({ uid: "co", email: "co@example.test", role: "co-owner" })(
      <HouseholdPage />,
    );
    await screen.findByLabelText("Email");
    expect(screen.queryByLabelText("Role")).toBeNull();
    expect(screen.queryByLabelText(/^Role for/)).toBeNull();
    expect(
      within(screen.getByTestId("member-kid")).getByRole("button", {
        name: "Remove",
      }),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("member-owner")).queryByRole("button"),
    ).toBeNull();
    expect(
      within(screen.getByTestId("member-co")).getByRole("button", {
        name: "Leave household",
      }),
    ).toBeTruthy();
  });

  it("shows members no privileged controls", async () => {
    session({ uid: "kid", email: "kid@example.test", role: "member" })(
      <HouseholdPage />,
    );
    await screen.findByTestId("member-owner");
    expect(screen.getByText(/Ask the owner or a co-owner/)).toBeTruthy();
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryAllByRole("button", { name: "Remove" })).toEqual([]);
    expect(screen.queryByLabelText(/^Role for/)).toBeNull();
    expect(
      within(screen.getByTestId("member-kid")).getByRole("button", {
        name: "Leave household",
      }),
    ).toBeTruthy();
  });
});

describe("accepting an invitation", () => {
  const seedInvitation = (p: Record<string, unknown> = {}) =>
    fakeDb.set("invitations/inv1", {
      type: "member",
      email: "carol@example.test",
      role: "member",
      householdId: "h1",
      householdName: "Bauer",
      createdBy: "owner",
      createdByName: "Owner",
      createdAt: Timestamp.fromMillis(Date.now() - 86_400_000),
      status: "pending",
      acceptedBy: null,
      acceptedAt: null,
      revokedBy: null,
      revokedAt: null,
      ...p,
    });
  const open = (email = "carol@example.test", uid = "carol") => {
    goTo("/invite/?id=inv1");
    pathname = "/invite/";
    return session({ uid, email, role: null })(<InvitePage />);
  };

  it("shows the household and role, and joins only on confirmation", async () => {
    seedInvitation();
    open();
    expect((await screen.findByTestId("invite-household")).textContent).toBe(
      "Bauer",
    );
    expect(screen.getByText("Member")).toBeTruthy();
    expect(fakeDb.get("households/h1/members/carol")).toBeUndefined();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Join Household" }));
    });
    expect(fakeDb.get("households/h1/members/carol")).toMatchObject({
      role: "member",
      invitationId: "inv1",
    });
    expect(fakeDb.get("invitations/inv1")).toMatchObject({
      status: "accepted",
      acceptedBy: "carol",
    });
    expect(fakeDb.get("users/carol")).toMatchObject({ householdId: "h1" });
    expect(fakeDb.get("registrations/h1")).toMatchObject({ memberCount: 4 });
    expect(push).toHaveBeenCalledWith("/");
  });

  it.each([
    [{ status: "revoked" }, /was revoked/],
    [
      { createdAt: Timestamp.fromMillis(Date.now() - 8 * 86_400_000) },
      /has expired/,
    ],
    [{ status: "accepted", acceptedBy: "someone" }, /already been used/],
    [{ email: "someone@example.test" }, /different Google account/],
  ])("explains an invitation that can't be used (%o)", async (patch, msg) => {
    seedInvitation(patch);
    open();
    expect((await screen.findByRole("alert")).textContent).toMatch(msg);
    expect(screen.queryByRole("button", { name: "Join Household" })).toBeNull();
  });

  it("sets up a household from an owner invitation", async () => {
    seedInvitation({
      type: "owner",
      role: "owner",
      householdId: null,
      householdName: null,
    });
    open();
    set(await screen.findByLabelText("Household name"), "Carol Home");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create Household" }));
    });
    const inv = fakeDb.get("invitations/inv1") as Record<string, unknown>;
    expect(inv).toMatchObject({ status: "accepted", acceptedBy: "carol" });
    const hid = inv.householdId as string;
    expect(fakeDb.get(`households/${hid}`)).toMatchObject({
      name: "Carol Home",
      ownerUid: "carol",
      invitationId: "inv1",
    });
    expect(fakeDb.get(`households/${hid}/members/carol`)).toMatchObject({
      role: "owner",
    });
    expect(fakeDb.get(`registrations/${hid}`)).toMatchObject({
      ownerEmail: "carol@example.test",
      memberCount: 1,
    });
    expect(fakeDb.get(`auditLog/inv1_accepted`)).toMatchObject({
      householdId: hid,
    });
    // The original household is untouched.
    expect(fakeDb.get("households/h1")).toMatchObject({ name: "Bauer" });
  });
});
