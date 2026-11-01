/*
 * Invite-only registration, platform administration, household membership and
 * isolation (0.7.0), against the local emulator (demo project). The library
 * functions the app uses (lib/household.ts) run here against the emulator, so
 * the tests exercise the same writes. Run with `pnpm test:rules`.
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  applyBootstrap,
  planBootstrap,
  SERVER_TIME,
} from "../scripts/registration-lib.mjs";
import {
  acceptMemberInvitation,
  acceptOwnerInvitation,
  createInvitation,
  removeMember,
  revokeInvitation,
  setMemberRole,
  type Identity,
} from "../src/lib/household";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-homeprep",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8085,
    },
  });
});
afterAll(async () => {
  await env?.cleanup();
});

/* Identities. Emails mirror the internal beta accounts' roles, not them. */
const ADMIN = { uid: "admin", email: "admin@example.test" };
const TESTER = { uid: "tester", email: "tester@example.test" };
const ALICE = { uid: "alice", email: "alice@example.test" }; // original owner
const BOB = { uid: "bob", email: "bob@example.test" }; // original member
const CAROL = { uid: "carol", email: "carol@example.test" };
const DAN = { uid: "dan", email: "dan@example.test" };

type Who = { uid: string; email: string };
const identity = (w: Who, verified = true): Identity => ({
  uid: w.uid,
  email: w.email,
  emailVerified: verified,
  displayName: w.uid,
  photoURL: null,
});
const db = (w: Who, claims: Record<string, unknown> = {}) =>
  env
    .authenticatedContext(w.uid, {
      email: w.email,
      email_verified: true,
      ...claims,
    })
    .firestore() as unknown as Firestore;
const adminDb = () => db(ADMIN, { platformAdmin: true });

const profile = {
  adults: 1,
  children: 0,
  pets: { dogs: 0, cats: 0, other: 0 },
  considerations: [],
};

/** The original household as it exists before 0.7.0 (no registration). */
async function seedOriginal() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, "households/orig"), {
      name: "Original",
      ownerUid: "alice",
      householdSize: 2,
      requirementState: { "72h.plan.meeting": { updatedAt: "x" } },
    });
    await setDoc(doc(d, "households/orig/members/alice"), {
      uid: "alice",
      displayName: "Alice",
      email: "Alice@Example.test",
      photoURL: null,
      role: "owner",
    });
    await setDoc(doc(d, "households/orig/members/bob"), {
      uid: "bob",
      displayName: "Bob",
      email: "bob@example.test",
      photoURL: null,
      role: "member",
      inviteCode: "OLD",
    });
    await setDoc(doc(d, "households/orig/inventory/tp"), {
      name: "Bulk TP",
      quantity: 240,
    });
    await setDoc(doc(d, "households/orig/notes/n1"), { content: "Private" });
    await setDoc(doc(d, "users/alice"), { householdId: "orig" });
    await setDoc(doc(d, "users/bob"), { householdId: "orig" });
  });
}

/** Runs the bootstrap migration with the emulator's privileged access. */
async function bootstrap() {
  let created = 0;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    const hs = await getDocs(collection(d, "households"));
    const households = [];
    for (const h of hs.docs) {
      const ms = await getDocs(collection(d, `households/${h.id}/members`));
      households.push({
        id: h.id,
        data: h.data(),
        members: ms.docs.map((m) => ({ id: m.id, data: m.data() })),
      });
    }
    const regs = await getDocs(collection(d, "registrations"));
    const plan = planBootstrap(
      households,
      new Map(regs.docs.map((r) => [r.id, r.data()])),
    );
    created = await applyBootstrap(plan, (id, data) =>
      setDoc(
        doc(d, "registrations", id),
        Object.fromEntries(
          Object.entries(data).map(([k, v]) => [
            k,
            v === SERVER_TIME ? serverTimestamp() : v,
          ]),
        ),
      ),
    );
  });
  return created;
}

/** Admin invites the tester; tester founds "Test" household. */
async function testerHousehold() {
  const inv = await createInvitation(
    identity(ADMIN),
    {
      type: "owner",
      email: TESTER.email,
      role: "owner",
    },
    adminDb(),
  );
  const hid = await acceptOwnerInvitation(
    identity(TESTER),
    inv,
    "Test",
    profile,
    db(TESTER),
  );
  return { inv, hid };
}

