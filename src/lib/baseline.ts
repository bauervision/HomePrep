import type { QuantityRequirementId, RequirementBasis } from "./requirements";
import type { Category, MilestoneKey } from "./types";

/*
 * Baseline preparedness requirements
 * ----------------------------------
 * System recommendations are defined only here, versioned, and never copied
 * into household documents. Households store overrides, custom requirements,
 * applicability decisions and completion evidence (lib/checklist.ts).
 *
 * Every requirement cites the sources it relies on and states how directly
 * they support it (EvidenceClass). Wording follows the sources: where a source
 * says "consider", the requirement does not claim an agency requires it, and
 * no quantity is set where the source sets none.
 */

/** Bump when definitions change in a way households should re-review. */
export const BASELINE_VERSION = 1;

/** Date the official pages below were last read and checked. */
export const SOURCES_REVIEWED = "2026-10-31";

/** Future Library contributions add "technical" and "book" sources. */
export type SourceKind = "government" | "technical" | "book";

export interface SourceRef {
  title: string;
  publisher: string;
  url: string;
  kind: SourceKind;
  /** "Last updated" date shown on the page, if any (YYYY-MM-DD). */
  pageDate: string | null;
  /** When HomePrep last checked the page against these requirements. */
  reviewed: string;
}

const gov = (
  title: string,
  publisher: string,
  url: string,
  pageDate: string | null,
): SourceRef => ({
  title,
  publisher,
  url,
  kind: "government",
  pageDate,
  reviewed: SOURCES_REVIEWED,
});

export const SOURCES = {
  readyKit: gov(
    "Build A Kit",
    "FEMA / Ready.gov",
    "https://www.ready.gov/kit",
    "2026-07-01",
  ),
  readyPlan: gov(
    "Make A Plan",
    "FEMA / Ready.gov",
    "https://www.ready.gov/plan",
    "2026-09-01",
  ),
  readyFood: gov(
    "Food",
    "FEMA / Ready.gov",
    "https://www.ready.gov/food",
    "2026-03-12",
  ),
  readyWater: gov(
    "Water",
    "FEMA / Ready.gov",
    "https://www.ready.gov/water",
    "2021-02-22",
  ),
  readyPower: gov(
    "Power Outages",
    "FEMA / Ready.gov",
    "https://www.ready.gov/power-outages",
    "2026-06-04",
  ),
  cdcWater: gov(
    "How to Create an Emergency Water Supply",
    "CDC",
    "https://www.cdc.gov/water-emergency/about/how-to-create-and-store-an-emergency-water-supply.html",
    "2025-06-27",
  ),
  cdcCo: gov(
    "Carbon Monoxide (CO) Poisoning Basics",
    "CDC",
    "https://www.cdc.gov/carbon-monoxide/",
    "2026-10-26",
  ),
} satisfies Record<string, SourceRef>;
export type SourceId = keyof typeof SOURCES;

/**
 * official   — the cited page states this guidance directly.
 * derived    — a practical step HomePrep derives from the cited guidance.
 * household  — added or customized by the household.
 * unverified — not yet checked against an authoritative source.
 */
export type EvidenceClass = "official" | "derived" | "household" | "unverified";
export const EVIDENCE_LABEL: Record<EvidenceClass, string> = {
  official: "Official guidance",
  derived: "Derived from official guidance",
  household: "Household requirement",
  unverified: "Needs verification",
};

/** How a requirement can be completed. */
export type Condition =
  /** Recorded inventory reaches the household target (water, food). */
  | { kind: "quantity"; id: QuantityRequirementId }
  /**
   * A household-selected inventory record that is in stock and not expired.
   * Never inferred from the category alone; `category` only suggests items
   * and presets "Add item".
   */
  | { kind: "inventory"; category?: Category }
  /**
   * A task is complete: a starter task by seedKey, or the specific task a
   * household goal is linked to.
   */
  | { kind: "task"; seedKey: string; taskId?: undefined }
  | { kind: "task"; taskId: string; seedKey?: undefined }
  /** The household confirms it (reported, not verified). */
  | { kind: "attest" };

export interface Completion {
  /** "any": one condition suffices. "all": every condition is mandatory. */
  mode: "any" | "all";
  conditions: Condition[];
}

/**
 * core       — counts toward the goal; may be excluded only if conditional.
 * supporting — shown and tracked, does not block the goal.
 */
export type RequirementLevel = "core" | "supporting";

