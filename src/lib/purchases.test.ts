import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryDraft } from "./inventory";
import type { InventoryItem, Purchase, Task } from "./types";

// In-memory Firestore stand-in. Transactions buffer writes and apply them only
// if the callback succeeds (all-or-nothing), matching Firestore semantics.
const h = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  written: [] as string[],
  failNextCommit: false,
}));

vi.mock("./firebase", () => ({ db: () => ({}) }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  serverTimestamp: () => "SERVER_TS",
  runTransaction: async (
    _db: unknown,
    fn: (tx: {
      get: (r: {
        path: string;
      }) => Promise<{ exists: () => boolean; data: () => unknown }>;
      set: (r: { path: string }, d: Record<string, unknown>) => void;
      update: (r: { path: string }, d: Record<string, unknown>) => void;
    }) => Promise<unknown>,
  ) => {
    const writes: (() => void)[] = [];
    const result = await fn({
      get: async (ref) => {
        const v = h.store.get(ref.path);
        return {
          exists: () => v !== undefined,
          data: () => structuredClone(v),
        };
      },
      set: (ref, d) => writes.push(() => h.store.set(ref.path, { ...d })),
      update: (ref, d) =>
        writes.push(() => {
          const cur = h.store.get(ref.path);
          if (!cur) throw new Error(`No document to update: ${ref.path}`);
          h.store.set(ref.path, { ...cur, ...d });
        }),
    });
    if (h.failNextCommit) {
      h.failNextCommit = false;
      throw new Error("Firestore unavailable");
    }
    writes.forEach((w) => w());
    return result;
  },
}));

const {
  addPurchaseToInventory,
  purchaseInventoryId,
  recordAcquisition,
  PurchaseFlowError,
} = await import("./purchases");
const { essentials72h } = await import("./readiness");

const HID = "h1";
const P = (id: string) => `households/${HID}/purchases/${id}`;
const I = (id: string) => `households/${HID}/inventory/${id}`;

function seedPurchase(id: string, p: Partial<Purchase> = {}) {
  h.store.set(P(id), {
    name: "Water jugs",
    category: "Water",
    quantity: 15,
    unit: "gal",
    estimatedPrice: 1.5,
    priority: 1,
    status: "approved",
    notes: "",
    ...p,
  });
}

function inventory(hid = HID): InventoryItem[] {
  return [...h.store.entries()]
    .filter(([k]) => k.startsWith(`households/${hid}/inventory/`))
    .map(([k, v]) => ({
      id: k.split("/").pop()!,
      ...(v as Omit<InventoryItem, "id">),
    }));
}

const draft = (d: Partial<InventoryDraft> = {}): InventoryDraft => ({
  name: "Water jugs",
  category: "Water",
  quantity: 15,
  unit: "gal",
  location: "Garage",
  expiresOn: null,
  notes: "",
  ...d,
});

const water = () =>
  essentials72h(inventory(), [] as Task[], 5, "2026-10-30")[0];

beforeEach(() => {
  h.store.clear();
  h.failNextCommit = false;
});

