import { describe, expect, it } from "vitest";
import {
  budgetSummary,
  centsToInput,
  estimatedTotalCents,
  formatCents,
  inventoryLinkState,
  parseMoneyInput,
  parseProductUrl,
  safeProductHref,
} from "./budget";
import type { Purchase } from "./types";

function purchase(p: Partial<Purchase>): Purchase {
  return {
    id: "p",
    name: "Item",
    category: "Water",
    quantity: 1,
    unit: "each",
    estimatedPrice: null,
    priority: 2,
    status: "proposed",
    notes: "",
    ...p,
  };
}

describe("product URL validation", () => {
  it("accepts http and https and stores the original string", () => {
    expect(parseProductUrl("  https://example.com/item?id=1  ")).toBe(
      "https://example.com/item?id=1",
    );
    expect(parseProductUrl("http://shop.example.org/p/42")).toBe(
      "http://shop.example.org/p/42",
    );
  });

  it("treats empty input as no link", () => {
    expect(parseProductUrl("")).toBeNull();
    expect(parseProductUrl("   ")).toBeNull();
  });

  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "ftp://example.com/file",
    "mailto:a@example.com",
    "example.com/no-scheme",
    "//example.com/protocol-relative",
    "https://",
  ])("rejects %s", (bad) => {
    expect(() => parseProductUrl(bad)).toThrow();
  });

  it("re-validates stored values at render time", () => {
    expect(safeProductHref("https://example.com")).toBe("https://example.com");
    expect(safeProductHref("javascript:alert(1)")).toBeNull();
    expect(safeProductHref(undefined)).toBeNull();
    expect(safeProductHref(42)).toBeNull();
  });
});

describe("money", () => {
  it("parses dollar input to integer cents", () => {
    expect(parseMoneyInput("24.99")).toBe(2499);
    expect(parseMoneyInput("$1,234.5")).toBe(123450);
    expect(parseMoneyInput("7")).toBe(700);
    expect(parseMoneyInput("0.10")).toBe(10);
    expect(parseMoneyInput("")).toBeNull();
  });

  it.each(["-5", "abc", "1.234", "1e3", "12..3"])("rejects %s", (bad) => {
    expect(() => parseMoneyInput(bad)).toThrow();
  });

  it("avoids floating-point drift in totals", () => {
    // 0.1 + 0.2 style errors: 3 × $0.10 must be exactly 30 cents.
    expect(estimatedTotalCents({ estimatedPrice: 0.1, quantity: 3 })).toBe(30);
    expect(estimatedTotalCents({ estimatedPrice: 19.99, quantity: 3 })).toBe(
      5997,
    );
    expect(
      estimatedTotalCents({ estimatedPrice: null, quantity: 3 }),
    ).toBeNull();
  });

  it("formats cents and round-trips edit values", () => {
    expect(formatCents(123450)).toBe("$1,234.50");
    expect(centsToInput(2499)).toBe("24.99");
    expect(centsToInput(null)).toBe("");
  });
});

describe("budgetSummary", () => {
  it("separates estimated, spent and remaining planned", () => {
    const s = budgetSummary([
      purchase({ estimatedPrice: 10, quantity: 2, status: "proposed" }), // $20 planned
      purchase({ estimatedPrice: 5.5, quantity: 1, status: "approved" }), // $5.50 planned
      purchase({
        estimatedPrice: 40,
        quantity: 1,
        status: "acquired",
        actualCostCents: 3599,
      }),
    ]);
    expect(s.estimatedCents).toBe(2000 + 550 + 4000);
    expect(s.remainingCents).toBe(2550);
    expect(s.spentCents).toBe(3599);
    expect(s.acquiredWithoutCost).toBe(0);
    expect(s.plannedCount).toBe(2);
    expect(s.acquiredCount).toBe(1);
  });

  it("never counts estimates as spending and flags missing actual cost", () => {
    const s = budgetSummary([
      purchase({ estimatedPrice: 40, quantity: 1, status: "acquired" }), // no actual cost
      purchase({
        estimatedPrice: 12,
        quantity: 1,
        status: "acquired",
        actualCostCents: null,
      }),
    ]);
    expect(s.spentCents).toBe(0);
    expect(s.acquiredWithoutCost).toBe(2);
    expect(s.remainingCents).toBe(0);
  });

  it("counts unpriced items separately rather than as zero-cost estimates", () => {
    const s = budgetSummary([
      purchase({ estimatedPrice: null, status: "proposed" }),
    ]);
    expect(s.unpricedCount).toBe(1);
    expect(s.remainingUnpriced).toBe(1);
    expect(s.estimatedCents).toBe(0);
  });

  it("accepts historical records without the new fields", () => {
    // Shape of a record written before productUrl/actualCostCents existed.
    const legacy = {
      id: "old",
      name: "Water jugs",
      category: "Water",
      quantity: 4,
      unit: "gal",
      estimatedPrice: 1.25,
      priority: 1,
      status: "acquired",
      notes: "",
      inventoryItemId: "purchase-old",
    } as Purchase;
    const s = budgetSummary([legacy]);
    expect(s.estimatedCents).toBe(500);
    expect(s.acquiredWithoutCost).toBe(1);
    expect(safeProductHref(legacy.productUrl)).toBeNull();
    expect(inventoryLinkState(legacy, new Set(["purchase-old"]))).toBe(
      "linked",
    );
  });
});

describe("inventoryLinkState", () => {
  const ids = new Set(["item-1"]);
  it("distinguishes planned, linked, unlinked and loading", () => {
    expect(inventoryLinkState({ status: "approved" }, ids)).toBe("planned");
    expect(
      inventoryLinkState(
        { status: "acquired", inventoryItemId: "item-1" },
        ids,
      ),
    ).toBe("linked");
    expect(inventoryLinkState({ status: "acquired" }, ids)).toBe("unlinked");
    expect(
      inventoryLinkState(
        { status: "acquired", inventoryItemId: "item-1" },
        null,
      ),
    ).toBe("unknown");
  });

  it("treats a link to a deleted inventory item as unlinked", () => {
    expect(
      inventoryLinkState({ status: "acquired", inventoryItemId: "gone" }, ids),
    ).toBe("unlinked");
  });
});