export interface RequirementDef {
  /** Stable ID; household records are keyed by it. Never reuse or rename. */
  id: string;
  /** Goal (essential key) this requirement belongs to. */
  goal: string;
  milestones: MilestoneKey[];
  title: string;
  explanation: string;
  action: string;
  basis: RequirementBasis;
  level: RequirementLevel;
  /**
   * Text of the condition under which this applies. Only conditional
   * requirements can be marked not applicable and leave the count.
   */
  appliesIf?: string;
  /**
   * Safety guidance: never dismissable, and its wording can't be replaced, so
   * a household edit can't weaken the warning.
   */
  safety?: true;
  completion: Completion;
  sources: SourceId[];
  evidence: EvidenceClass;
  /** Baseline version that introduced this definition. */
  since: number;
}

const ALL: MilestoneKey[] = ["72h", "7d", "30d", "60d", "90d"];
const any = (...conditions: Condition[]): Completion => ({
  mode: "any",
  conditions,
});
const attest: Condition = { kind: "attest" };
const linkFrom = (category: Category): Condition => ({
  kind: "inventory",
  category,
});
const task = (seedKey: string): Condition => ({ kind: "task", seedKey });

type Def = Omit<RequirementDef, "since" | "milestones"> & {
  milestones?: MilestoneKey[];
};
const def = (d: Def, milestones: MilestoneKey[]): RequirementDef => ({
  since: 1,
  ...d,
  milestones: d.milestones ?? milestones,
});

const WATER_FOOD: Def[] = [
  {
    id: "water.supply",
    goal: "water",
    milestones: ALL,
    title: "Store drinking and sanitation water",
    explanation:
      "At least one gallon per person per day, for drinking and sanitation. Ready.gov says “for several days”; CDC says at least 3 days and a 2-week supply if possible.",
    action:
      "Record stored water in Inventory. Volumes are converted to gallons.",
    basis: "per-person-per-day",
    level: "core",
    completion: {
      mode: "all",
      conditions: [{ kind: "quantity", id: "water" }],
    },
    sources: ["readyWater", "cdcWater"],
    evidence: "official",
  },
  {
    id: "water.storage",
    goal: "water",
    milestones: ALL,
    title: "Store water safely",
    explanation:
      "Keep commercially bottled water sealed in its original container, or use food-grade containers labeled “drinking water” with the storage date. Replace self-filled water every 6 months. Store cool, out of direct sunlight, and away from gasoline, pesticides and other toxic substances.",
    action: "Check your containers, then confirm.",
    basis: "per-household",
    level: "supporting",
    completion: any(attest),
    sources: ["cdcWater", "readyWater"],
    evidence: "official",
  },
  {
    id: "water.treatment",
    goal: "water",
    milestones: ALL,
    title: "Know how to make water safe to drink",
    explanation:
      "If stored water runs short, boil water at a rolling boil for one full minute, or disinfect it with plain household bleach as directed on the Ready.gov Water page. Filters and treatment equipment are a capability — they are never counted as stored water.",
    action:
      "Review the treatment methods, or record a filter as equipment in Inventory.",
    basis: "capability",
    level: "supporting",
    completion: any(linkFrom("Water"), attest),
    sources: ["readyWater"],
    evidence: "official",
  },
  {
    id: "water.extra",
    goal: "water",
    milestones: ALL,
    title: "Plan extra water for higher needs",
    explanation:
      "Children, nursing mothers, people who are sick, pets and hot climates may need more water; in very hot temperatures needs can double. Never ration drinking water unless authorities say to.",
    action: "Raise your household target if this applies.",
    basis: "per-household",
    level: "supporting",
    appliesIf:
      "Applies if your household includes children, nursing or pregnant members, people who are sick, pets, or you live in a hot climate.",
    completion: any(attest),
    sources: ["readyWater", "cdcWater"],
    evidence: "official",
  },
  {
    id: "food.supply",
    goal: "food",
    milestones: ALL,
    title: "Store shelf-stable food",
    explanation:
      "Ready.gov recommends at least a several-day supply of non-perishable food. HomePrep measures it as 3 meals per person per day — a planning convention, not nutritional advice.",
    action:
      "Record food in Inventory as meals, or set the meals each unit contains.",
    basis: "per-person-per-day",
    level: "core",
    completion: { mode: "all", conditions: [{ kind: "quantity", id: "food" }] },
    sources: ["readyFood", "readyKit"],
    evidence: "derived",
  },
  {
    id: "food.no-prep",
    goal: "food",
    milestones: ALL,
    title: "Choose foods that need no refrigeration or cooking",
    explanation:
      "Canned foods, dry mixes and staples that need no refrigeration, cooking, water or special preparation. Commercially canned food can be eaten from the can without warming.",
    action: "Review your food supply, then confirm.",
    basis: "per-household",
    level: "supporting",
    completion: any(attest),
    sources: ["readyFood"],
    evidence: "official",
  },
  {
    id: "food.opener",
    goal: "food",
    milestones: ALL,
    title: "Manual can opener and eating utensils",
    explanation:
      "Ready.gov lists a manual can opener in the basic kit and says to include eating utensils.",
    action: "Link the item from Inventory, or confirm you have one.",
    basis: "capability",
    level: "supporting",
    appliesIf: "Applies if your food supply includes cans without pull tabs.",
    completion: any(linkFrom("Food"), attest),
    sources: ["readyKit", "readyFood"],
    evidence: "official",
  },
  {
    id: "food.dietary",
    goal: "food",
    milestones: ALL,
    title: "Cover special dietary needs",
    explanation:
      "Remember special dietary needs, including infant formula and bottles, and pet food with extra water for pets.",
    action: "Check the supply covers everyone, then confirm.",
    basis: "per-household",
    level: "supporting",
    appliesIf:
      "Applies if anyone in your household (including infants and pets) has special dietary needs.",
    completion: any(attest),
    sources: ["readyFood", "readyKit", "readyPlan"],
    evidence: "official",
  },
];