describe("acquisition without inventory creation", () => {
  it("marks acquired and records actual cost without touching inventory or readiness", async () => {
    seedPurchase("p1");
    await recordAcquisition(HID, "p1", {
      actualCostCents: 2399,
      byName: "Alex",
    });
    const p = h.store.get(P("p1"))!;
    expect(p.status).toBe("acquired");
    expect(p.actualCostCents).toBe(2399);
    expect(p.inventoryItemId).toBeUndefined();
    expect(inventory()).toHaveLength(0);
    expect(water().met).toBe(false); // acquisition alone never increases readiness
  });

  it("allows an unknown actual cost", async () => {
    seedPurchase("p1");
    await recordAcquisition(HID, "p1", {
      actualCostCents: null,
      byName: "Alex",
    });
    expect(h.store.get(P("p1"))!.actualCostCents).toBeNull();
  });

  it("rejects a repeated acquisition and invalid costs", async () => {
    seedPurchase("p1");
    await recordAcquisition(HID, "p1", {
      actualCostCents: 100,
      byName: "Alex",
    });
    await expect(
      recordAcquisition(HID, "p1", { actualCostCents: 999, byName: "Sam" }),
    ).rejects.toMatchObject({ code: "already-acquired" });
    expect(h.store.get(P("p1"))!.actualCostCents).toBe(100);

    seedPurchase("p2");
    await expect(
      recordAcquisition(HID, "p2", { actualCostCents: -1, byName: "Alex" }),
    ).rejects.toBeInstanceOf(PurchaseFlowError);
    await expect(
      recordAcquisition(HID, "p2", { actualCostCents: 1.5, byName: "Alex" }),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("acquisition with confirmed inventory creation", () => {
  it("requires the purchase to be acquired first", async () => {
    seedPurchase("p1");
    await expect(
      addPurchaseToInventory(
        HID,
        "p1",
        { mode: "new", draft: draft() },
        "Alex",
      ),
    ).rejects.toMatchObject({ code: "not-acquired" });
    expect(inventory()).toHaveLength(0);
  });

  it("creates one linked item from the confirmed draft and updates readiness", async () => {
    seedPurchase("p1");
    await recordAcquisition(HID, "p1", {
      actualCostCents: null,
      byName: "Alex",
    });
    expect(water().met).toBe(false);

    const id = await addPurchaseToInventory(
      HID,
      "p1",
      {
        mode: "new",
        draft: draft({ name: "  Water jugs  ", location: " Garage " }),
      },
      "Alex",
    );
    expect(id).toBe(purchaseInventoryId("p1"));
    const item = h.store.get(I(id))!;
    expect(item).toMatchObject({
      name: "Water jugs",
      location: "Garage",
      quantity: 15,
      sourcePurchaseId: "p1",
    });
    expect(h.store.get(P("p1"))!.inventoryItemId).toBe(id);
    expect(water().met).toBe(true); // 15 gal qualifies for 5 people × 3 days
  });

  it("only affects readiness when category and units qualify", async () => {
    seedPurchase("p1", { name: "Water bottles", unit: "bottle", quantity: 48 });
    await recordAcquisition(HID, "p1", {
      actualCostCents: null,
      byName: "Alex",
    });
    await addPurchaseToInventory(
      HID,
      "p1",
      {
        mode: "new",
        draft: draft({ name: "Water bottles", unit: "bottle", quantity: 48 }),
      },
      "Alex",
    );
    expect(inventory()).toHaveLength(1);
    expect(water().met).toBe(false); // bottles are not a countable water unit
  });

  it("adds to an existing item only when explicitly chosen, preserving its quantity", async () => {
    h.store.set(I("jugs"), { ...draft({ quantity: 8 }), notes: "" });
    seedPurchase("p1", { quantity: 4 });
    await recordAcquisition(HID, "p1", {
      actualCostCents: 600,
      byName: "Alex",
    });
    await addPurchaseToInventory(
      HID,
      "p1",
      { mode: "existing", itemId: "jugs" },
      "Alex",
    );
    expect(h.store.get(I("jugs"))!.quantity).toBe(12);
    expect(inventory()).toHaveLength(1);
    expect(h.store.get(P("p1"))!.inventoryItemId).toBe("jugs");
  });

  it("refuses to combine items with a different unit or category", async () => {
    h.store.set(I("bottles"), { ...draft({ unit: "bottle", quantity: 10 }) });
    seedPurchase("p1");
    await recordAcquisition(HID, "p1", {
      actualCostCents: null,
      byName: "Alex",
    });
    await expect(
      addPurchaseToInventory(
        HID,
        "p1",
        { mode: "existing", itemId: "bottles" },
        "Alex",
      ),
    ).rejects.toMatchObject({ code: "unit-mismatch" });
    expect(h.store.get(I("bottles"))!.quantity).toBe(10);
  });

  it("validates the draft before writing", async () => {
    seedPurchase("p1");
    await recordAcquisition(HID, "p1", {
      actualCostCents: null,
      byName: "Alex",
    });
    await expect(
      addPurchaseToInventory(
        HID,
        "p1",
        { mode: "new", draft: draft({ name: "  " }) },
        "Alex",
      ),
    ).rejects.toThrow("Name is required.");
    await expect(
      addPurchaseToInventory(
        HID,
        "p1",
        { mode: "new", draft: draft({ quantity: -1 }) },
        "Alex",
      ),
    ).rejects.toThrow();
    expect(inventory()).toHaveLength(0);
  });
});

describe("duplicate prevention", () => {
  it("rejects repeated transfers, including concurrent clicks", async () => {
    seedPurchase("p1");
    await recordAcquisition(HID, "p1", {
      actualCostCents: null,
      byName: "Alex",
    });
    await addPurchaseToInventory(
      HID,
      "p1",
      { mode: "new", draft: draft() },
      "Alex",
    );
    await expect(
      addPurchaseToInventory(
        HID,
        "p1",
        { mode: "new", draft: draft() },
        "Alex",
      ),
    ).rejects.toMatchObject({ code: "already-linked" });
    await expect(
      addPurchaseToInventory(
        HID,
        "p1",
        { mode: "existing", itemId: "purchase-p1" },
        "Alex",
      ),
    ).rejects.toMatchObject({ code: "already-linked" });
    expect(inventory()).toHaveLength(1);
    expect(inventory()[0].quantity).toBe(15);
  });

  it("never creates a second item when the deterministic ID already exists", async () => {
    seedPurchase("p1", { status: "acquired" });
    h.store.set(I("purchase-p1"), { ...draft(), sourcePurchaseId: "p1" }); // orphaned earlier write
    await expect(
      addPurchaseToInventory(
        HID,
        "p1",
        { mode: "new", draft: draft() },
        "Alex",
      ),
    ).rejects.toMatchObject({ code: "already-linked" });
    expect(inventory()).toHaveLength(1);
  });

  it("allows re-adding when the previously linked item was deleted", async () => {
    seedPurchase("p1", { status: "acquired", inventoryItemId: "deleted-item" });
    const id = await addPurchaseToInventory(
      HID,
      "p1",
      { mode: "new", draft: draft() },
      "Alex",
    );
    expect(h.store.get(P("p1"))!.inventoryItemId).toBe(id);
  });
});

describe("failed inventory creation and retry", () => {
  it("writes nothing on failure and succeeds on retry", async () => {
    seedPurchase("p1");
    await recordAcquisition(HID, "p1", {
      actualCostCents: null,
      byName: "Alex",
    });

    h.failNextCommit = true;
    await expect(
      addPurchaseToInventory(
        HID,
        "p1",
        { mode: "new", draft: draft() },
        "Alex",
      ),
    ).rejects.toThrow("Firestore unavailable");
    expect(inventory()).toHaveLength(0);
    expect(h.store.get(P("p1"))!.inventoryItemId).toBeUndefined();

    await addPurchaseToInventory(
      HID,
      "p1",
      { mode: "new", draft: draft() },
      "Alex",
    );
    expect(inventory()).toHaveLength(1);
    expect(h.store.get(P("p1"))!.inventoryItemId).toBe("purchase-p1");
  });
});

describe("household boundaries", () => {
  it("only reads and writes within the given household", async () => {
    h.store.set("households/h2/purchases/p9", {
      name: "Other",
      category: "Water",
      quantity: 1,
      unit: "gal",
      status: "acquired",
    });
    h.store.set("households/h2/inventory/theirs", {
      ...draft({ quantity: 3 }),
    });

    // A purchase ID from another household is not found under this household.
    await expect(
      addPurchaseToInventory(
        HID,
        "p9",
        { mode: "new", draft: draft() },
        "Alex",
      ),
    ).rejects.toMatchObject({ code: "not-found" });

    // An item ID from another household cannot be targeted.
    seedPurchase("p1", { status: "acquired" });
    await expect(
      addPurchaseToInventory(
        HID,
        "p1",
        { mode: "existing", itemId: "theirs" },
        "Alex",
      ),
    ).rejects.toMatchObject({ code: "item-missing" });
    expect(h.store.get("households/h2/inventory/theirs")!.quantity).toBe(3);
    expect(inventory("h2")).toHaveLength(1);
  });
});

describe("backward compatibility", () => {
  it("handles purchases created before productUrl/actualCostCents/inventoryItemId", async () => {
    h.store.set(P("legacy"), {
      name: "Lantern",
      category: "Power",
      quantity: 2,
      unit: "each",
      estimatedPrice: 20,
      priority: 2,
      status: "proposed",
      notes: "",
    });
    await recordAcquisition(HID, "legacy", {
      actualCostCents: null,
      byName: "Alex",
    });
    await addPurchaseToInventory(
      HID,
      "legacy",
      {
        mode: "new",
        draft: draft({
          name: "Lantern",
          category: "Power",
          unit: "each",
          quantity: 2,
        }),
      },
      "Alex",
    );
    expect(h.store.get(P("legacy"))).toMatchObject({
      status: "acquired",
      inventoryItemId: "purchase-legacy",
      estimatedPrice: 20,
    });
  });
});
