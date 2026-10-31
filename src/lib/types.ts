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
  createdAt?: Timestamp;
  seedVersion?: number;
  /** Starter-template version applied per milestone (see lib/seed.ts). */
  seedTemplates?: Partial<Record<MilestoneKey, number>>;
}

export interface Member {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  role: "owner" | "member";
  joinedAt?: Timestamp;
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

export interface Invite {
  id: string;
  householdId: string;
  createdBy: string;
  createdByName: string;
  createdAt?: Timestamp;
  expiresAt: Timestamp;
  usedBy: string | null;
  usedAt: Timestamp | null;
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