const MEDICAL_72: Def[] = [
  {
    id: "72h.medical.first-aid",
    goal: "medical",
    title: "First aid kit",
    explanation: "A first aid kit is part of the Ready.gov basic kit.",
    action: "Link your first aid kit from Inventory, or confirm you have one.",
    basis: "capability",
    level: "core",
    completion: any(linkFrom("Medical"), attest),
    sources: ["readyKit"],
    evidence: "official",
  },
  {
    id: "72h.medical.medications",
    goal: "medical",
    title: "Necessary medications on hand",
    explanation:
      "Ready.gov suggests adding prescription and non-prescription medications, glasses and contact-lens solution based on your household’s needs. A first aid kit does not cover this.",
    action: "Review the medicines your household relies on, then confirm.",
    basis: "per-person",
    level: "core",
    appliesIf: "Applies if anyone in your household relies on medication.",
    completion: any(task("medical"), attest),
    sources: ["readyKit"],
    evidence: "official",
  },
  {
    id: "72h.medical.info",
    goal: "medical",
    title: "Medical information in your plan",
    explanation:
      "Ready.gov’s plan guidance says to include medical information in your documented household plan. Keep it with the plan, not in HomePrep.",
    action: "Add the information to your written plan, then confirm.",
    basis: "planning",
    level: "core",
    completion: any(attest),
    sources: ["readyPlan"],
    evidence: "official",
  },
  {
    id: "72h.medical.power",
    goal: "medical",
    title: "Plan for powered devices and refrigerated medicine",
    explanation:
      "Have alternate plans for refrigerating medicines or using power-dependent medical devices. Talk to your medical provider about a power outage plan.",
    action: "Make the plan with your provider, then confirm.",
    basis: "planning",
    level: "core",
    appliesIf:
      "Applies if anyone uses powered medical devices or medicine that needs refrigeration.",
    completion: any(attest),
    sources: ["readyPower"],
    evidence: "official",
  },
];