/** Runs a privileged read (rules disabled) and returns its result. */
async function privileged<T>(fn: (d: Firestore) => Promise<T>): Promise<T> {
  let out: T;
  await env.withSecurityRulesDisabled(async (ctx) => {
    out = await fn(ctx.firestore() as unknown as Firestore);
  });
  return out!;
}
const read = (path: string) =>
  privileged(async (d) => (await getDoc(doc(d, path))).data());
const count = (path: string) =>
  privileged(async (d) => (await getDocs(collection(d, path))).size);

/**
 * The writes acceptOwnerInvitation makes, without its client-side checks, so
 * the rules alone decide.
 */
function rawAcceptOwner(who: Who, inv: string, d = db(who)) {
  const b = writeBatch(d);
  const h = doc(collection(d, "households"));
  b.update(doc(d, `invitations/${inv}`), {
    status: "accepted",
    acceptedBy: who.uid,
    acceptedAt: serverTimestamp(),
    householdId: h.id,
  });
  b.set(h, {
    name: "Raw",
    ownerUid: who.uid,
    invitationId: inv,
    householdSize: 1,
    createdAt: serverTimestamp(),
  });
  b.set(doc(h, `members/${who.uid}`), {
    uid: who.uid,
    displayName: who.uid,
    email: who.email,
    photoURL: null,
    role: "owner",
    joinedAt: serverTimestamp(),
    invitationId: inv,
  });
  b.set(doc(d, `registrations/${h.id}`), {
    name: "Raw",
    ownerUid: who.uid,
    ownerEmail: who.email,
    invitationId: inv,
    memberCount: 1,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastChange: who.uid,
  });
  b.set(doc(d, `auditLog/${inv}_accepted`), {
    action: "accepted",
    invitationId: inv,
    email: who.email,
    householdId: h.id,
    actorUid: who.uid,
    at: serverTimestamp(),
  });
  return b.commit();
}

beforeEach(async () => {
  await env.clearFirestore();
  await seedOriginal();
  await bootstrap();
});

describe("platform administrator", () => {
  it("only the custom claim grants admin access", async () => {
    const owner = {
      type: "owner",
      email: "x@example.test",
      role: "owner",
    } as const;
    await assertSucceeds(createInvitation(identity(ADMIN), owner, adminDb()));
    // Signed-in non-admin, and forged signals of admin status.
    await assertFails(createInvitation(identity(TESTER), owner, db(TESTER)));
    await assertFails(
      createInvitation(identity(TESTER), owner, db(TESTER, { admin: true })),
    );
    await assertFails(
      createInvitation(
        identity(TESTER),
        owner,
        env
          .authenticatedContext("tester", {
            email: TESTER.email,
            email_verified: false,
            platformAdmin: true,
          })
          .firestore() as unknown as Firestore,
      ),
    );
    // A Firestore role field is not admin status.
    await assertFails(
      setDoc(doc(db(TESTER), "users/tester"), {
        householdId: "orig",
        platformAdmin: true,
      }),
    );
    await assertFails(
      updateDoc(doc(db(BOB), "households/orig/members/bob"), {
        role: "owner",
      }),
    );
  });

  it("lists registrations, owner invitations and activity for admin only", async () => {
    await testerHousehold();
    const owners = query(
      collection(adminDb(), "invitations"),
      where("type", "==", "owner"),
    );
    expect((await assertSucceeds(getDocs(owners))).size).toBe(1);
    expect(
      (await assertSucceeds(getDocs(collection(adminDb(), "registrations"))))
        .size,
    ).toBe(2);
    expect(
      (await assertSucceeds(getDocs(collection(adminDb(), "auditLog")))).docs
        .map((d) => d.data().action)
        .sort(),
    ).toEqual(["accepted", "created"]);
    for (const who of [TESTER, ALICE]) {
      await assertFails(
        getDocs(
          query(
            collection(db(who), "invitations"),
            where("type", "==", "owner"),
          ),
        ),
      );
      await assertFails(getDocs(collection(db(who), "registrations")));
      await assertFails(getDocs(collection(db(who), "auditLog")));
    }
  });

  it("gives the admin no access to household content", async () => {
    const { hid } = await testerHousehold();
    for (const path of [
      `households/${hid}`,
      `households/${hid}/members/tester`,
      "households/orig",
      "households/orig/inventory/tp",
      "households/orig/notes/n1",
    ])
      await assertFails(getDoc(doc(adminDb(), path)));
    await assertFails(
      getDocs(collection(adminDb(), `households/${hid}/inventory`)),
    );
  });
});

