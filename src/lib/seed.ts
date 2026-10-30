import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { Category, Priority } from "./types";

export const SEED_VERSION = 1;

interface SeedTask {
  key: string;
  title: string;
  notes: string;
  category: Category;
  priority: Priority;
}

export const SEED_72H: SeedTask[] = [
  {
    key: "water",
    title: "Establish 15 gallons of potable water",
    notes:
      "1 gal per person per day × 5 people × 3 days. Store in sealed containers; record in Inventory as Water (gal).",
    category: "Water",
    priority: 1,
  },
  {
    key: "food",
    title: "Inventory 45 meals (15 person-days) of food",
    notes:
      "3 meals per person per day × 5 people × 3 days. Shelf-stable, no-cook preferred. Record as Food in meals or person-days.",
    category: "Food",
    priority: 1,
  },
  {
    key: "medical",
    title: "Review essential medications and first aid",
    notes:
      "Check prescriptions on hand, first aid kit contents, and expiration dates. Record kits and medications in Inventory.",
    category: "Medical",
    priority: 1,
  },
  {
    key: "lighting-comms",
    title: "Verify emergency lighting and communications",
    notes:
      "Test flashlights/lanterns, spare batteries, phone power banks, and a battery or crank weather radio.",
    category: "Communications",
    priority: 2,
  },
  {
    key: "sanitation",
    title: "Establish emergency sanitation supplies",
    notes:
      "Heavy-duty bags, bucket toilet, wipes, hand sanitizer, unscented bleach.",
    category: "Sanitation",
    priority: 2,
  },
  {
    key: "plan",
    title: "Create a family evacuation and communications plan",
    notes:
      "Meeting places (near home and out of area), out-of-area contact, evacuation routes, and a written contact card for each person.",
    category: "Evacuation",
    priority: 2,
  },
];

/**
 * Seeds the 72-hour task set exactly once per household. Deterministic task IDs
 * plus a version flag on the household, checked inside a transaction, make this
 * safe against concurrent sign-ins and repeated calls.
 */
export async function seedHousehold(householdId: string) {
  const firestore = db();
  const hRef = doc(firestore, "households", householdId);
  await runTransaction(firestore, async (tx) => {
    const h = await tx.get(hRef);
    if (!h.exists() || (h.data().seedVersion ?? 0) >= SEED_VERSION) return;
    for (const t of SEED_72H) {
      tx.set(
        doc(firestore, "households", householdId, "tasks", `seed72-${t.key}`),
        {
          title: t.title,
          notes: t.notes,
          category: t.category,
          milestone: "72h",
          priority: t.priority,
          status: "todo",
          seedKey: t.key,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      );
    }
    tx.update(hRef, { seedVersion: SEED_VERSION });
  });
}