const POWER_72: Def[] = [
  {
    id: "72h.power.lighting",
    goal: "power",
    title: "Flashlights for every household member",
    explanation:
      "Ready.gov lists a flashlight in the basic kit and recommends flashlights for every household member during power outages.",
    action: "Link your flashlights from Inventory, or confirm.",
    basis: "per-person",
    level: "core",
    completion: any(linkFrom("Power"), attest),
    sources: ["readyKit", "readyPower"],
    evidence: "official",
  },
  {
    id: "72h.power.batteries",
    goal: "power",
    title: "Extra batteries",
    explanation:
      "Extra batteries are part of the basic kit. Check they fit your lights and radio. A flashlight alone does not cover this.",
    action: "Link batteries from Inventory, or confirm.",
    basis: "capability",
    level: "core",
    completion: any(linkFrom("Power"), attest),
    sources: ["readyKit"],
    evidence: "official",
  },
  {
    id: "72h.power.phone",
    goal: "power",
    title: "Phone chargers and a backup battery",
    explanation:
      "Ready.gov lists a cell phone with chargers and a backup battery, and suggests a portable charger or power bank for outages.",
    action: "Link a power bank from Inventory, or confirm.",
    basis: "capability",
    level: "core",
    completion: any(linkFrom("Power"), attest),
    sources: ["readyKit", "readyPower"],
    evidence: "official",
  },
  {
    id: "72h.power.generator",
    goal: "power",
    title: "Use backup generators safely",
    explanation:
      "Run generators only outdoors, at least 20 feet from windows, doors and attached garages — never inside a home or garage, even with doors open. Install battery or battery-backup carbon monoxide detectors.",
    action: "Confirm your setup follows this guidance.",
    basis: "capability",
    level: "core",
    appliesIf: "Applies if you would use a fuel-powered generator.",
    completion: any(attest),
    sources: ["readyPower", "cdcCo"],
    evidence: "official",
  },
];

const COMMS_72: Def[] = [
  {
    id: "72h.comms.radio",
    goal: "comms",
    title: "Battery or hand-crank radio",
    explanation:
      "Ready.gov lists a battery-powered or hand-crank radio and a NOAA Weather Radio with tone alert.",
    action: "Link your radio from Inventory, or confirm.",
    basis: "capability",
    level: "core",
    completion: any(linkFrom("Communications"), attest),
    sources: ["readyKit"],
    evidence: "official",
  },
  {
    id: "72h.comms.alerts",
    goal: "comms",
    title: "Know how you’ll receive alerts",
    explanation:
      "Ready.gov asks every household: how will we receive emergency alerts and warnings?",
    action: "Sign up for local alerts, then confirm.",
    basis: "planning",
    level: "core",
    completion: any(attest),
    sources: ["readyPlan"],
    evidence: "official",
  },
  {
    id: "72h.comms.reconnect",
    goal: "comms",
    title: "Agree how you’ll reach each other",
    explanation:
      "Know how you’ll contact one another and reconnect if separated — for example, a backup method if calls don’t go through.",
    action: "Agree on the methods with your household, then confirm.",
    basis: "planning",
    level: "core",
    completion: any(attest),
    sources: ["readyPlan"],
    evidence: "official",
  },
];

const SANITATION_72: Def[] = [
  {
    id: "72h.sanitation.supplies",
    goal: "sanitation",
    title: "Towelettes, garbage bags and plastic ties",
    explanation:
      "Ready.gov lists moist towelettes, garbage bags and plastic ties for personal sanitation. Toilet paper alone does not cover this.",
    action: "Link the supplies from Inventory, or confirm.",
    basis: "per-household",
    level: "core",
    completion: any(linkFrom("Sanitation"), attest),
    sources: ["readyKit"],
    evidence: "official",
  },
  {
    id: "72h.sanitation.hygiene",
    goal: "sanitation",
    title: "Soap, hand sanitizer and hygiene items",
    explanation:
      "Ready.gov suggests soap, hand sanitizer, disinfecting wipes, and feminine and personal hygiene items, based on your needs.",
    action: "Link the supplies from Inventory, or confirm.",
    basis: "per-household",
    level: "core",
    completion: any(linkFrom("Sanitation"), attest),
    sources: ["readyKit"],
    evidence: "official",
  },
  {
    id: "72h.sanitation.toilet",
    goal: "sanitation",
    title: "Emergency toilet plan",
    explanation:
      "A practical plan for toilet waste if toilets can’t be used — for example, lining a bucket or toilet with heavy garbage bags and sealing them with ties. HomePrep derives this from the Ready.gov kit list; follow local guidance for disposal.",
    action: "Decide on your method, then confirm.",
    basis: "planning",
    level: "core",
    appliesIf:
      "Applies if toilets could be unusable (for example, water or sewer outages).",
    completion: any(attest),
    sources: ["readyKit"],
    evidence: "derived",
  },
];

