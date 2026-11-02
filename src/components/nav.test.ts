import { describe, expect, it } from "vitest";
import { currentNav, isActive, NAV, navFor } from "./nav";

describe("navigation config", () => {
  it("presents Budget instead of Purchases", () => {
    const labels = NAV.map((n) => n.label);
    expect(labels).toEqual([
      "Dashboard",
      "Inventory",
      "Tasks",
      "Budget",
      "Notes",
      "Library",
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

  it("adds Library at /library between Notes and Household", () => {
    const labels = NAV.map((n) => n.label);
    expect(labels.indexOf("Library")).toBe(labels.indexOf("Notes") + 1);
    expect(labels.indexOf("Household")).toBe(labels.indexOf("Library") + 1);
    expect(NAV.find((n) => n.label === "Library")?.href).toBe("/library/");
    expect(currentNav("/library")?.label).toBe("Library");
  });

  it("keeps Admin last and only for administrators", () => {
    expect(navFor(false).map((n) => n.label)).not.toContain("Admin");
    expect(navFor(true).map((n) => n.label)).toEqual([
      ...NAV.map((n) => n.label),
      "Admin",
    ]);
    expect(navFor(true).map((n) => n.label)).toContain("Library");
  });
});
