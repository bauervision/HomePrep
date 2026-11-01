import {
  collection,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
  writeBatch,
  updateDoc,
  type DocumentReference,
  type Firestore,
  type FirestoreError,
  type Transaction,
} from "firebase/firestore";
import { db } from "./firebase";
import { profileFields, type ProfileInput } from "./profile";
import type { HouseholdRole, Invitation } from "./types";

/*
 * Invite-only registration and household membership
 * -------------------------------------------------
 * Every write here is also enforced by firestore.rules; the checks below only
 * give clear messages. An invitation is addressed to one email and is
 * redeemed by the signed-in user whose verified Google email matches it, once,
 * within INVITATION_TTL_DAYS of its server-set creation time. The link only
 * locates the invitation: it is not a credential, and only the invited
 * identity (or whoever manages the invitation) can read it.
 */

export const INVITATION_TTL_DAYS = 7;
const TTL_MS = INVITATION_TTL_DAYS * 86_400_000;

/** The signed-in identity, as Firebase Auth reports it. */
export interface Identity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
}

export function displayNameOf(user: Pick<Identity, "displayName" | "email">) {
  return user.displayName || user.email?.split("@")[0] || "Member";
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}$/;
export const isValidEmail = (email: string) =>
  email.length <= 254 && EMAIL.test(email);

/** Path of the page that opens an invitation. */
export const invitationPath = (id: string) =>
  `/invite/?id=${encodeURIComponent(id)}`;

export const invitationLink = (origin: string, id: string) =>
  `${origin}${invitationPath(id)}`;

/** Invitation ID from a pasted link or a bare ID; null if neither. */
export function parseInvitationRef(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const id = url.searchParams.get("id");
    return id && /^[A-Za-z0-9]{10,40}$/.test(id) ? id : null;
  } catch {
    return /^[A-Za-z0-9]{10,40}$/.test(text) ? text : null;
  }
}

export const expiresAt = (inv: Pick<Invitation, "createdAt">) =>
  inv.createdAt ? inv.createdAt.toMillis() + TTL_MS : null;

export type InvitationState = "pending" | "accepted" | "expired" | "revoked";

/** Effective state: a pending invitation past its expiry is expired. */
export function invitationState(
  inv: Pick<Invitation, "status" | "createdAt">,
  now: number,
): InvitationState {
  if (inv.status !== "pending") return inv.status;
  const exp = expiresAt(inv);
  return exp !== null && exp <= now ? "expired" : "pending";
}

export const INVITATION_STATE_LABEL: Record<InvitationState, string> = {
  pending: "Pending",
  accepted: "Accepted",
  expired: "Expired",
  revoked: "Revoked",
};

export class InvitationError extends Error {}

function memberDoc(user: Identity, role: HouseholdRole, invitationId: string) {
  return {
    uid: user.uid,
    displayName: displayNameOf(user),
    email: user.email ?? "",
    photoURL: user.photoURL ?? null,
    role,
    joinedAt: serverTimestamp(),
    invitationId,
  };
}

function requireVerified(user: Identity) {
  if (!user.email || !user.emailVerified)
    throw new InvitationError(
      "Your Google account’s email address isn’t verified, so it can’t accept invitations.",
    );
  return normalizeEmail(user.email);
}

/* ---------- Creating and revoking ---------- */

interface NewInvitation {
  email: string;
  type: "owner" | "member";
  role: HouseholdRole;
  householdId?: string;
  householdName?: string;
}

/**
 * Creates an invitation and returns its ID. Owner invitations (platform
 * admin only) are recorded in the registration activity log in the same
 * batch.
 */
export async function createInvitation(
  issuer: Identity,
  input: NewInvitation,
  firestore: Firestore = db(),
) {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email))
    throw new InvitationError("Enter a valid email address.");
  if (input.type === "owner" && input.role !== "owner")
    throw new InvitationError("Owner invitations grant the owner role.");
  if (input.type === "member" && input.role === "owner")
    throw new InvitationError("A household has one owner.");
  const ref = doc(collection(firestore, "invitations"));
  const batch = writeBatch(firestore);
  batch.set(ref, {
    type: input.type,
    email,
    role: input.role,
    householdId: input.type === "member" ? input.householdId : null,
    householdName: input.type === "member" ? input.householdName : null,
    createdBy: issuer.uid,
    createdByName: displayNameOf(issuer),
    createdAt: serverTimestamp(),
    status: "pending",
    acceptedBy: null,
    acceptedAt: null,
    revokedBy: null,
    revokedAt: null,
  });
  if (input.type === "owner")
    batch.set(doc(firestore, "auditLog", `${ref.id}_created`), {
      action: "created",
      invitationId: ref.id,
      email,
      householdId: null,
      actorUid: issuer.uid,
      at: serverTimestamp(),
    });
  await batch.commit();
  return ref.id;
}

/** Revokes a pending invitation; it can no longer be redeemed. */
export async function revokeInvitation(
  issuer: Identity,
  inv: Pick<Invitation, "id" | "type" | "email">,
  firestore: Firestore = db(),
) {
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, "invitations", inv.id), {
    status: "revoked",
    revokedBy: issuer.uid,
    revokedAt: serverTimestamp(),
  });
  if (inv.type === "owner")
    batch.set(doc(firestore, "auditLog", `${inv.id}_revoked`), {
      action: "revoked",
      invitationId: inv.id,
      email: inv.email,
      householdId: null,
      actorUid: issuer.uid,
      at: serverTimestamp(),
    });
  await batch.commit();
}

/* ---------- Accepting ---------- */

