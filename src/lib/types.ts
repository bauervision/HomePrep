import type { Timestamp } from "firebase/firestore";

export const CATEGORIES = [
  "Water",
  "Food",
  "Medical",
  "Power",
  "Sanitation",
  "Communications",
  "Safety",
  "Evacuation",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const UNITS = [
  "gal",
  "qt",
  "pt",
  "L",
  "fl oz",
  "meals",
  "person-days",
  "each",
  "pack",
  "case",
  "kit",
  "box",
  "roll",
  "bottle",
  "can",
] as const;

export type MilestoneKey = "72h" | "7d" | "30d" | "60d" | "90d";

/** Optional, non-sensitive planning considerations (no medical details). */
export const CONSIDERATIONS = {
  infants: "Infants or toddlers",
  olderAdults: "Older adults",
  limitedMobility: "Limited mobility",
  poweredEquipment: "Relies on powered equipment",
} as const;
export type Consideration = keyof typeof CONSIDERATIONS;

export interface PetInfo {
  dogs: number;
  cats: number;
  other: number;
}

/** Custom household targets: milestone → requirement id → amount. */
export type TargetOverrides = Partial<
  Record<MilestoneKey, Partial<Record<string, number>>>
>;

/**
 * Household-scoped requirement data, keyed by requirement ID. System
 * definitions live in code (lib/baseline.ts); only household decisions and
 * evidence are stored. Timestamps are ISO strings (nested map values).
 */
export interface RequirementRecord {
  /** Present only on household-created requirements. */
  custom?: {
    milestone: MilestoneKey;
    goal: string;
    title: string;
    explanation: string;
    createdAt: string;
    /** Household task this goal is linked to (same household). */
    taskId?: string;
    /**
     * confirm — the household confirms it, or links an in-stock item
     * task    — done when the linked task is complete (no checkbox)
     */
    method?: "confirm" | "task";
    /** Library card this goal was drafted from (links back to it). */
    libraryEntryId?: string;
  };
  /** Household wording for a system recommendation (original kept in code). */
  text?: { title?: string; explanation?: string };
  /** Applicability decision, tracked separately from completion. */
  notApplicable?: { reason: string; at: string; by: string } | null;
  /** Household-reported completion (not independent verification). */
  confirmed?: { at: string; by: string } | null;
  /** Inventory records the household selected as evidence. */
  inventoryIds?: string[];
  /** Household notes on this requirement. */
  notes?: string;
  updatedAt: string;
}
export type RequirementState = Record<string, RequirementRecord>;

/**
 * Baseline acknowledgments, keyed by `${milestone}.${goal}`: the version of
 * the goal's recommendations the household reviewed. A version number, not a
 * flag, so a later baseline change asks for review again.
 */
export type BaselineReviews = Record<
  string,
  { version: number; at: string; by: string }
>;

export interface Household {
  id: string;
  name: string;
  ownerUid: string;
  /**
   * Total people; the value every older client reads. When `adults` and
   * `children` are present it always equals their sum (see lib/profile.ts).
   */
  householdSize: number;
  /** Profile fields (absent on households created before profile v1). */
  adults?: number;
  children?: number;
  pets?: PetInfo | null;
  considerations?: Consideration[];
  profileVersion?: number;
  targetOverrides?: TargetOverrides;
  requirementState?: RequirementState;
  baselineReviews?: BaselineReviews;
  createdAt?: Timestamp;
  /** Owner invitation the household was founded from (0.7.0 and later). */
  invitationId?: string;
  seedVersion?: number;
  /** Starter-template version applied per milestone (see lib/seed.ts). */
  seedTemplates?: Partial<Record<MilestoneKey, number>>;
}

/**
 * owner    — founded the household (Household.ownerUid); manages it and its
 *            membership, including co-owners. Exactly one; never removed.
 * co-owner — shares administration: invites members and removes members.
 * member   — uses and contributes to the household's preparedness data.
 */
export type HouseholdRole = "owner" | "co-owner" | "member";
export const ROLE_LABEL: Record<HouseholdRole, string> = {
  owner: "Owner",
  "co-owner": "Co-owner",
  member: "Member",
};

export interface Member {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  role: HouseholdRole;
  joinedAt?: Timestamp;
  /** Invitation this membership was created from (0.7.0 and later). */
  invitationId?: string;
}

export type InvitationType = "owner" | "member";
export type InvitationStatus = "pending" | "accepted" | "revoked";

/**
 * An invitation addressed to one email. Owner invitations (platform admin)
 * found a new household; member invitations (owner / co-owner) join an
 * existing one. Expiry is derived from the server-set `createdAt`.
 */
export interface Invitation {
  id: string;
  type: InvitationType;
  email: string;
  role: HouseholdRole;
  /** Target household (member); the founded household once accepted (owner). */
  householdId: string | null;
  householdName: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp | null;
  status: InvitationStatus;
  acceptedBy: string | null;
  acceptedAt: Timestamp | null;
  revokedBy: string | null;
  revokedAt: Timestamp | null;
}

/** Platform registration summary of a household (no household content). */
export interface Registration {
  id: string;
  name: string;
  ownerUid: string;
  ownerEmail: string;
  /** Owner invitation it was founded from; "bootstrap" for migrated ones. */
  invitationId: string;
  memberCount: number;
  status: "active";
  createdAt: Timestamp | null;
  updatedAt?: Timestamp | null;
  lastChange?: string;
}

export interface AuditEntry {
  id: string;
  action: "created" | "revoked" | "accepted";
  invitationId: string;
  email: string;
  householdId: string | null;
  actorUid: string;
  at: Timestamp | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: Category;
  quantity: number;
  unit: string;
  location: string;
  expiresOn: string | null; // YYYY-MM-DD
  notes: string;
  /** What ONE unit contains, for packaged goods (absent on older records). */
  contains?: { amount: number; unit: string } | null;
  /** "equipment" = capability (e.g. water filter), not stored supply. */
  readinessRole?: "supply" | "equipment";
  sourcePurchaseId?: string;
  updatedAt?: Timestamp;
  updatedByName?: string;
}

export type TaskStatus = "todo" | "in_progress" | "complete";
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  complete: "Complete",
};

