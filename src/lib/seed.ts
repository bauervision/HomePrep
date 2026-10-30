import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { Category, Household, MilestoneKey, Priority } from "./types";

/*
 * Starter task templates
 * ----------------------
 * Each template has a stable task ID and a `since` version. The household
 * records which template version it has applied per milestone in
 * `seedTemplates` (legacy households carry `seedVersion: 1`, meaning the
 * 72-hour set was applied). Initialization runs in one transaction and only
 * creates templates newer than the applied version whose task document does
 * not already exist. Therefore it never:
 *   - duplicates tasks (deterministic IDs + transaction),
 *   - overwrites edited or completed tasks (existing docs are left alone),
 *   - recreates tasks a household deleted (versions already applied are skipped).
 * To add templates later: append them with `since: n + 1` and bump
 * TEMPLATE_VERSIONS for that milestone.
 */

export interface TaskTemplate {
  /** Stable Firestore task ID. */
  id: string;
  /** Stable key stored on the task as `seedKey`; essentials reference it. */
  seedKey: string;
  milestone: MilestoneKey;
  since: number;
  title: string;
  notes: string;
  category: Category;
  priority: Priority;
}

export const TEMPLATE_VERSIONS: Record<MilestoneKey, number> = {
  "72h": 1,
  "7d": 1,
  "30d": 1,
  "60d": 1,
  "90d": 1,
};

/** @deprecated legacy marker for the 72-hour set; kept for older households. */
export const SEED_VERSION = 1;

type Def = Omit<TaskTemplate, "id" | "milestone" | "since" | "seedKey"> & {
  key: string;
};

const define = (milestone: MilestoneKey, defs: Def[]): TaskTemplate[] =>
  defs.map(({ key, ...d }) =>
    milestone === "72h"
      ? // Original IDs and keys, unchanged for existing households.
        { ...d, id: `seed72-${key}`, seedKey: key, milestone, since: 1 }
      : {
          ...d,
          id: `seed${milestone}-${key}`,
          seedKey: `${milestone}:${key}`,
          milestone,
          since: 1,
        },
  );

export const TASK_TEMPLATES: TaskTemplate[] = [
  ...define("72h", [
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
  ]),
  ...define("7d", [
    {
      key: "water",
      title: "Expand potable-water storage to seven days",
      notes:
        "Grow from the 72-hour reserve to 1 gal per person per day for 7 days. The Dashboard shows the target for your household.",
      category: "Water",
      priority: 1,
    },
    {
      key: "food",
      title: "Expand shelf-stable food to seven days",
      notes:
        "Add four more days of meals beyond the 72-hour supply (3 meals per person per day). Record as meals or person-days.",
      category: "Food",
      priority: 1,
    },
    {
      key: "cooking",
      title: "Establish an emergency cooking method",
      notes:
        "Camp stove or grill with fuel for a week, used outdoors only. Include a manual can opener and matches or lighter.",
      category: "Safety",
      priority: 2,
    },
    {
      key: "hygiene",
      title: "Inventory hygiene and sanitation supplies",
      notes:
        "A week of toilet paper, wipes, soap, sanitizer, feminine products, trash bags, and toilet-bucket supplies.",
      category: "Sanitation",
      priority: 2,
    },
    {
      key: "medication",
      title: "Review medication continuity",
      notes:
        "Confirm at least a week of each prescription on hand, refill timing, and how to store medicines without power.",
      category: "Medical",
      priority: 1,
    },
    {
      key: "charging",
      title: "Establish backup charging",
      notes:
        "Power banks, solar or crank chargers, and car chargers to keep phones and radios running for a week.",
      category: "Power",
      priority: 2,
    },
    {
      key: "comms",
      title: "Verify emergency communication options",
      notes:
        "Second way to get alerts and reach family: weather radio, text-first plan, out-of-area contact, and printed numbers.",
      category: "Communications",
      priority: 2,
    },
  ]),
  ...define("30d", [
    {
      key: "filtration",
      title: "Develop a water filtration and treatment plan",
      notes:
        "Choose a filter and a backup treatment (unscented bleach or tablets), and identify nearby water sources.",
      category: "Water",
      priority: 1,
    },
    {
      key: "food",
      title: "Expand food storage to 30 days",
      notes:
        "Build from the 7-day supply toward a month of meals the household actually eats. Record as meals or person-days.",
      category: "Food",
      priority: 1,
    },
    {
      key: "rotation",
      title: "Establish food rotation procedures",
      notes:
        "First-in, first-out shelving, dated labels, and a monthly check of expiration dates.",
      category: "Food",
      priority: 2,
    },
    {
      key: "waste",
      title: "Review extended waste management",
      notes:
        "How trash and human waste would be stored and disposed of safely for a month without collection or plumbing.",
      category: "Sanitation",
      priority: 2,
    },
    {
      key: "power",
      title: "Evaluate backup power requirements",
      notes:
        "List essential loads (refrigeration, medical devices, communications) and how they'd be powered for a month.",
      category: "Power",
      priority: 2,
    },
    {
      key: "resupply",
      title: "Create an extended resupply plan",
      notes:
        "Which supplies run out first, where to restock, and how the household would get there safely.",
      category: "Evacuation",
      priority: 3,
    },
    {
      key: "medical",
      title: "Review medical supply endurance",
      notes:
        "Month-long needs for prescriptions, first-aid consumables, and over-the-counter medicines.",
      category: "Medical",
      priority: 2,
    },
  ]),
  ...define("60d", [
    {
      key: "reserves",
      title: "Expand food and water reserves to 60 days",
      notes:
        "Grow stored water and meals toward the 60-day targets on the Dashboard; combine storage with your treatment plan.",
      category: "Water",
      priority: 1,
    },
    {
      key: "maintenance",
      title: "Establish equipment maintenance routines",
      notes:
        "Schedule checks for generators, stoves, filters, lights, and radios: test runs, fuel stabilizer, spare parts.",
      category: "Power",
      priority: 2,
    },
    {
      key: "sanitation",
      title: "Evaluate sustainable sanitation options",
      notes:
        "Longer-term toilet solution, waste storage, and enough disinfectant for two months.",
      category: "Sanitation",
      priority: 2,
    },
    {
      key: "power",
      title: "Review backup power endurance",
      notes:
        "How long fuel, batteries, or solar can sustain essential loads; plan safe fuel storage and rotation.",
      category: "Power",
      priority: 2,
    },
    {
      key: "supply",
      title: "Identify alternative supply sources",
      notes:
        "Local farms, neighbors, community resources, and trade options if stores are unavailable.",
      category: "Food",
      priority: 3,
    },
    {
      key: "drill",
      title: "Conduct a household preparedness drill",
      notes:
        "Practice a power outage or evacuation: meeting points, go-bags, communications, and lessons learned.",
      category: "Evacuation",
      priority: 2,
    },
    {
      key: "seasonal",
      title: "Review seasonal supply requirements",
      notes:
        "Heating, cooling, clothing, and bedding needs for the seasons a 60-day disruption could span.",
      category: "Safety",
      priority: 3,
    },
  ]),
  ...define("90d", [
    {
      key: "reserves",
      title: "Expand food and water reserves to 90 days",
      notes:
        "Grow stored water and meals toward the 90-day targets on the Dashboard; rely on rotation to keep stock fresh.",
      category: "Food",
      priority: 1,
    },
    {
      key: "water",
      title: "Evaluate long-term water collection and filtration",
      notes:
        "Rain catchment, well or surface sources, and filtration capacity sized for three months.",
      category: "Water",
      priority: 1,
    },
    {
      key: "food-production",
      title: "Investigate food production and preservation",
      notes:
        "Garden space, seeds, canning or dehydrating, and what is realistic for your household.",
      category: "Food",
      priority: 3,
    },
    {
      key: "energy",
      title: "Develop an extended energy resilience plan",
      notes:
        "Combine solar, fuel, and conservation to cover essential loads for three months.",
      category: "Power",
      priority: 2,
    },
    {
      key: "sanitation",
      title: "Review long-term sanitation strategies",
      notes:
        "Composting or other long-term waste solutions and a three-month hygiene supply.",
      category: "Sanitation",
      priority: 2,
    },
    {
      key: "rotation",
      title: "Establish seasonal inventory rotation",
      notes:
        "A quarterly schedule to rotate food, water, batteries, fuel, and medicines.",
      category: "Food",
      priority: 2,
    },
    {
      key: "sustainability",
      title: "Evaluate household self-sufficiency opportunities",
      notes:
        "Skills, tools, and community connections that would sustain the household longer.",
      category: "Safety",
      priority: 3,
    },
  ]),
];