/** Why an invitation can't be accepted by this user, or null if it can. */
export function acceptProblem(
  inv: Invitation,
  user: Identity,
  now: number,
): string | null {
  const state = invitationState(inv, now);
  if (state === "accepted")
    return inv.acceptedBy === user.uid
      ? "You’ve already accepted this invitation."
      : "This invitation has already been used.";
  if (state === "revoked") return "This invitation was revoked.";
  if (state === "expired")
    return "This invitation has expired. Ask for a new one.";
  if (!user.emailVerified || normalizeEmail(user.email ?? "") !== inv.email)
    return "This invitation is for a different Google account.";
  return null;
}

const ACCEPT_CONFLICT =
  "This invitation can’t be accepted any more. It may have just been used.";

/** Shown when the invitation can't be read: wrong account, or a bad link. */
export const NOT_YOURS =
  "This invitation can’t be opened with this account. It may be for a different Google account, or the link may be incomplete.";

/** Reads an invitation in a transaction, explaining a denied read. */
async function readInvitation(
  tx: Transaction,
  ref: DocumentReference,
): Promise<Invitation> {
  let snap;
  try {
    snap = await tx.get(ref);
  } catch (err) {
    if ((err as FirestoreError).code === "permission-denied")
      throw new InvitationError(NOT_YOURS);
    throw err;
  }
  if (!snap.exists()) throw new InvitationError(ACCEPT_CONFLICT);
  return { id: snap.id, ...snap.data() } as Invitation;
}

/**
 * Redeems an owner invitation: founds the household with the user as its
 * owner, its registration record and the activity entry, atomically. The
 * transaction re-reads the invitation, so two simultaneous attempts can't
 * both succeed (the rules also require it to still be pending).
 */
export async function acceptOwnerInvitation(
  user: Identity,
  invitationId: string,
  name: string,
  profile: ProfileInput,
  firestore: Firestore = db(),
) {
  const email = requireVerified(user);
  const iRef = doc(firestore, "invitations", invitationId);
  const hRef = doc(collection(firestore, "households"));
  const householdName = name.trim() || "Our Household";
  await runTransaction(firestore, async (tx) => {
    const inv = await readInvitation(tx, iRef);
    if (inv.type !== "owner")
      throw new InvitationError("This is not a household owner invitation.");
    const problem = acceptProblem(inv, user, Date.now());
    if (problem) throw new InvitationError(problem);
    tx.update(iRef, {
      status: "accepted",
      acceptedBy: user.uid,
      acceptedAt: serverTimestamp(),
      householdId: hRef.id,
    });
    tx.set(hRef, {
      name: householdName,
      ownerUid: user.uid,
      invitationId,
      ...profileFields(profile),
      createdAt: serverTimestamp(),
    });
    tx.set(
      doc(hRef, "members", user.uid),
      memberDoc(user, "owner", invitationId),
    );
    tx.set(doc(firestore, "registrations", hRef.id), {
      name: householdName,
      ownerUid: user.uid,
      ownerEmail: email,
      invitationId,
      memberCount: 1,
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastChange: user.uid,
    });
    tx.set(doc(firestore, "users", user.uid), {
      householdId: hRef.id,
      updatedAt: serverTimestamp(),
    });
    tx.set(doc(firestore, "auditLog", `${invitationId}_accepted`), {
      action: "accepted",
      invitationId,
      email,
      householdId: hRef.id,
      actorUid: user.uid,
      at: serverTimestamp(),
    });
  });
  return hRef.id;
}

/**
 * Redeems a member invitation: creates the membership in the invited role,
 * consumes the invitation and switches the user to that household,
 * atomically.
 */
export async function acceptMemberInvitation(
  user: Identity,
  invitationId: string,
  firestore: Firestore = db(),
) {
  requireVerified(user);
  const iRef = doc(firestore, "invitations", invitationId);
  return runTransaction(firestore, async (tx) => {
    const inv = await readInvitation(tx, iRef);
    if (inv.type !== "member" || !inv.householdId)
      throw new InvitationError("This is not a household member invitation.");
    const problem = acceptProblem(inv, user, Date.now());
    if (problem) throw new InvitationError(problem);
    const hid = inv.householdId;
    tx.set(
      doc(firestore, "households", hid, "members", user.uid),
      memberDoc(user, inv.role, invitationId),
    );
    tx.update(iRef, {
      status: "accepted",
      acceptedBy: user.uid,
      acceptedAt: serverTimestamp(),
    });
    tx.update(doc(firestore, "registrations", hid), {
      memberCount: increment(1),
      updatedAt: serverTimestamp(),
      lastChange: user.uid,
    });
    tx.set(doc(firestore, "users", user.uid), {
      householdId: hid,
      updatedAt: serverTimestamp(),
    });
    return hid;
  });
}

/* ---------- Membership ---------- */

/** Owner only: promote a member to co-owner, or back. */
export async function setMemberRole(
  householdId: string,
  memberUid: string,
  role: "member" | "co-owner",
  firestore: Firestore = db(),
) {
  await updateDoc(
    doc(firestore, "households", householdId, "members", memberUid),
    { role },
  );
}

/**
 * Removes a membership (or leaves, for one's own) and keeps the registration
 * member count in step. The owner can't be removed.
 */
export async function removeMember(
  householdId: string,
  memberUid: string,
  firestore: Firestore = db(),
) {
  const rRef = doc(firestore, "registrations", householdId);
  await runTransaction(firestore, async (tx) => {
    const reg = await tx.get(rRef);
    tx.delete(doc(firestore, "households", householdId, "members", memberUid));
    if (reg.exists())
      tx.update(rRef, {
        memberCount: increment(-1),
        updatedAt: serverTimestamp(),
        lastChange: memberUid,
      });
  });
}
