import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock(
  "firebase/firestore",
  async () => (await import("@/test/fake-firestore")).firestoreModule,
);
vi.mock(
  "./firebase",
  async () => (await import("@/test/fake-firestore")).firebaseModule,
);
import { fakeDb } from "@/test/fake-firestore";
import { createLibraryTask, isTaskFromCard } from "./library-tasks";
import { DEFAULT_TASK_DRAFT } from "./tasks";
import type { Task } from "./types";

const draft = {
  ...DEFAULT_TASK_DRAFT,
  title: "Keep an offline contact plan",
  notes: "Done when: everyone has a contact card.",
};
beforeEach(() => {
  fakeDb.reset();
  vi.stubGlobal("crypto", webcrypto);
});
describe("Library task identity", () => {
  it("rejects concurrent identical work despite different status, milestone and priority", async () => {
    const result = await Promise.allSettled([
      createLibraryTask("h1", "HP-C01", draft),
      createLibraryTask("h1", "HP-C01", {
        ...draft,
        milestone: "30d",
        priority: 1,
        status: "complete",
      }),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(fakeDb.list("households/h1/tasks")).toHaveLength(1);
    await expect(
      createLibraryTask("h1", "HP-C01", {
        ...draft,
        title: "Renamed contact plan",
        notes: draft.notes + "\nPriority note changed.",
      }),
    ).rejects.toThrow(/identical/);
  });
  it("keeps completed legacy records intact and permits distinct follow-ups and households", async () => {
    const legacy = {
      ...draft,
      status: "complete",
      sourceLink: "/library/?entry=HP-C01",
    };
    fakeDb.set("households/h1/tasks/old", legacy);
    await expect(createLibraryTask("h1", "HP-C01", draft)).rejects.toThrow(
      /identical/,
    );
    await createLibraryTask("h1", "HP-C01", {
      ...draft,
      notes: "Done when: school pickup contacts have tested the backup route.",
    });
    await createLibraryTask("h2", "HP-C01", draft);
    expect(fakeDb.get("households/h1/tasks/old")).toEqual(legacy);
  });
  it("matches exact stored links, never unrelated titles or foreign hosts", () => {
    expect(
      isTaskFromCard(
        { ...draft, sourceUrl: "/library/?entry=HP-C01" } as unknown as Task,
        "HP-C01",
      ),
    ).toBe(true);
    expect(isTaskFromCard({ ...draft } as Task, "HP-C01")).toBe(false);
    expect(
      isTaskFromCard({ ...draft, libraryEntryId: "HP-C02" } as Task, "HP-C01"),
    ).toBe(false);
    expect(
      isTaskFromCard(
        {
          ...draft,
          notes: "https://example.com/library/?entry=HP-C01",
        } as Task,
        "HP-C01",
      ),
    ).toBe(false);
  });
});
