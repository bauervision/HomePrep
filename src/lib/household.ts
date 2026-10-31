import type { User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
  writeBatch,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { profileFields, type ProfileInput } from "./profile";

const INVITE_TTL_DAYS = 7;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function displayNameOf(user: User) {
  return user.displayName || user.email?.split("@")[0] || "Member";
}

function memberDoc(user: User, role: "owner" | "member", inviteCode?: string) {
  return {
    uid: user.uid,
    displayName: displayNameOf(user),
    email: user.email ?? "",
    photoURL: user.photoURL ?? null,
    role,
    joinedAt: serverTimestamp(),
    ...(inviteCode ? { inviteCode } : {}),
  };
}

export async function createHousehold(
  user: User,
  name: string,
  profile: ProfileInput,
) {
  const fields = profileFields(profile);
  const firestore = db();
  const hRef = doc(collection(firestore, "households"));
  const batch = writeBatch(firestore);
  batch.set(hRef, {
    name,
    ownerUid: user.uid,
    ...fields,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(hRef, "members", user.uid), memberDoc(user, "owner"));
  batch.set(doc(firestore, "users", user.uid), {
    householdId: hRef.id,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  return hRef.id;
}

/** ~100 bits of randomness, grouped for readability: XXXXX-XXXXX-XXXXX-XXXXX. */
export function generateInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const chars = Array.from(
    bytes,
    (b) => CODE_ALPHABET[b % CODE_ALPHABET.length],
  ).join("");
  return chars.match(/.{5}/g)!.join("-");
}

export function normalizeInviteCode(input: string) {
  const raw = input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 20);
  return raw.length === 20 ? raw.match(/.{5}/g)!.join("-") : raw;
}

export async function createInvite(user: User, householdId: string) {
  const code = generateInviteCode();
  const expiresAt = Timestamp.fromMillis(
    Date.now() + (INVITE_TTL_DAYS * 86_400_000 - 60_000),
  );
  await setDoc(doc(db(), "invites", code), {
    householdId,
    createdBy: user.uid,
    createdByName: displayNameOf(user),
    createdAt: serverTimestamp(),
    expiresAt,
    usedBy: null,
    usedAt: null,
  });
  return code;
}

export async function revokeInvite(code: string) {
  await deleteDoc(doc(db(), "invites", code));
}

export class JoinError extends Error {}

/** Redeems a single-use invite: creates membership and consumes the invite atomically. */
export async function joinWithInvite(user: User, rawCode: string) {
  const firestore = db();
  const code = normalizeInviteCode(rawCode);
  const iRef = doc(firestore, "invites", code);
  if (!/^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/.test(code))
    throw new JoinError("That invite code is not valid.");
  // Read errors (e.g. permission-denied) propagate as genuine errors.
  const snap = await getDoc(iRef);
  if (!snap.exists()) throw new JoinError("That invite code is not valid.");
  const inv = snap.data();
  if (inv.usedBy) throw new JoinError("That invite has already been used.");
  if ((inv.expiresAt as Timestamp).toMillis() <= Date.now())
    throw new JoinError("That invite has expired. Ask for a new one.");

  const householdId = inv.householdId as string;
  const batch = writeBatch(firestore);
  batch.set(
    doc(firestore, "households", householdId, "members", user.uid),
    memberDoc(user, "member", code),
  );
  batch.update(iRef, { usedBy: user.uid, usedAt: serverTimestamp() });
  batch.set(doc(firestore, "users", user.uid), {
    householdId,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  return householdId;
}