export type AppliedTemplates = Record<MilestoneKey, number>;

/** Template versions already applied to a household (legacy-aware). */
export function appliedTemplates(
  h: Pick<Household, "seedVersion"> & {
    seedTemplates?: Partial<AppliedTemplates>;
  },
): AppliedTemplates {
  const applied = {
    "72h": 0,
    "7d": 0,
    "30d": 0,
    "60d": 0,
    "90d": 0,
    ...h.seedTemplates,
  };
  if ((h.seedVersion ?? 0) >= 1) applied["72h"] = Math.max(applied["72h"], 1);
  return applied;
}

export function needsSeeding(
  h: Pick<Household, "seedVersion"> & {
    seedTemplates?: Partial<AppliedTemplates>;
  },
) {
  const applied = appliedTemplates(h);
  return (Object.keys(TEMPLATE_VERSIONS) as MilestoneKey[]).some(
    (m) => applied[m] < TEMPLATE_VERSIONS[m],
  );
}

/**
 * Applies any not-yet-applied starter templates to a household, atomically.
 * Safe to call repeatedly and from several devices at once. Returns the IDs of
 * tasks it created.
 */
export async function seedHousehold(householdId: string): Promise<string[]> {
  const firestore = db();
  const hRef = doc(firestore, "households", householdId);
  return runTransaction(firestore, async (tx) => {
    const h = await tx.get(hRef);
    if (!h.exists()) return [];
    const data = h.data() as Household & {
      seedTemplates?: Partial<AppliedTemplates>;
    };
    const applied = appliedTemplates(data);
    const pending = TASK_TEMPLATES.filter(
      (t) =>
        t.since > applied[t.milestone] &&
        t.since <= TEMPLATE_VERSIONS[t.milestone],
    );
    if (pending.length === 0 && !needsSeeding(data)) return [];

    // All reads before any writes.
    const refs = pending.map((t) =>
      doc(firestore, "households", householdId, "tasks", t.id),
    );
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));

    const created: string[] = [];
    pending.forEach((t, i) => {
      if (snaps[i].exists()) return; // never overwrite an existing (possibly edited) task
      tx.set(refs[i], {
        title: t.title,
        notes: t.notes,
        category: t.category,
        milestone: t.milestone,
        priority: t.priority,
        status: "todo",
        seedKey: t.seedKey,
        templateId: t.id,
        templateVersion: t.since,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      created.push(t.id);
    });

    const next = { ...applied };
    for (const m of Object.keys(TEMPLATE_VERSIONS) as MilestoneKey[]) {
      next[m] = Math.max(next[m], TEMPLATE_VERSIONS[m]);
    }
    tx.update(hRef, {
      seedTemplates: next,
      seedVersion: Math.max(data.seedVersion ?? 0, 1),
    });
    return created;
  });
}
