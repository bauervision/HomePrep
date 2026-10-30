import type { User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  writeBatch,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { InventoryItem, Purchase } from "./types";

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
  householdSize: number,
) {
  const firestore = db();
  const hRef = doc(collection(firestore, "households"));
  const batch = writeBatch(firestore);
  batch.set(hRef, {
    name,
    ownerUid: user.uid,
    householdSize,
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

/**
 * Marks a purchase acquired and records it in inventory exactly once: either by
 * adding the quantity to an existing item, or by creating an item whose ID is
 * derived from the purchase. The purchase is re-read inside the transaction, so a
 * second attempt (another device, double-click) is rejected.
 */
export async function acquirePurchase(
  householdId: string,
  purchaseId: string,
  target:
    | { mode: "existing"; itemId: string }
    | { mode: "new"; location: string; expiresOn: string | null },
  byName: string,
) {
  const firestore = db();
  const base = ["households", householdId] as const;
  const pRef = doc(firestore, ...base, "purchases", purchaseId);
  await runTransaction(firestore, async (tx) => {
    const pSnap = await tx.get(pRef);
    if (!pSnap.exists()) throw new Error("Purchase no longer exists.");
    const p = pSnap.data() as Omit<Purchase, "id">;
    if (p.status === "acquired" || p.inventoryItemId)
      throw new Error("Already recorded as acquired.");

    let itemId: string;
    if (target.mode === "existing") {
      const iRef = doc(firestore, ...base, "inventory", target.itemId);
      const iSnap = await tx.get(iRef);
      if (!iSnap.exists()) throw new Error("Inventory item no longer exists.");
      const cur = iSnap.data() as InventoryItem;
      tx.update(iRef, {
        quantity: (cur.quantity ?? 0) + p.quantity,
        updatedAt: serverTimestamp(),
        updatedByName: byName,
      });
      itemId = target.itemId;
    } else {
      itemId = `purchase-${purchaseId}`;
      const iRef = doc(firestore, ...base, "inventory", itemId);
      if ((await tx.get(iRef)).exists())
        throw new Error("Already recorded in inventory.");
      tx.set(iRef, {
        name: p.name,
        category: p.category,
        quantity: p.quantity,
        unit: p.unit,
        location: target.location,
        expiresOn: target.expiresOn,
        notes: "",
        sourcePurchaseId: purchaseId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedByName: byName,
      });
    }
    tx.update(pRef, {
      status: "acquired",
      inventoryItemId: itemId,
      acquiredAt: serverTimestamp(),
      acquiredByName: byName,
    });
  });
}