export type Priority = 1 | 2 | 3;
export const PRIORITY_LABEL: Record<Priority, string> = {
  1: "High",
  2: "Medium",
  3: "Low",
};

export interface Task {
  id: string;
  title: string;
  notes: string;
  category: Category;
  milestone: MilestoneKey;
  priority: Priority;
  status: TaskStatus;
  seedKey?: string;
  /** Starter template this task came from, and that template's version. */
  templateId?: string;
  templateVersion?: number;
  /** Note this task was created from, if any (may point to a deleted note). */
  sourceNoteId?: string;
  /** Library card this task was drafted from (links back to it). */
  libraryEntryId?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type PurchaseStatus = "proposed" | "approved" | "acquired";
export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  proposed: "Proposed",
  approved: "Approved",
  acquired: "Acquired",
};

export interface Purchase {
  id: string;
  name: string;
  category: Category;
  quantity: number;
  unit: string;
  estimatedPrice: number | null; // per unit, USD
  priority: Priority;
  status: PurchaseStatus;
  notes: string;
  /** Inventory record this purchase was added to (set only on confirmed transfer). */
  inventoryItemId?: string | null;
  acquiredAt?: Timestamp | null;
  acquiredByName?: string | null;
  createdAt?: Timestamp;
  /** Optional retailer/product page; validated http(s) URL. Absent on older records. */
  productUrl?: string | null;
  /** Total amount actually paid, integer cents. Absent/null = not recorded. */
  actualCostCents?: number | null;
}

export interface Comment {
  id: string;
  text: string;
  authorUid: string;
  authorName: string;
  createdAt?: Timestamp | null;
}

export interface Note {
  id: string;
  content: string;
  createdBy: string;
  createdByName: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  /** Tasks created from this note (IDs may refer to since-deleted tasks). */
  linkedTaskIds: string[];
}
