// @vitest-environment jsdom
/*
 * Notes: real components, hooks and services against the in-memory Firestore
 * (live listeners, transactions, failure injection). Security rules for notes
 * are verified separately against the emulator (rules-tests/, `pnpm test:rules`).
 */
import type { User } from "firebase/auth";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock(
  "firebase/firestore",
  async () => (await import("@/test/fake-firestore")).firestoreModule,
);
vi.mock(
  "@/lib/firebase",
  async () => (await import("@/test/fake-firestore")).firebaseModule,
);
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { fakeDb, firestoreModule } = await import("@/test/fake-firestore");
const { SessionContext } = await import("@/components/SessionProvider");
const { QuickNote } = await import("@/components/notes/QuickNote");
const { default: NotesPage } = await import("@/app/notes/page");
const { default: TasksPage } = await import("@/app/tasks/page");
const notes = await import("@/lib/notes");

type SessionState = import("@/components/SessionProvider").SessionState;
const ts = (ms: number) => firestoreModule.Timestamp.fromMillis(ms);

function Session({
  uid,
  hid,
  children,
}: {
  uid: string;
  hid: string;
  children: ReactNode;
}) {
  const user = {
    uid,
    email: `${uid}@example.test`,
    displayName: `Member ${uid}`,
  } as unknown as User;
  const state: SessionState = {
    status: "ready",
    user,
    household: { id: hid, name: hid, ownerUid: "u1", householdSize: 5 },
    member: {
      uid,
      displayName: uid,
      email: user.email!,
      photoURL: null,
      role: "member",
    },
    seedError: null,
  };
  return (
    <SessionContext.Provider
      value={{ state, signIn: async () => {}, signOut: async () => {} }}
    >
      {children}
    </SessionContext.Provider>
  );
}
const mount = (ui: ReactNode, uid = "u1", hid = "h1") =>
  render(
    <Session uid={uid} hid={hid}>
      {ui}
    </Session>,
  );

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement &
    Record<string, unknown>;
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
beforeEach(() => fakeDb.reset());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const NOTES = "households/h1/notes";
const notesIn = (hid = "h1") => fakeDb.list(`households/${hid}/notes`);
const tasksIn = (hid = "h1") => fakeDb.list(`households/${hid}/tasks`);
const seedNote = (
  id: string,
  content: string,
  ms: number,
  extra: Record<string, unknown> = {},
) =>
  fakeDb.set(`${NOTES}/${id}`, {
    content,
    createdBy: "u2",
    createdByName: "Member u2",
    createdAt: ts(ms),
    updatedAt: ts(ms),
    linkedTaskIds: [],
    ...extra,
  });
const dialog = () => screen.getByRole("dialog");
const type = (el: HTMLElement, value: string) =>
  fireEvent.change(el, { target: { value } });

describe("Quick Note", () => {
  it("opens with the text box focused and closes on Cancel", () => {
    mount(<QuickNote />);
    fireEvent.click(screen.getByRole("button", { name: "Quick note" }));
    expect(within(dialog()).getByText("Quick Note")).toBeTruthy();
    expect(document.activeElement).toBe(
      within(dialog()).getByLabelText("Note"),
    );
    fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(notesIn()).toHaveLength(0);
  });

  it("rejects empty or whitespace-only text", async () => {
    mount(<QuickNote />);
    fireEvent.click(screen.getByRole("button", { name: "Quick note" }));
    const box = within(dialog()).getByLabelText("Note");
    type(box, "   \n  ");
    expect(
      within(dialog())
        .getByRole("button", { name: "Save" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    });
    expect(within(dialog()).getByRole("alert").textContent).toContain(
      "Write something",
    );
    expect(notesIn()).toHaveLength(0);
  });

  it("saves text only, attributed to the author, then closes and confirms", async () => {
    mount(<QuickNote />);
    fireEvent.click(screen.getByRole("button", { name: "Quick note" }));
    type(
      within(dialog()).getByLabelText("Note"),
      "Check the generator oil.\nAlso buy a funnel.",
    );
    await act(async () => {
      fireEvent.keyDown(within(dialog()).getByLabelText("Note"), {
        key: "Enter",
        metaKey: true,
      });
    });
    await screen.findByText("Note saved");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(notesIn()).toHaveLength(1);
    expect(notesIn()[0]).toMatchObject({
      content: "Check the generator oil.\nAlso buy a funnel.",
      createdBy: "u1",
      createdByName: "Member u1",
      linkedTaskIds: [],
    });
  });

  it("keeps the dialog and text on failure, then saves exactly once on retry", async () => {
    mount(<QuickNote />);
    fireEvent.click(screen.getByRole("button", { name: "Quick note" }));
    type(within(dialog()).getByLabelText("Note"), "Rotate canned goods");
    fakeDb.failNext("commit");
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
    });
    await within(dialog()).findByText(/Note not saved/);
    expect(
      (within(dialog()).getByLabelText("Note") as HTMLTextAreaElement).value,
    ).toBe("Rotate canned goods");
    expect(notesIn()).toHaveLength(0);
    expect(screen.queryByText("Note saved")).toBeNull();

    await act(async () => {
      fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
    });
    await screen.findByText("Note saved");
    expect(notesIn()).toHaveLength(1);
  });

  it("ignores repeat submits while saving", async () => {
    mount(<QuickNote />);
    fireEvent.click(screen.getByRole("button", { name: "Quick note" }));
    type(within(dialog()).getByLabelText("Note"), "One note only");
    const save = within(dialog()).getByRole("button", { name: "Save" });
    await act(async () => {
      fireEvent.click(save);
      fireEvent.click(save);
      fireEvent.keyDown(within(dialog()).getByLabelText("Note"), {
        key: "Enter",
        ctrlKey: true,
      });
    });
    await screen.findByText("Note saved");
    expect(notesIn()).toHaveLength(1);
  });

  it("never duplicates a note when the same save is retried", async () => {
    const id = notes.newNoteId("h1");
    const author = { uid: "u1", name: "Member u1" };
    await notes.createNote("h1", id, "Same note", author);
    await notes.createNote("h1", id, "Same note", author);
    expect(notesIn()).toHaveLength(1);
  });
});

