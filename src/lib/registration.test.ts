/*
 * Invitation lifecycle helpers and the registration bootstrap plan (pure).
 * Rules and the real writes are covered in rules-tests/registration.rules.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  describePlan,
  planBootstrap,
  SERVER_TIME,
} from "../../scripts/registration-lib.mjs";
import { navFor, NAV } from "../components/nav";
import {
  acceptProblem,
  expiresAt,
  invitationLink,
  invitationState,
  isValidEmail,
  normalizeEmail,
  parseInvitationRef,
  type Identity,
} from "./household";
import type { Invitation } from "./types";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 1);
const ts = (ms: number) =>
  ({ toMillis: () => ms }) as unknown as Invitation["createdAt"];
const invitation = (p: Partial<Invitation> = {}): Invitation => ({
  id: "inv1234567890",
  type: "owner",
  email: "tester@example.test",
  role: "owner",
  householdId: null,
  householdName: null,
  createdBy: "admin",
  createdByName: "Admin",
  createdAt: ts(NOW - DAY),
  status: "pending",
  acceptedBy: null,
  acceptedAt: null,
  revokedBy: null,
  revokedAt: null,
  ...p,
});
const user = (p: Partial<Identity> = {}): Identity => ({
  uid: "tester",
  email: "Tester@Example.test",
  emailVerified: true,
  displayName: "Tester",
  photoURL: null,
  ...p,
});

describe("invitation lifecycle", () => {
  it("derives pending, expired, accepted and revoked", () => {
    expect(invitationState(invitation(), NOW)).toBe("pending");
    expect(expiresAt(invitation())).toBe(NOW + 6 * DAY);
    expect(
      invitationState(invitation({ createdAt: ts(NOW - 7 * DAY) }), NOW),
    ).toBe("expired");
    expect(invitationState(invitation({ status: "accepted" }), NOW)).toBe(
      "accepted",
    );
    expect(invitationState(invitation({ status: "revoked" }), NOW)).toBe(
      "revoked",
    );
  });

  it("explains why an invitation can't be accepted", () => {
    expect(acceptProblem(invitation(), user(), NOW)).toBeNull();
    expect(
      acceptProblem(invitation({ status: "revoked" }), user(), NOW),
    ).toMatch(/revoked/);
    expect(
      acceptProblem(invitation({ createdAt: ts(NOW - 8 * DAY) }), user(), NOW),
    ).toMatch(/expired/);
    expect(
      acceptProblem(
        invitation({ status: "accepted", acceptedBy: "tester" }),
        user(),
        NOW,
      ),
    ).toMatch(/already accepted/);
    expect(
      acceptProblem(
        invitation({ status: "accepted", acceptedBy: "other" }),
        user(),
        NOW,
      ),
    ).toMatch(/already been used/);
    expect(
      acceptProblem(invitation(), user({ email: "other@example.test" }), NOW),
    ).toMatch(/different Google account/);
    expect(
      acceptProblem(invitation(), user({ emailVerified: false }), NOW),
    ).toMatch(/different Google account/);
  });

  it("normalizes emails and parses links", () => {
    expect(normalizeEmail("  Tester@Example.TEST ")).toBe(
      "tester@example.test",
    );
    expect(isValidEmail("tester@example.test")).toBe(true);
    expect(isValidEmail("not an email")).toBe(false);
    const link = invitationLink("https://homeprep.web.app", "AbC123def456GHI");
    expect(link).toBe("https://homeprep.web.app/invite/?id=AbC123def456GHI");
    expect(parseInvitationRef(link)).toBe("AbC123def456GHI");
    expect(parseInvitationRef(" AbC123def456GHI ")).toBe("AbC123def456GHI");
    expect(parseInvitationRef("https://x.test/invite/?id=../../x")).toBeNull();
    expect(parseInvitationRef("")).toBeNull();
  });

  it("shows Admin navigation only to the platform admin", () => {
    expect(navFor(false)).toEqual(NAV);
    expect(navFor(true).map((n) => n.label)).toContain("Admin");
    expect(NAV.map((n) => n.label)).not.toContain("Admin");
  });
});

describe("registration bootstrap plan", () => {
  const household = (
    id: string,
    data: Record<string, unknown>,
    members: [string, Record<string, unknown>][],
  ) => ({
    id,
    data,
    members: members.map(([mid, d]) => ({ id: mid, data: d })),
  });
  const orig = household("orig", { name: "Bauer", ownerUid: "mike" }, [
    ["mike", { role: "owner", email: "Mike@Example.test" }],
    ["kid", { role: "member", email: "kid@example.test" }],
  ]);

  it("registers an existing household with an unambiguous owner", () => {
    const plan = planBootstrap([orig], new Map());
    expect(plan.problems).toEqual([]);
    expect(plan.create).toEqual([
      {
        id: "orig",
        doc: {
          name: "Bauer",
          ownerUid: "mike",
          ownerEmail: "mike@example.test",
          invitationId: "bootstrap",
          memberCount: 2,
          status: "active",
          createdAt: SERVER_TIME,
          updatedAt: SERVER_TIME,
          lastChange: "mike",
        },
      },
    ]);
    expect(describePlan(plan)[0]).toMatch(/register orig: "Bauer"/);
  });

  it("is idempotent", () => {
    const plan = planBootstrap([orig], new Map([["orig", {}]]));
    expect(plan.create).toEqual([]);
    expect(plan.registered).toEqual(["orig"]);
  });

  it("reports ambiguous ownership instead of guessing", () => {
    const cases = [
      household("a", { name: "A" }, [["x", { role: "owner" }]]),
      household("b", { name: "B", ownerUid: "x" }, [
        ["x", { role: "owner" }],
        ["y", { role: "owner" }],
      ]),
      household("c", { name: "C", ownerUid: "x" }, [["y", { role: "owner" }]]),
      household("d", { name: "D", ownerUid: "x" }, [
        ["x", { role: "owner" }],
        ["z", { role: "admin" }],
      ]),
      household("e", { name: "E", ownerUid: "x" }, [["x", { role: "member" }]]),
    ];
    const plan = planBootstrap(cases, new Map());
    expect(plan.create).toEqual([]);
    expect(plan.problems.map((p: { id: string }) => p.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
    expect(
      describePlan(plan).every((l: string) => l.startsWith("SKIPPED")),
    ).toBe(true);
  });
});
