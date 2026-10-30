"use client";

import { PackageCheck, Plus, Save, Trash2 } from "lucide-react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useMemo, useState, type FormEvent } from "react";
import { Comments } from "@/components/Comments";
import { useHousehold } from "@/components/SessionProvider";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorText,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { money, sortPurchases, useInventory, usePurchases } from "@/lib/data";
import { db } from "@/lib/firebase";
import { acquirePurchase, displayNameOf } from "@/lib/household";
import {
  CATEGORIES,
  PRIORITY_LABEL,
  PURCHASE_STATUS_LABEL,
  UNITS,
  type Category,
  type Priority,
  type Purchase,
  type PurchaseStatus,
} from "@/lib/types";

type Draft = Pick<
  Purchase,
  | "name"
  | "category"
  | "quantity"
  | "unit"
  | "estimatedPrice"
  | "priority"
  | "status"
  | "notes"
>;

const PRIORITY_TONE = { 1: "bad", 2: "warn", 3: "neutral" } as const;
const STATUS_TONE = {
  proposed: "neutral",
  approved: "info",
  acquired: "good",
} as const;

function PurchaseForm({
  initial,
  onDone,
}: {
  initial: Purchase | null;
  onDone: () => void;
}) {
  const { household } = useHousehold();
  const acquired = initial?.status === "acquired";
  const [d, setD] = useState<Draft>(() =>
    initial
      ? {
          name: initial.name,
          category: initial.category,
          quantity: initial.quantity,
          unit: initial.unit,
          estimatedPrice: initial.estimatedPrice,
          priority: initial.priority,
          status: initial.status,
          notes: initial.notes,
        }
      : {
          name: "",
          category: "Water",
          quantity: 1,
          unit: "each",
          estimatedPrice: null,
          priority: 2,
          status: "proposed",
          notes: "",
        },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setD((p) => ({ ...p, [k]: v }));
  const col = collection(db(), "households", household.id, "purchases");

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      ...d,
      name: d.name.trim(),
      notes: d.notes.trim(),
      updatedAt: serverTimestamp(),
    };
    try {
      if (initial) await updateDoc(doc(col, initial.id), payload);
      else
        await addDoc(col, {
          ...payload,
          inventoryItemId: null,
          createdAt: serverTimestamp(),
        });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!initial || !confirm(`Delete purchase "${initial.name}"?`)) return;
    setBusy(true);
    try {
      await deleteDoc(doc(col, initial.id));
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <Field label="Item">
        <Input
          required
          maxLength={120}
          disabled={acquired}
          value={d.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Category" className="col-span-2">
          <Select
            value={d.category}
            disabled={acquired}
            onChange={(e) => set("category", e.target.value as Category)}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Quantity">
          <Input
            type="number"
            required
            min={0}
            step="any"
            disabled={acquired}
            value={d.quantity}
            onChange={(e) => set("quantity", Number(e.target.value))}
          />
        </Field>
        <Field label="Unit">
          <Select
            value={d.unit}
            disabled={acquired}
            onChange={(e) => set("unit", e.target.value)}
          >
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Field>
        <Field label="Est. price / unit ($)">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={d.estimatedPrice ?? ""}
            onChange={(e) =>
              set(
                "estimatedPrice",
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
          />
        </Field>
        <Field label="Priority">
          <Select
            value={d.priority}
            onChange={(e) =>
              set("priority", Number(e.target.value) as Priority)
            }
          >
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" className="col-span-2">
          {acquired ? (
            <Input
              disabled
              value={`Acquired${initial?.acquiredByName ? ` by ${initial.acquiredByName}` : ""}`}
            />
          ) : (
            <Select
              value={d.status}
              onChange={(e) => set("status", e.target.value as PurchaseStatus)}
            >
              <option value="proposed">Proposed</option>
              <option value="approved">Approved</option>
            </Select>
          )}
        </Field>
      </div>
      <Field label="Notes">
        <Textarea
          rows={2}
          maxLength={1000}
          value={d.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex items-center justify-between gap-2">
        {initial ? (
          <Button
            variant="danger"
            icon={Trash2}
            onClick={remove}
            disabled={busy}
          >
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button onClick={onDone}>Cancel</Button>
          <Button
            type="submit"
            variant={initial ? "emerald" : "copper"}
            icon={initial ? Save : Plus}
            loading={busy}
            disabled={!d.name.trim()}
          >
            {initial ? "Save" : "Add purchase"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function AcquireForm({
  purchase,
  onDone,
}: {
  purchase: Purchase;
  onDone: () => void;
}) {
  const { household, user } = useHousehold();
  const inv = useInventory();
  const matches = useMemo(
    () =>
      inv.data.filter(
        (i) => i.category === purchase.category && i.unit === purchase.unit,
      ),
    [inv.data, purchase],
  );
  const exact = matches.find(
    (i) => i.name.trim().toLowerCase() === purchase.name.trim().toLowerCase(),
  );
  const [choice, setChoice] = useState<string | null>(null); // itemId or "new"
  const target = choice ?? exact?.id ?? "new";
  const [location, setLocation] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await acquirePurchase(
        household.id,
        purchase.id,
        target === "new"
          ? {
              mode: "new",
              location: location.trim(),
              expiresOn: expiresOn || null,
            }
          : { mode: "existing", itemId: target },
        displayNameOf(user),
      );
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-ivory-dim">
        Record{" "}
        <span className="font-medium">
          {purchase.quantity} {purchase.unit} of {purchase.name}
        </span>{" "}
        in inventory.
      </p>
      <Field label="Add to">
        <Select
          value={target}
          onChange={(e) => setChoice(e.target.value)}
          disabled={inv.loading}
        >
          <option value="new">New inventory item</option>
          {matches.map((i) => (
            <option key={i.id} value={i.id}>
              Existing: {i.name} ({i.quantity} {i.unit}
              {i.location ? `, ${i.location}` : ""})
            </option>
          ))}
        </Select>
      </Field>
      {target === "new" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Storage location">
            <Input
              value={location}
              maxLength={120}
              onChange={(e) => setLocation(e.target.value)}
            />
          </Field>
          <Field label="Expiration (optional)">
            <Input
              type="date"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
            />
          </Field>
        </div>
      )}
      {target !== "new" && (
        <p className="text-xs text-sage">
          The quantity will be added to the existing item; no new entry is
          created.
        </p>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button
          type="submit"
          variant="copper"
          icon={PackageCheck}
          loading={busy}
          disabled={inv.loading}
        >
          Mark acquired
        </Button>
      </div>
    </form>
  );
}

export default function PurchasesPage() {
  const { data, loading, error } = usePurchases();
  const [modal, setModal] = useState<
    { kind: "new" } | { kind: "edit" | "acquire"; id: string } | null
  >(null);
  const [showAcquired, setShowAcquired] = useState(false);

  const rows = useMemo(
    () =>
      sortPurchases(data).filter(
        (p) => showAcquired || p.status !== "acquired",
      ),
    [data, showAcquired],
  );
  const open = data.filter((p) => p.status !== "acquired");
  const total = open.reduce(
    (s, p) => s + (p.estimatedPrice ?? 0) * p.quantity,
    0,
  );
  const unpriced = open.filter((p) => p.estimatedPrice == null).length;
  const current =
    modal && modal.kind !== "new"
      ? (data.find((p) => p.id === modal.id) ?? null)
      : null;

  return (
    <>
      <PageHeader
        title="Purchases"
        sub={
          <>
            {open.length} planned · est. {money(total)}
            {unpriced > 0 && ` (${unpriced} unpriced)`}
          </>
        }
        action={
          <Button
            variant="copper"
            icon={Plus}
            onClick={() => setModal({ kind: "new" })}
          >
            Propose purchase
          </Button>
        }
      />
      <Card>
        <label className="mb-3 flex items-center gap-1.5 text-sm text-sage">
          <input
            type="checkbox"
            checked={showAcquired}
            onChange={(e) => setShowAcquired(e.target.checked)}
          />
          Show acquired
        </label>
        <ErrorText>{error}</ErrorText>
        {loading ? (
          <Empty>Loading…</Empty>
        ) : rows.length === 0 ? (
          <Empty>No planned purchases.</Empty>
        ) : (
          <div className="-mx-3.5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate">
                <tr className="border-b border-line">
                  <th className="px-3.5 py-1.5 font-medium">Item</th>
                  <th className="px-2 py-1.5 font-medium">Priority</th>
                  <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                  <th className="hidden px-2 py-1.5 text-right font-medium sm:table-cell">
                    Est. each
                  </th>
                  <th className="px-2 py-1.5 text-right font-medium">
                    Est. total
                  </th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-3.5 py-1.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((p) => (
                  <tr key={p.id} className="hover:bg-well">
                    <td className="px-3.5 py-1.5">
                      <button
                        type="button"
                        className="text-left font-medium text-ivory hover:text-copper-light"
                        onClick={() => setModal({ kind: "edit", id: p.id })}
                      >
                        {p.name}
                      </button>
                      <div className="text-[11px] text-slate">{p.category}</div>
                    </td>
                    <td className="px-2 py-1.5">
                      <Badge tone={PRIORITY_TONE[p.priority]}>
                        {PRIORITY_LABEL[p.priority]}
                      </Badge>
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
                      {p.quantity} <span className="text-slate">{p.unit}</span>
                    </td>
                    <td className="hidden px-2 py-1.5 text-right text-sage tabular-nums sm:table-cell">
                      {p.estimatedPrice == null ? "—" : money(p.estimatedPrice)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {p.estimatedPrice == null
                        ? "—"
                        : money(p.estimatedPrice * p.quantity)}
                    </td>
                    <td className="px-2 py-1.5">
                      <Badge tone={STATUS_TONE[p.status]}>
                        {PURCHASE_STATUS_LABEL[p.status]}
                      </Badge>
                    </td>
                    <td className="px-3.5 py-1.5 text-right whitespace-nowrap">
                      {p.status !== "acquired" && (
                        <Button
                          size="sm"
                          icon={PackageCheck}
                          onClick={() =>
                            setModal({ kind: "acquire", id: p.id })
                          }
                        >
                          Acquired…
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={
          modal?.kind === "new"
            ? "Propose purchase"
            : modal?.kind === "acquire"
              ? "Mark acquired"
              : "Purchase"
        }
        wide={modal?.kind === "edit"}
      >
        {modal?.kind === "new" && (
          <PurchaseForm
            key="new"
            initial={null}
            onDone={() => setModal(null)}
          />
        )}
        {modal?.kind === "edit" && current && (
          <div className="space-y-4">
            <PurchaseForm
              key={current.id}
              initial={current}
              onDone={() => setModal(null)}
            />
            <div className="border-t border-line pt-3">
              <Comments parent="purchases" parentId={current.id} />
            </div>
          </div>
        )}
        {modal?.kind === "acquire" && current && (
          <AcquireForm
            key={current.id}
            purchase={current}
            onDone={() => setModal(null)}
          />
        )}
      </Modal>
    </>
  );
}