const PLAN_72: Def[] = [
  {
    id: "72h.plan.evacuation",
    goal: "plan",
    title: "Shelter plan and evacuation route",
    explanation:
      "Ready.gov asks: what is my shelter plan, and what is my evacuation route?",
    action: "Work through the plan task, or confirm.",
    basis: "planning",
    level: "core",
    completion: any(task("plan"), attest),
    sources: ["readyPlan"],
    evidence: "official",
  },
  {
    id: "72h.plan.meeting",
    goal: "plan",
    title: "Household meeting place",
    explanation:
      "Establish a family meeting place that’s familiar and easy to find.",
    action: "Choose the place with your household, then confirm.",
    basis: "planning",
    level: "core",
    completion: any(attest),
    sources: ["readyPlan"],
    evidence: "official",
  },
  {
    id: "72h.plan.contacts",
    goal: "plan",
    title: "Written contacts and household information",
    explanation:
      "Document your plan with household information, names and contacts of family members, and meeting places.",
    action: "Write the plan down (Ready.gov has a form), then confirm.",
    basis: "planning",
    level: "core",
    completion: any(attest),
    sources: ["readyPlan"],
    evidence: "official",
  },
  {
    id: "72h.plan.needs",
    goal: "plan",
    title: "Tailor the plan to your household",
    explanation:
      "Account for ages, dietary and medical needs, disabilities or access needs, languages, and pets or service animals.",
    action: "Review your household’s needs, then confirm.",
    basis: "planning",
    level: "core",
    completion: any(attest),
    sources: ["readyPlan"],
    evidence: "official",
  },
  {
    id: "72h.plan.practice",
    goal: "plan",
    title: "Practice the plan",
    explanation: "Practice your plan with your household.",
    action: "Run through it together, then confirm.",
    basis: "planning",
    level: "supporting",
    completion: any(attest),
    sources: ["readyPlan"],
    evidence: "official",
  },
  {
    id: "72h.plan.documents",
    goal: "plan",
    title: "Copies of important documents",
    explanation:
      "Ready.gov suggests copies of insurance policies, identification and bank records, saved electronically or in a waterproof, portable container.",
    action: "Gather the copies, then confirm.",
    basis: "planning",
    level: "supporting",
    completion: any(attest),
    sources: ["readyKit"],
    evidence: "official",
  },
];

const CO_WARNING =
  "Never use charcoal grills, camp stoves or other fuel-burning cooking equipment indoors, in a garage, or near windows — they produce carbon monoxide, which can kill.";

const COOKING_7: Def[] = [
  {
    id: "7d.cooking.no-cook",
    goal: "cooking",
    title: "No-cook meal option",
    explanation:
      "Keep foods that need no cooking. Commercially canned food can be eaten from the can without warming.",
    action: "Check your food supply includes no-cook meals, then confirm.",
    basis: "per-household",
    level: "core",
    completion: any(attest),
    sources: ["readyFood"],
    evidence: "official",
  },
  {
    id: "7d.cooking.method",
    goal: "cooking",
    title: "Alternative cooking method",
    explanation:
      "Ready.gov lists candle warmers, chafing dishes, fondue pots or a fireplace. Charcoal grills and camp stoves are for outdoor use only. Households don’t all need the same equipment.",
    action: "Choose a method in the cooking task, or confirm.",
    basis: "capability",
    level: "core",
    appliesIf:
      "Applies if your household would heat food rather than rely on no-cook meals.",
    completion: any(task("7d:cooking"), attest),
    sources: ["readyFood"],
    evidence: "official",
  },
  {
    id: "7d.cooking.outdoors",
    goal: "cooking",
    title: "Use fuel-burning equipment outdoors only",
    explanation: `${CO_WARNING} Keep generators, camp stoves and charcoal grills at least 20 feet from windows.`,
    action: "Confirm everyone in your household knows this.",
    basis: "capability",
    level: "core",
    safety: true,
    completion: any(attest),
    sources: ["cdcCo", "readyPower", "readyFood"],
    evidence: "official",
  },
  {
    id: "7d.cooking.co-alarm",
    goal: "cooking",
    title: "Carbon monoxide detectors",
    explanation:
      "Install battery-operated or battery-backup CO detectors near every sleeping area and on every level of your home.",
    action: "Link the detectors from Inventory, or confirm.",
    basis: "capability",
    level: "core",
    safety: true,
    completion: any(linkFrom("Safety"), attest),
    sources: ["cdcCo", "readyPower"],
    evidence: "official",
  },
  {
    id: "7d.cooking.fuel",
    goal: "cooking",
    title: "Energy or fuel for your chosen method",
    explanation:
      "If your method needs fuel or batteries, keep enough for your plan. HomePrep sets no fuel quantity. Store and use fuel only as the manufacturer’s instructions and local fire codes allow.",
    action: "Check your supply against your plan, then confirm.",
    basis: "capability",
    level: "core",
    appliesIf: "Applies if your chosen method needs fuel or batteries.",
    completion: any(attest),
    sources: ["readyFood"],
    evidence: "derived",
  },
];