describe("Notes page", () => {
  it("shows the empty state with an Add note action", async () => {
    mount(<NotesPage />);
    expect(
      await screen.findByText(
        "No notes yet. Capture an idea whenever it comes to mind.",
      ),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Add note" }).length,
    ).toBeGreaterThan(0);
  });

  it("lists notes newest first with date and author", async () => {
    seedNote("a", "Oldest idea", 1_000_000);
    seedNote("b", "Newest idea", 3_000_000);
    seedNote("c", "Middle idea", 2_000_000);
    mount(<NotesPage />);
    const list = await screen.findByRole("list", { name: "Notes" });
    const texts = within(list)
      .getAllByText(/idea$/)
      .map((p) => p.textContent);
    expect(texts).toEqual(["Newest idea", "Middle idea", "Oldest idea"]);
    expect(within(list).getAllByText(/Member u2/).length).toBe(3);
  });

  it("searches case-insensitively and filters by task links", async () => {
    seedNote("a", "Research WATER filters", 1);
    seedNote("b", "Ask neighbors about a generator", 2, {
      linkedTaskIds: ["t1"],
    });
    mount(<NotesPage />);
    await screen.findByText("Research WATER filters");

    type(screen.getByLabelText("Search notes"), "water");
    expect(screen.getByText("Research WATER filters")).toBeTruthy();
    expect(screen.queryByText(/generator/)).toBeNull();
    type(screen.getByLabelText("Search notes"), "");

    fireEvent.click(screen.getByRole("button", { name: "Linked to tasks" }));
    expect(screen.getByText(/generator/)).toBeTruthy();
    expect(screen.queryByText("Research WATER filters")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Without tasks" }));
    expect(screen.getByText("Research WATER filters")).toBeTruthy();
    expect(screen.queryByText(/generator/)).toBeNull();

    type(screen.getByLabelText("Search notes"), "zzz");
    expect(screen.getByText("No notes match.")).toBeTruthy();
  });

  it("adds a note from the page", async () => {
    mount(<NotesPage />);
    await screen.findByText(/No notes yet/);
    fireEvent.click(screen.getAllByRole("button", { name: "Add note" })[0]);
    type(within(dialog()).getByLabelText("Note"), "Map two evacuation routes");
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
    });
    expect(await screen.findByText("Map two evacuation routes")).toBeTruthy();
  });

  it("edits content while preserving author, creation time and links", async () => {
    seedNote("a", "Draft idea", 1_000, { linkedTaskIds: ["t1"] });
    mount(<NotesPage />);
    await screen.findByText("Draft idea");
    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    const box = within(dialog()).getByLabelText("Note") as HTMLTextAreaElement;
    expect(box.value).toBe("Draft idea");
    type(box, "Refined idea");
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
    });
    await screen.findByText("Refined idea");
    const saved = fakeDb.get(`${NOTES}/a`)!;
    expect(saved).toMatchObject({
      createdBy: "u2",
      createdByName: "Member u2",
      linkedTaskIds: ["t1"],
    });
    expect((saved.createdAt as { toMillis(): number }).toMillis()).toBe(1_000);
    expect(
      (saved.updatedAt as { toMillis(): number }).toMillis(),
    ).toBeGreaterThan(1_000);
  });

  it("deletes only after confirmation and keeps linked tasks", async () => {
    fakeDb.set("households/h1/tasks/t1", {
      title: "Buy funnel",
      status: "todo",
      sourceNoteId: "a",
    });
    seedNote("a", "Funnel for fuel", 1, { linkedTaskIds: ["t1"] });
    mount(<NotesPage />);
    await screen.findByText("Funnel for fuel");

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("linked task is kept"),
    );
    expect(notesIn()).toHaveLength(1);

    confirm.mockReturnValueOnce(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    });
    await waitFor(() => expect(notesIn()).toHaveLength(0));
    expect(tasksIn()).toHaveLength(1);
  });

  it("pages large collections instead of loading everything", async () => {
    for (let i = 0; i < 60; i++) seedNote(`n${i}`, `Note number ${i}`, i);
    mount(<NotesPage />);
    const list = await screen.findByRole("list", { name: "Notes" });
    expect(within(list).getAllByRole("listitem").length).toBe(50);
    expect(screen.getByText(/searching the 50 most recent/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load older notes" }));
    });
    await waitFor(() =>
      expect(
        within(screen.getByRole("list", { name: "Notes" })).getAllByRole(
          "listitem",
        ).length,
      ).toBe(60),
    );
    expect(
      screen.queryByRole("button", { name: "Load older notes" }),
    ).toBeNull();
  });
});

