import { describe, expect, it } from "vitest";
import { currentNav, isActive, NAV } from "./nav";

describe("navigation config", () => {
  it("presents Budget instead of Purchases", () => {
    const labels = NAV.map((n) => n.label);
    expect(labels).toEqual([
      "Dashboard",
      "Inventory",
      "Tasks",
      "Budget",
      "Notes",
      "Household",
    ]);
    expect(labels).not.toContain("Purchases");
  });

  it("keeps the /purchases route for compatibility", () => {
    expect(NAV.find((n) => n.label === "Budget")?.href).toBe("/purchases/");
    expect(currentNav("/purchases")?.label).toBe("Budget");
    expect(currentNav("/purchases/")?.label).toBe("Budget");
  });

  it("matches routes with or without a trailing slash", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/inventory", "/inventory/")).toBe(true);
    expect(isActive("/inventory/", "/tasks/")).toBe(false);
    expect(currentNav("/unknown")).toBeUndefined();
  });

  it("adds Notes at /notes between Budget and Household", () => {
    expect(NAV.find((n) => n.label === "Notes")?.href).toBe("/notes/");
    expect(currentNav("/notes")?.label).toBe("Notes");
  });
});