const HYGIENE_7: Def[] = [
  {
    id: "7d.hygiene.supplies",
    goal: "hygiene",
    title: "A week of hygiene supplies",
    explanation:
      "Soap, hand sanitizer, disinfecting wipes, and feminine and personal hygiene items for a week. HomePrep sets no quantity; size it to your household.",
    action: "Link the supplies from Inventory, or confirm.",
    basis: "per-person",
    level: "core",
    completion: any(linkFrom("Sanitation"), task("7d:hygiene"), attest),
    sources: ["readyKit"],
    evidence: "derived",
  },
  {
    id: "7d.hygiene.waste",
    goal: "hygiene",
    title: "Waste containment and disposal",
    explanation:
      "Enough garbage bags and plastic ties to contain household and toilet waste for a week, and a plan for where it is kept until it can be collected. Toilet paper alone does not cover this.",
    action: "Decide how waste will be contained, then confirm.",
    basis: "planning",
    level: "core",
    completion: any(attest),
    sources: ["readyKit"],
    evidence: "derived",
  },
  {
    id: "7d.hygiene.water",
    goal: "hygiene",
    title: "Budget water for hygiene",
    explanation:
      "The one-gallon-per-person-per-day baseline covers drinking and sanitation, so hygiene draws on the same supply. Never ration drinking water unless authorities say to.",
    action: "Agree on how water will be used for hygiene, then confirm.",
    basis: "planning",
    level: "supporting",
    completion: any(attest),
    sources: ["readyWater", "cdcWater"],
    evidence: "derived",
  },
];

const MEDS_7: Def[] = [
  {
    id: "7d.meds.supply",
    goal: "meds",
    title: "Review a week of medication supply",
    explanation:
      "Check that each necessary medication would last the week. A first aid kit does not establish this.",
    action: "Complete the medication review task, or confirm.",
    basis: "per-person",
    level: "core",
    appliesIf: "Applies if anyone in your household relies on medication.",
    completion: any(task("7d:medication"), attest),
    sources: ["readyKit", "readyPlan"],
    evidence: "derived",
  },
  {
    id: "7d.meds.refill",
    goal: "meds",
    title: "Refill and continuity plan",
    explanation:
      "Know how you would get a new supply, and get specific guidance for medicines that are critical for life. Ready.gov says to consult your doctor or pharmacist.",
    action: "Ask your pharmacist or doctor, then confirm.",
    basis: "planning",
    level: "core",
    appliesIf: "Applies if anyone in your household relies on medication.",
    completion: any(attest),
    sources: ["readyPower", "readyPlan"],
    evidence: "derived",
  },
  {
    id: "7d.meds.storage",
    goal: "meds",
    title: "Storage needs for medicines",
    explanation:
      "If the power is out for more than a day, discard medicine that should be refrigerated unless its label says otherwise, and contact your doctor or pharmacist. Find out how long medicines can be stored at higher temperatures.",
    action: "Check labels and plan storage, then confirm.",
    basis: "planning",
    level: "core",
    appliesIf:
      "Applies if any medication needs refrigeration or temperature control.",
    completion: any(attest),
    sources: ["readyPower"],
    evidence: "official",
  },
];

const CHARGING_7: Def[] = [
  {
    id: "7d.charging.capability",
    goal: "charging",
    title: "Charge devices without grid power",
    explanation:
      "Plan for batteries and other alternative power sources, such as a portable charger or power bank. A flashlight alone does not establish charging readiness.",
    action:
      "Link a charger or power bank, complete the charging task, or confirm.",
    basis: "capability",
    level: "core",
    completion: any(linkFrom("Power"), task("7d:charging"), attest),
    sources: ["readyPower", "readyKit"],
    evidence: "official",
  },
  {
    id: "7d.charging.needs",
    goal: "charging",
    title: "Know which devices must stay powered",
    explanation:
      "Decide which phones, radios, lights and medical devices must stay charged for a week, and whether your home phone works in an outage. HomePrep sets no capacity figure.",
    action: "List the devices with your household, then confirm.",
    basis: "planning",
    level: "core",
    completion: any(attest),
    sources: ["readyPower"],
    evidence: "derived",
  },
  {
    id: "7d.charging.safety",
    goal: "charging",
    title: "Use backup power equipment safely",
    explanation:
      "Run generators only outdoors, at least 20 feet from windows, doors and attached garages, and never in a home or garage. Use battery or battery-backup CO detectors.",
    action: "Confirm your setup follows this guidance.",
    basis: "capability",
    level: "core",
    appliesIf:
      "Applies if you would use a generator or other fuel-powered equipment.",
    completion: any(attest),
    sources: ["readyPower", "cdcCo"],
    evidence: "official",
  },
];

