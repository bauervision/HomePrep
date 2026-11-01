/*
 * In-memory stand-in for the subset of `firebase/firestore` HomePrep uses, so
 * tests exercise the real hooks, services and pages:
 *   - live onSnapshot listeners for documents, collections and queries
 *   - transactions with buffered, all-or-nothing commits
 *   - addDoc / setDoc / updateDoc / deleteDoc / writeBatch
 *   - failure injection for the next write or commit
 * Usage in a test file:
 *   vi.mock("firebase/firestore", async () => (await import("@/test/fake-firestore")).firestoreModule);
 *   vi.mock("@/lib/firebase", async () => (await import("@/test/fake-firestore")).firebaseModule);
 */

type Data = Record<string, unknown>;

interface DocRef {
  type: "document";
  path: string;
  id: string;
}
interface ColRef {
  type: "collection";
  path: string;
  id: string;
}
interface Query {
  type: "query";
  path: string;
  orderBy: { field: string; dir: "asc" | "desc" }[];
  where: { field: string; op: string; value: unknown }[];
  limit?: number;
}
type Target = DocRef | ColRef | Query;

const DB = { fake: true };
const store = new Map<string, Data>();
const listeners = new Set<{ target: Target; emit: () => void }>();
let failNext: string | null = null;
let autoId = 0;

class FakeTimestamp {
  constructor(private ms: number) {}
  toMillis() {
    return this.ms;
  }
  valueOf() {
    return this.ms;
  }
  toDate() {
    return new Date(this.ms);
  }
  static fromMillis(ms: number) {
    return new FakeTimestamp(ms);
  }
}

/** Deep copy that keeps timestamps as timestamps (they are immutable). */
function clone<T>(v: T): T {
  if (v instanceof FakeTimestamp || v === null || typeof v !== "object")
    return v;
  if (Array.isArray(v)) return v.map(clone) as T;
  return Object.fromEntries(
    Object.entries(v as object).map(([k, x]) => [k, clone(x)]),
  ) as T;
}

const SERVER_TS = Symbol("serverTimestamp");
class Increment {
  constructor(readonly by: number) {}
}
/** Resolves sentinels; increments add to the current value. */
const resolve = (data: Data, current?: Data): Data =>
  Object.fromEntries(
    Object.entries(data).map(([k, v]) => [
      k,
      v === SERVER_TS
        ? new FakeTimestamp(Date.now())
        : v instanceof Increment
          ? (Number(current?.[k]) || 0) + v.by
          : v,
    ]),
  );

function update(path: string, data: Data) {
  const cur = store.get(path);
  if (!cur)
    throw Object.assign(new Error(`No document to update: ${path}`), {
      code: "not-found",
    });
  store.set(path, { ...cur, ...resolve(data, cur) });
}

const parentPath = (path: string) => path.split("/").slice(0, -1).join("/");
const lastSegment = (path: string) => path.split("/").pop()!;

function pathOf(parent: unknown, segments: string[]) {
  const base =
    parent && typeof parent === "object" && "path" in parent
      ? (parent as ColRef).path
      : "";
  return [base, ...segments.flatMap((s) => s.split("/"))]
    .filter(Boolean)
    .join("/");
}

function notify() {
  for (const l of [...listeners]) l.emit();
}

function consumeFailure(kind: "write" | "commit") {
  if (failNext === kind) {
    failNext = null;
    throw Object.assign(new Error("Simulated Firestore failure"), {
      code: "unavailable",
    });
  }
}

function docSnapshot(path: string) {
  const v = store.get(path);
  return {
    id: lastSegment(path),
    exists: () => v !== undefined,
    data: () => (v === undefined ? undefined : clone(v)),
    metadata: { hasPendingWrites: false, fromCache: false },
  };
}

function collectionDocs(q: Query) {
  let docs = [...store.entries()]
    .filter(([p]) => parentPath(p) === q.path)
    .map(([p, v]) => ({ id: lastSegment(p), v }));
  for (const w of q.where) {
    if (w.op === "==") docs = docs.filter((d) => d.v[w.field] === w.value);
  }
  for (const o of [...q.orderBy].reverse()) {
    docs.sort((a, b) => {
      const x = a.v[o.field] as string | number;
      const y = b.v[o.field] as string | number;
      const c = x < y ? -1 : x > y ? 1 : 0;
      return o.dir === "desc" ? -c : c;
    });
  }
  if (q.limit != null) docs = docs.slice(0, q.limit);
  return docs.map((d) => ({ id: d.id, data: () => clone(d.v) }));
}

const toQuery = (t: ColRef | Query): Query =>
  t.type === "query"
    ? t
    : { type: "query", path: t.path, orderBy: [], where: [] };