describe("household creation", () => {
  it("is denied without an accepted owner invitation", async () => {
    const d = db(CAROL);
    const plain = writeBatch(d);
    plain.set(doc(d, "households/h9"), {
      name: "Mine",
      ownerUid: "carol",
      householdSize: 1,
    });
    plain.set(doc(d, "households/h9/members/carol"), {
      uid: "carol",
      displayName: "Carol",
      email: CAROL.email,
      photoURL: null,
      role: "owner",
      joinedAt: serverTimestamp(),
      invitationId: "none",
    });
    await assertFails(plain.commit());
    // Pointing at someone else's owner invitation doesn't work either.
    const inv = await createInvitation(
      identity(ADMIN),
      {
        type: "owner",
        email: TESTER.email,
        role: "owner",
      },
      adminDb(),
    );
    await assertFails(rawAcceptOwner(CAROL, inv));
  });

  it("founds a separate household from an owner invitation", async () => {
    const { inv, hid } = await testerHousehold();
    expect(await read(`invitations/${inv}`)).toMatchObject({
      status: "accepted",
      acceptedBy: "tester",
      householdId: hid,
    });
    expect(await read(`households/${hid}`)).toMatchObject({
      name: "Test",
      ownerUid: "tester",
      invitationId: inv,
    });
    expect(await read(`registrations/${hid}`)).toMatchObject({
      ownerEmail: TESTER.email,
      memberCount: 1,
      status: "active",
    });
    expect(await read("users/tester")).toMatchObject({ householdId: hid });
    // The original household is untouched.
    expect(await read("households/orig")).toMatchObject({
      name: "Original",
      ownerUid: "alice",
    });
  });
});