const COMMS_7: Def[] = [
  {
    id: "7d.comms.secondary",
    goal: "comms",
    title: "A second source of emergency information",
    explanation:
      "Have more than one way to get alerts — for example, a phone plus a battery or hand-crank radio or NOAA Weather Radio.",
    action: "Link a radio, complete the communications task, or confirm.",
    basis: "capability",
    level: "core",
    completion: any(linkFrom("Communications"), task("7d:comms"), attest),
    sources: ["readyKit", "readyPlan"],
    evidence: "derived",
  },
  {
    id: "7d.comms.backup-contact",
    goal: "comms",
    title: "Backup household contact method",
    explanation:
      "Agree on a second way to reach each other if calls fail, so you can reconnect if separated.",
    action: "Agree on the method, then confirm.",
    basis: "planning",
    level: "core",
    completion: any(attest),
    sources: ["readyPlan"],
    evidence: "derived",
  },
  {
    id: "7d.comms.review",
    goal: "comms",
    title: "Review the communication plan",
    explanation:
      "Practice your plan, and re-think your needs every year as your household changes.",
    action: "Review it together, then confirm.",
    basis: "planning",
    level: "supporting",
    completion: any(attest),
    sources: ["readyPlan", "readyKit"],
    evidence: "official",
  },
];

/** The versioned system catalog. */
export const BASELINE: RequirementDef[] = [
  ...WATER_FOOD.map((d) => def(d, ALL)),
  ...[
    ...MEDICAL_72,
    ...POWER_72,
    ...COMMS_72,
    ...SANITATION_72,
    ...PLAN_72,
  ].map((d) => def(d, ["72h"])),
  ...[...COOKING_7, ...HYGIENE_7, ...MEDS_7, ...CHARGING_7, ...COMMS_7].map(
    (d) => def(d, ["7d"]),
  ),
];

export const BASELINE_BY_ID: ReadonlyMap<string, RequirementDef> = new Map(
  BASELINE.map((d) => [d.id, d]),
);

/** System requirements for one goal at one milestone, in catalog order. */
export function baselineFor(
  milestone: MilestoneKey,
  goal: string,
): RequirementDef[] {
  return BASELINE.filter(
    (d) => d.goal === goal && d.milestones.includes(milestone),
  );
}

/**
 * Goals without researched requirements yet (30–90 days) keep their starter
 * task as the single requirement, marked as needing verification.
 */
export function taskRequirement(
  milestone: MilestoneKey,
  goal: string,
  title: string,
  seedKey: string,
): RequirementDef {
  return {
    id: `${milestone}.${goal}.task`,
    goal,
    milestones: [milestone],
    title,
    explanation:
      "HomePrep’s starter task for this goal. Researched requirements for this milestone are not yet available.",
    action: "Complete the task, or confirm when done.",
    basis: "planning",
    level: "core",
    completion: any(task(seedKey), attest),
    sources: [],
    evidence: "unverified",
    since: 1,
  };
}

/** One-line purpose shown at the top of each goal. */
export const GOAL_PURPOSE: Record<string, string> = {
  water: "Safe water for drinking and sanitation when the tap may not work.",
  food: "Food your household can eat without refrigeration or a working kitchen.",
  medical: "Treat minor injuries and keep necessary care going.",
  power: "Light and power for essential devices during an outage.",
  comms: "Get emergency information and stay in touch with each other.",
  sanitation: "Stay clean and contain waste if water or sewer service fails.",
  plan: "Know where to go, how to reconnect, and what your household needs.",
  cooking: "Prepare meals safely without grid power.",
  hygiene: "Keep up hygiene and manage waste for a full week.",
  meds: "Keep necessary medication going for a full week.",
  charging: "Keep essential devices powered for a full week.",
};