export const firestoreModule = {
  Timestamp: FakeTimestamp,
  getFirestore: () => DB,
  serverTimestamp: () => SERVER_TS,
  increment: (n: number) => new Increment(n),
  writeBatch: () => {
    const writes: (() => void)[] = [];
    const batch = {
      set: (ref: DocRef, d: Data) => {
        writes.push(() => store.set(ref.path, resolve(d)));
        return batch;
      },
      update: (ref: DocRef, d: Data) => {
        writes.push(() => update(ref.path, d));
        return batch;
      },
      delete: (ref: DocRef) => {
        writes.push(() => store.delete(ref.path));
        return batch;
      },
      commit: async () => {
        consumeFailure("commit");
        const before = new Map(store);
        try {
          writes.forEach((w) => w());
        } catch (err) {
          store.clear();
          before.forEach((v, k) => store.set(k, v));
          throw err;
        }
        notify();
      },
    };
    return batch;
  },
  collection: (parent: unknown, ...segments: string[]): ColRef => {
    const path = pathOf(parent, segments);
    return { type: "collection", path, id: lastSegment(path) };
  },
  doc: (parent: unknown, ...segments: string[]): DocRef => {
    const isCol =
      !!parent &&
      typeof parent === "object" &&
      (parent as ColRef).type === "collection";
    const path =
      isCol && segments.length === 0
        ? `${(parent as ColRef).path}/auto-${++autoId}`
        : pathOf(parent, segments);
    return { type: "document", path, id: lastSegment(path) };
  },
  orderBy: (field: string, dir: "asc" | "desc" = "asc") => ({
    kind: "orderBy",
    field,
    dir,
  }),
  limit: (n: number) => ({ kind: "limit", n }),
  where: (field: string, op: string, value: unknown) => ({
    kind: "where",
    field,
    op,
    value,
  }),
  query: (ref: ColRef | Query, ...constraints: { kind: string }[]): Query => {
    const q = toQuery(ref);
    return {
      ...q,
      orderBy: [
        ...q.orderBy,
        ...(constraints.filter(
          (c) => c.kind === "orderBy",
        ) as unknown as Query["orderBy"]),
      ],
      where: [
        ...q.where,
        ...(constraints.filter(
          (c) => c.kind === "where",
        ) as unknown as Query["where"]),
      ],
      limit:
        (
          constraints.find((c) => c.kind === "limit") as
            { n: number } | undefined
        )?.n ?? q.limit,
    };
  },
  onSnapshot: (target: Target, ...args: unknown[]) => {
    const fns = args.filter((a) => typeof a === "function") as ((
      v: unknown,
    ) => void)[];
    const [next] = fns;
    const emit = () =>
      next(
        target.type === "document"
          ? docSnapshot(target.path)
          : {
              docs: collectionDocs(toQuery(target)),
              size: collectionDocs(toQuery(target)).length,
            },
      );
    const entry = { target, emit };
    listeners.add(entry);
    queueMicrotask(() => listeners.has(entry) && emit());
    return () => listeners.delete(entry);
  },
  getDoc: async (ref: DocRef) => docSnapshot(ref.path),
  addDoc: async (col: ColRef, data: Data) => {
    consumeFailure("write");
    const ref = firestoreModule.doc(col);
    store.set(ref.path, resolve(data));
    notify();
    return ref;
  },
  setDoc: async (ref: DocRef, data: Data) => {
    consumeFailure("write");
    store.set(ref.path, resolve(data));
    notify();
  },
  updateDoc: async (ref: DocRef, data: Data) => {
    consumeFailure("write");
    update(ref.path, data);
    notify();
  },
  deleteDoc: async (ref: DocRef) => {
    consumeFailure("write");
    store.delete(ref.path);
    notify();
  },
  runTransaction: async <T>(
    _db: unknown,
    fn: (tx: {
      get: (r: DocRef) => Promise<ReturnType<typeof docSnapshot>>;
      set: (r: DocRef, d: Data) => void;
      update: (r: DocRef, d: Data) => void;
      delete: (r: DocRef) => void;
    }) => Promise<T>,
  ): Promise<T> => {
    const writes: (() => void)[] = [];
    const result = await fn({
      get: async (ref) => docSnapshot(ref.path),
      set: (ref, d) => writes.push(() => store.set(ref.path, resolve(d))),
      update: (ref, d) => writes.push(() => update(ref.path, d)),
      delete: (ref) => writes.push(() => store.delete(ref.path)),
    });
    consumeFailure("commit");
    const before = new Map(store);
    try {
      writes.forEach((w) => w());
    } catch (err) {
      store.clear();
      before.forEach((v, k) => store.set(k, v));
      throw err;
    }
    notify();
    return result;
  },
};

export const firebaseModule = {
  firebaseConfigured: true,
  db: () => DB,
  auth: () => ({}),
};

/** Test controls. */
export const fakeDb = {
  reset() {
    store.clear();
    listeners.clear();
    failNext = null;
    autoId = 0;
  },
  set(path: string, data: Data) {
    store.set(path, data);
    notify();
  },
  get(path: string) {
    return store.get(path);
  },
  remove(path: string) {
    store.delete(path);
    notify();
  },
  /** Documents directly inside a collection path. */
  list(collectionPath: string) {
    return [...store.entries()]
      .filter(([p]) => parentPath(p) === collectionPath)
      .map(([p, v]) => ({ id: lastSegment(p), ...v }));
  },
  /** Make the next write ("write") or transaction commit ("commit") fail. */
  failNext(kind: "write" | "commit") {
    failNext = kind;
  },
  listenerCount() {
    return listeners.size;
  },
};