describe("invitations", () => {
  const ownerInvite = (email: string) =>
    createInvitation(
      identity(ADMIN),
      { type: "owner", email, role: "owner" },
      adminDb(),
    );

  it("rejects forged privileged fields at creation", async () => {
    const d = adminDb();
    const base = {
      type: "owner",
      email: "x@example.test",
      role: "owner",
      householdId: null,
      householdName: null,
      createdBy: "admin",
      createdByName: "admin",
      createdAt: serverTimestamp(),
      status: "pending",
      acceptedBy: null,
      acceptedAt: null,
      revokedBy: null,
      revokedAt: null,
    };
    const attempt = (over: object) => {
      const b = writeBatch(d);
      const ref = doc(collection(d, "invitations"));
      b.set(ref, { ...base, ...over });
      b.set(doc(d, "auditLog", `${ref.id}_created`), {
        action: "created",
        invitationId: ref.id,
        email: "x@example.test",
        householdId: null,
        actorUid: "admin",
        at: serverTimestamp(),
      });
      return b.commit();
    };
    await assertSucceeds(attempt({}));
    await assertFails(attempt({ status: "accepted" }));
    await assertFails(attempt({ acceptedBy: "tester" }));
    await assertFails(attempt({ createdAt: Timestamp.fromMillis(0) }));
    await assertFails(attempt({ createdBy: "someone" }));
    await assertFails(attempt({ email: "Not An Email" }));
  });

  it("can only be read by its invitee or whoever manages it", async () => {
    const inv = await ownerInvite(TESTER.email);
    await assertSucceeds(getDoc(doc(db(TESTER), `invitations/${inv}`)));
    await assertSucceeds(getDoc(doc(adminDb(), `invitations/${inv}`)));
    await assertFails(getDoc(doc(db(CAROL), `invitations/${inv}`)));
    // An unverified email is not the invitee.
    await assertFails(
      getDoc(
        doc(
          env
            .authenticatedContext("tester", {
              email: TESTER.email,
              email_verified: false,
            })
            .firestore() as unknown as Firestore,
          `invitations/${inv}`,
        ),
      ),
    );
  });

  it("rejects the wrong account and unverified identities", async () => {
    const inv = await ownerInvite(TESTER.email);
    await assertFails(rawAcceptOwner(CAROL, inv));
    const unverified = env
      .authenticatedContext("tester", {
        email: TESTER.email,
        email_verified: false,
      })
      .firestore() as unknown as Firestore;
    await assertFails(rawAcceptOwner(TESTER, inv, unverified));
    // The app explains instead of trying.
    await expect(
      acceptOwnerInvitation(identity(CAROL), inv, "X", profile, db(CAROL)),
    ).rejects.toThrow(/different Google account/);
    await expect(
      acceptOwnerInvitation(
        identity(TESTER, false),
        inv,
        "X",
        profile,
        db(TESTER),
      ),
    ).rejects.toThrow(/isn’t verified/);
    expect((await read(`invitations/${inv}`))?.status).toBe("pending");
    await assertSucceeds(rawAcceptOwner(TESTER, inv));
  });

  it("cannot be redeemed after revocation", async () => {
    const inv = await ownerInvite(TESTER.email);
    const data = { id: inv, type: "owner", email: TESTER.email } as const;
    // Only the admin revokes owner invitations.
    await assertFails(revokeInvitation(identity(TESTER), data, db(TESTER)));
    await assertSucceeds(revokeInvitation(identity(ADMIN), data, adminDb()));
    expect(await read(`auditLog/${inv}_revoked`)).toMatchObject({
      action: "revoked",
      actorUid: "admin",
    });
    await assertFails(rawAcceptOwner(TESTER, inv));
    await expect(
      acceptOwnerInvitation(identity(TESTER), inv, "X", profile, db(TESTER)),
    ).rejects.toThrow("This invitation was revoked.");
  });

  it("cannot be redeemed after it expires", async () => {
    const inv = await ownerInvite(TESTER.email);
    await env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), `invitations/${inv}`), {
        createdAt: Timestamp.fromMillis(Date.now() - 8 * 86_400_000),
      }),
    );
    await assertFails(rawAcceptOwner(TESTER, inv));
    await expect(
      acceptOwnerInvitation(identity(TESTER), inv, "X", profile, db(TESTER)),
    ).rejects.toThrow(/expired/);
  });

  it("cannot be redeemed twice", async () => {
    const { inv } = await testerHousehold();
    await assertFails(rawAcceptOwner(TESTER, inv));
    await expect(
      acceptOwnerInvitation(
        identity(TESTER),
        inv,
        "Again",
        profile,
        db(TESTER),
      ),
    ).rejects.toThrow(/already accepted/);
    expect(await count("registrations")).toBe(2);
  });

  it("creates one household when redeemed concurrently", async () => {
    const inv = await ownerInvite(TESTER.email);
    const results = await Promise.allSettled([
      acceptOwnerInvitation(identity(TESTER), inv, "A", profile, db(TESTER)),
      acceptOwnerInvitation(identity(TESTER), inv, "B", profile, db(TESTER)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const owned = await privileged(async (d) =>
      getDocs(
        query(collection(d, "households"), where("ownerUid", "==", "tester")),
      ),
    );
    expect(owned.size).toBe(1);
    expect(await count("registrations")).toBe(2);
  });
});

describe("household membership", () => {
  async function invite(
    from: Who,
    hid: string,
    email: string,
    role = "member",
  ) {
    const name = (await read(`households/${hid}`))!.name as string;
    return createInvitation(
      identity(from),
      {
        type: "member",
        email,
        role: role as "member" | "co-owner",
        householdId: hid,
        householdName: name,
      },
      db(from),
    );
  }

  it("lets the test owner invite a member who then joins", async () => {
    const { hid } = await testerHousehold();
    const inv = await invite(TESTER, hid, CAROL.email);
    // The invitee sees which household and role, before joining.
    const seen = await assertSucceeds(
      getDoc(doc(db(CAROL), `invitations/${inv}`)),
    );
    expect(seen.data()).toMatchObject({
      householdName: "Test",
      role: "member",
    });
    await assertSucceeds(
      acceptMemberInvitation(identity(CAROL), inv, db(CAROL)),
    );
    expect(await read(`households/${hid}/members/carol`)).toMatchObject({
      role: "member",
      invitationId: inv,
    });
    expect((await read(`registrations/${hid}`))?.memberCount).toBe(2);
    await assertSucceeds(getDoc(doc(db(CAROL), `households/${hid}`)));
    // Single use: the membership can't be created from it again.
    await removeMember(hid, "carol", db(TESTER));
    const d = db(CAROL);
    const b = writeBatch(d);
    b.set(doc(d, `households/${hid}/members/carol`), {
      uid: "carol",
      displayName: "Carol",
      email: CAROL.email,
      photoURL: null,
      role: "member",
      joinedAt: serverTimestamp(),
      invitationId: inv,
    });
    b.update(doc(d, `registrations/${hid}`), {
      memberCount: 2,
      updatedAt: serverTimestamp(),
      lastChange: "carol",
    });
    await assertFails(b.commit());
  });

  it("keeps households isolated", async () => {
    const { hid } = await testerHousehold();
    await assertFails(getDoc(doc(db(TESTER), "households/orig")));
    await assertFails(getDoc(doc(db(TESTER), "households/orig/inventory/tp")));
    await assertFails(getDocs(collection(db(TESTER), "households/orig/notes")));
    await assertFails(
      setDoc(doc(db(TESTER), "households/orig/inventory/x"), {
        name: "x",
        quantity: 1,
      }),
    );
    await assertFails(getDoc(doc(db(ALICE), `households/${hid}`)));
    await assertFails(getDoc(doc(db(BOB), `registrations/${hid}`)));
    // Invitations of another household can't be listed.
    await invite(TESTER, hid, CAROL.email);
    await assertFails(
      getDocs(
        query(
          collection(db(ALICE), "invitations"),
          where("type", "==", "member"),
          where("householdId", "==", hid),
        ),
      ),
    );
  });

  it("can't be joined by guessing the household ID", async () => {
    const { hid } = await testerHousehold();
    const d = db(CAROL);
    const member = {
      uid: "carol",
      displayName: "Carol",
      email: CAROL.email,
      photoURL: null,
      role: "member",
      joinedAt: serverTimestamp(),
      invitationId: "guess",
    };
    await assertFails(
      setDoc(doc(d, `households/${hid}/members/carol`), member),
    );
    // An invitation to another household doesn't open this one.
    const other = await invite(ALICE, "orig", CAROL.email);
    const b = writeBatch(d);
    b.set(doc(d, `households/${hid}/members/carol`), {
      ...member,
      invitationId: other,
    });
    b.update(doc(d, `invitations/${other}`), {
      status: "accepted",
      acceptedBy: "carol",
      acceptedAt: serverTimestamp(),
    });
    await assertFails(b.commit());
  });

  it("enforces who may invite, and in which role", async () => {
    const { hid } = await testerHousehold();
    // Original household: bob is a member, alice the owner (bootstrapped).
    await assertFails(invite(BOB, "orig", CAROL.email));
    await assertSucceeds(invite(ALICE, "orig", CAROL.email, "co-owner"));
    // A co-owner invites members, not co-owners.
    const co = await invite(TESTER, hid, DAN.email, "co-owner");
    await acceptMemberInvitation(identity(DAN), co, db(DAN));
    await assertSucceeds(invite(DAN, hid, CAROL.email));
    await assertFails(invite(DAN, hid, "eve@example.test", "co-owner"));
    // Nobody invites a second owner.
    await assertFails(
      setDoc(doc(collection(db(TESTER), "invitations")), {
        type: "member",
        email: CAROL.email,
        role: "owner",
        householdId: hid,
        householdName: "Test",
        createdBy: "tester",
        createdByName: "tester",
        createdAt: serverTimestamp(),
        status: "pending",
        acceptedBy: null,
        acceptedAt: null,
        revokedBy: null,
        revokedAt: null,
      }),
    );
    // Revoking member invitations: managers only.
    const pending = await invite(TESTER, hid, "eve@example.test");
    const data = {
      id: pending,
      type: "member",
      email: "eve@example.test",
    } as const;
    await assertFails(revokeInvitation(identity(ALICE), data, db(ALICE)));
    await assertSucceeds(revokeInvitation(identity(DAN), data, db(DAN)));
  });

  it("lets the owner promote and demote, and protects the owner", async () => {
    const { hid } = await testerHousehold();
    for (const w of [CAROL, DAN])
      await acceptMemberInvitation(
        identity(w),
        await invite(TESTER, hid, w.email),
        db(w),
      );
    await assertSucceeds(setMemberRole(hid, "carol", "co-owner", db(TESTER)));
    await assertSucceeds(setMemberRole(hid, "carol", "member", db(TESTER)));
    await assertSucceeds(setMemberRole(hid, "carol", "co-owner", db(TESTER)));
    // A co-owner can't change roles; nobody promotes themselves.
    await assertFails(setMemberRole(hid, "dan", "co-owner", db(CAROL)));
    await assertFails(setMemberRole(hid, "dan", "co-owner", db(DAN)));
    await assertFails(
      updateDoc(doc(db(TESTER), `households/${hid}/members/carol`), {
        role: "owner",
      }),
    );
    // The owner can't be demoted or removed (the last owner stays).
    await assertFails(
      updateDoc(doc(db(TESTER), `households/${hid}/members/tester`), {
        role: "member",
      }),
    );
    await assertFails(removeMember(hid, "tester", db(TESTER)));
    await assertFails(removeMember(hid, "tester", db(CAROL)));
  });

  it("removes members and keeps the member count in step", async () => {
    const { hid } = await testerHousehold();
    for (const w of [CAROL, DAN])
      await acceptMemberInvitation(
        identity(w),
        await invite(TESTER, hid, w.email),
        db(w),
      );
    await setMemberRole(hid, "carol", "co-owner", db(TESTER));
    expect((await read(`registrations/${hid}`))?.memberCount).toBe(3);
    // A member can't remove others; a co-owner removes members only.
    await assertFails(removeMember(hid, "carol", db(DAN)));
    await assertSucceeds(removeMember(hid, "dan", db(CAROL)));
    expect((await read(`registrations/${hid}`))?.memberCount).toBe(2);
    // The owner removes a co-owner; members may leave.
    await assertSucceeds(removeMember(hid, "carol", db(TESTER)));
    expect((await read(`registrations/${hid}`))?.memberCount).toBe(1);
    await assertFails(getDoc(doc(db(CAROL), `households/${hid}`)));
    await assertSucceeds(removeMember("orig", "bob", db(BOB)));
    expect((await read("registrations/orig"))?.memberCount).toBe(1);
  });

  it("rejects member count changes without a membership change", async () => {
    await assertFails(
      updateDoc(doc(db(ALICE), "registrations/orig"), {
        memberCount: 9,
        updatedAt: serverTimestamp(),
        lastChange: "alice",
      }),
    );
    const d = db(BOB);
    await assertFails(
      updateDoc(doc(d, "registrations/orig"), {
        memberCount: 1,
        updatedAt: serverTimestamp(),
        lastChange: "alice",
      }),
    );
    // Removing a member must move the count too.
    await assertFails(deleteDoc(doc(db(ALICE), "households/orig/members/bob")));
  });
});

describe("existing household migration", () => {
  it("registers the existing household without touching it", async () => {
    expect(await read("registrations/orig")).toMatchObject({
      name: "Original",
      ownerUid: "alice",
      ownerEmail: "alice@example.test",
      invitationId: "bootstrap",
      memberCount: 2,
      status: "active",
    });
    expect(await read("households/orig")).toEqual({
      name: "Original",
      ownerUid: "alice",
      householdSize: 2,
      requirementState: { "72h.plan.meeting": { updatedAt: "x" } },
    });
    expect(await read("households/orig/members/bob")).toMatchObject({
      role: "member",
      inviteCode: "OLD",
    });
    expect(await read("users/alice")).toEqual({ householdId: "orig" });
    // Existing members keep full access to their household.
    await assertSucceeds(getDoc(doc(db(BOB), "households/orig/inventory/tp")));
    await assertSucceeds(
      updateDoc(doc(db(BOB), "households/orig"), {
        name: "Original",
        householdSize: 2,
        baselineReviews: {
          "72h.sanitation": { version: 2, at: "x", by: "Bob" },
        },
      }),
    );
  });

  it("is idempotent and never duplicates a household", async () => {
    expect(await bootstrap()).toBe(0);
    expect(await count("households")).toBe(1);
    expect(await count("registrations")).toBe(1);
  });

  it("lets the bootstrapped owner invite family", async () => {
    const name = "Original";
    const inv = await createInvitation(
      identity(ALICE),
      {
        type: "member",
        email: CAROL.email,
        role: "member",
        householdId: "orig",
        householdName: name,
      },
      db(ALICE),
    );
    await assertSucceeds(
      acceptMemberInvitation(identity(CAROL), inv, db(CAROL)),
    );
    expect((await read("registrations/orig"))?.memberCount).toBe(3);
  });

  it("retires the old bearer invite codes", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), "invites/AAAAA-AAAAA-AAAAA-AAAAA"), {
        householdId: "orig",
        usedBy: null,
        expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000),
      }),
    );
    const d = db(CAROL);
    const b = writeBatch(d);
    b.set(doc(d, "households/orig/members/carol"), {
      uid: "carol",
      displayName: "Carol",
      email: CAROL.email,
      photoURL: null,
      role: "member",
      joinedAt: serverTimestamp(),
      inviteCode: "AAAAA-AAAAA-AAAAA-AAAAA",
    });
    b.update(doc(d, "invites/AAAAA-AAAAA-AAAAA-AAAAA"), {
      usedBy: "carol",
      usedAt: serverTimestamp(),
    });
    await assertFails(b.commit());
    await assertFails(
      setDoc(doc(db(ALICE), "invites/BBBBB-BBBBB-BBBBB-BBBBB"), {
        householdId: "orig",
      }),
    );
  });
});