describe("household sharing", () => {
  it("syncs notes live between members and isolates other households", async () => {
    seedNote("other", "Other household secret", 1);
    fakeDb.set("households/h2/notes/x", {
      content: "H2 only",
      createdAt: ts(5),
      linkedTaskIds: [],
    });
    const alice = mount(<NotesPage />, "u1", "h1");
    const bob = mount(<NotesPage />, "u2", "h1");
    const eve = mount(<NotesPage />, "u3", "h2");
    await within(bob.container).findByText("Other household secret");
    expect(await within(eve.container).findByText("H2 only")).toBeTruthy();
    expect(
      within(eve.container).queryByText("Other household secret"),
    ).toBeNull();

    // Alice adds a note; Bob sees it without reloading, Eve never does.
    await notes.createNote("h1", "live", "Shared in real time", {
      uid: "u1",
      name: "Member u1",
    });
    expect(
      await within(bob.container).findByText("Shared in real time"),
    ).toBeTruthy();
    expect(
      within(alice.container).getByText("Shared in real time"),
    ).toBeTruthy();
    expect(within(eve.container).queryByText("Shared in real time")).toBeNull();
    expect(notesIn("h2")).toHaveLength(1);
  });
});

describe("note to task", () => {
  const LONG =
    "Research long-term water storage options including barrels, bladders and rain catchment for the whole family\nCompare costs and space.";

  it("prefills the existing task form and creates nothing until confirmed", async () => {
    seedNote("a", LONG, 1);
    mount(<NotesPage />);
    await screen.findByText(/Research long-term/);
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    const d = within(dialog());
    const title = (d.getByLabelText("Task") as HTMLInputElement).value;
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(80);
    expect((d.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe(LONG);
    // Defaults are visible and editable, not silently applied.
    expect((d.getByLabelText("Status") as HTMLSelectElement).value).toBe(
      "todo",
    );
    expect((d.getByLabelText("Priority") as HTMLSelectElement).value).toBe("2");
    expect((d.getByLabelText("Milestone") as HTMLSelectElement).value).toBe(
      "72h",
    );
    expect(tasksIn()).toHaveLength(0);

    fireEvent.click(d.getByRole("button", { name: "Cancel" }));
    expect(tasksIn()).toHaveLength(0);
  });

  it("creates and links the task, keeps the note, and shows the link", async () => {
    seedNote("a", "Buy a hand-crank radio", 1);
    mount(<NotesPage />);
    await screen.findByText("Buy a hand-crank radio");
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));
    type(within(dialog()).getByLabelText("Priority"), "1");
    await act(async () => {
      fireEvent.click(
        within(dialog()).getByRole("button", { name: "Create task" }),
      );
    });
    await waitFor(() => expect(tasksIn()).toHaveLength(1));
    const task = tasksIn()[0];
    expect(task).toMatchObject({
      title: "Buy a hand-crank radio",
      notes: "Buy a hand-crank radio",
      priority: 1,
      status: "todo",
      sourceNoteId: "a",
    });
    expect(fakeDb.get(`${NOTES}/a`)!.linkedTaskIds).toEqual([task.id]);
    expect(
      screen.getByText("Buy a hand-crank radio", { selector: "p" }),
    ).toBeTruthy();
    const link = await screen.findByRole("link", {
      name: "Buy a hand-crank radio",
    });
    expect(link.getAttribute("href")).toBe(`/tasks/?task=${task.id}`);
  });

  it("prevents duplicates from retries but allows a deliberate second task", async () => {
    seedNote("a", "Stock batteries", 1);
    const draft = notes.taskDraftFromNote({ content: "Stock batteries" });
    const id1 = notes.newTaskId("h1");
    expect(await notes.createTaskFromNote("h1", "a", id1, draft)).toBe(true);
    expect(await notes.createTaskFromNote("h1", "a", id1, draft)).toBe(false); // retry
    expect(tasksIn()).toHaveLength(1);
    const id2 = notes.newTaskId("h1");
    await notes.createTaskFromNote("h1", "a", id2, {
      ...draft,
      title: "Buy AA batteries",
    });
    expect(tasksIn()).toHaveLength(2);
    expect(fakeDb.get(`${NOTES}/a`)!.linkedTaskIds).toEqual([id1, id2]);
  });

  it("ignores repeat confirms in the dialog", async () => {
    seedNote("a", "Label shelves", 1);
    mount(<NotesPage />);
    await screen.findByText("Label shelves");
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));
    const submit = within(dialog()).getByRole("button", {
      name: "Create task",
    });
    await act(async () => {
      fireEvent.click(submit);
      fireEvent.click(submit);
    });
    await waitFor(() => expect(tasksIn()).toHaveLength(1));
  });

  it("writes nothing on failure and succeeds on retry", async () => {
    seedNote("a", "Test smoke alarms", 1);
    mount(<NotesPage />);
    await screen.findByText("Test smoke alarms");
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));
    fakeDb.failNext("commit");
    await act(async () => {
      fireEvent.click(
        within(dialog()).getByRole("button", { name: "Create task" }),
      );
    });
    await within(dialog()).findByText(/Simulated Firestore failure/);
    expect(tasksIn()).toHaveLength(0);
    expect(fakeDb.get(`${NOTES}/a`)!.linkedTaskIds).toEqual([]);
    await act(async () => {
      fireEvent.click(
        within(dialog()).getByRole("button", { name: "Create task" }),
      );
    });
    await waitFor(() => expect(tasksIn()).toHaveLength(1));
    expect(fakeDb.get(`${NOTES}/a`)!.linkedTaskIds).toHaveLength(1);
  });

  it("shows removed tasks gracefully and refuses tasks for deleted notes", async () => {
    seedNote("a", "Old plan", 1, { linkedTaskIds: ["gone"] });
    mount(<NotesPage />);
    expect(await screen.findByText("Task removed")).toBeTruthy();
    await expect(
      notes.createTaskFromNote(
        "h1",
        "missing",
        "t-x",
        notes.taskDraftFromNote({ content: "x" }),
      ),
    ).rejects.toThrow("no longer exists");
    expect(tasksIn()).toHaveLength(0);
  });

  it("opens a linked task from its deep link", async () => {
    fakeDb.set("households/h1/tasks/t1", {
      title: "Inspect fire extinguisher",
      notes: "",
      category: "Safety",
      milestone: "72h",
      priority: 2,
      status: "todo",
    });
    window.history.pushState({}, "", "/tasks/?task=t1");
    mount(<TasksPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Inspect fire extinguisher/ }),
    );
    const d = await screen.findByRole("dialog");
    expect((within(d).getByLabelText("Task") as HTMLInputElement).value).toBe(
      "Inspect fire extinguisher",
    );
    window.history.pushState({}, "", "/");
  });
});

describe("taskTitleFromNote", () => {
  it("uses the first line and shortens at a word boundary", () => {
    expect(notes.taskTitleFromNote("  Short title  \nMore detail")).toBe(
      "Short title",
    );
    const t = notes.taskTitleFromNote("word ".repeat(40));
    expect(t.length).toBeLessThanOrEqual(80);
    expect(t.endsWith("…")).toBe(true);
    expect(t).not.toMatch(/\s…$/);
  });
});
