"use client";

import { Plus, Save, Search, Trash2 } from "lucide-react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useMemo, useState, type FormEvent } from "react";
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
import { useInventory } from "@/lib/data";
import { db } from "@/lib/firebase";
import { displayNameOf } from "@/lib/household";
import { daysUntil, localToday } from "@/lib/readiness";
import {
  CATEGORIES,
  UNITS,
  type Category,
  type InventoryItem,
} from "@/lib/types";

type Draft = Omit<
  InventoryItem,
  "id" | "updatedAt" | "updatedByName" | "sourcePurchaseId"
>;

const EMPTY: Draft = {
  name: "",
  category: "Water",
  quantity: 1,
  unit: "gal",
  location: "",
  expiresOn: null,
  notes: "",
};

function ItemForm({
  initial,
  onDone,
}: {
  initial: InventoryItem | null;
  onDone: () => void;
}) {
  const { household, user } = useHousehold();
  const [d, setD] = useState<Draft>(() =>
    initial
      ? {
          name: initial.name,
          category: initial.category,
          quantity: initial.quantity,
          unit: initial.unit,
          location: initial.location,
          expiresOn: initial.expiresOn,
          notes: initial.notes,
        }
      : EMPTY,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setD((p) => ({ ...p, [k]: v }));
  const col = collection(db(), "households", household.id, "inventory");

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      ...d,
      name: d.name.trim(),
      location: d.location.trim(),
      notes: d.notes.trim(),
      expiresOn: d.expiresOn || null,
      updatedAt: serverTimestamp(),
      updatedByName: displayNameOf(user),
    };
    try {
      if (initial) await updateDoc(doc(col, initial.id), payload);
      else await addDoc(col, { ...payload, createdAt: serverTimestamp() });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!initial || !confirm(`Remove "${initial.name}" from inventory?`))
      return;
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
      <Field label="Name">
        <Input
          required
          autoFocus
          maxLength={120}
          value={d.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Category" className="col-span-2">
          <Select
            value={d.category}
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
            value={d.quantity}
            onChange={(e) => set("quantity", Number(e.target.value))}
          />
        </Field>
        <Field label="Unit">
          <Select value={d.unit} onChange={(e) => set("unit", e.target.value)}>
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Storage location">
          <Input
            maxLength={120}
            value={d.location}
            placeholder="e.g. Garage shelf B"
            onChange={(e) => set("location", e.target.value)}
          />
        </Field>
        <Field label="Expiration (optional)">
          <Input
            type="date"
            value={d.expiresOn ?? ""}
            onChange={(e) => set("expiresOn", e.target.value || null)}
          />
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
      {(d.category === "Water" || d.category === "Food") && (
        <p className="text-[11px] text-slate">
          Readiness counts Water in gal / L / fl oz and Food in meals /
          person-days.
        </p>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex items-center justify-between gap-2 pt-1">
        {initial ? (
          <Button
            variant="danger"
            icon={Trash2}
            onClick={remove}
            disabled={busy}
          >
            Remove
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
            {initial ? "Save" : "Add item"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export default function InventoryPage() {
  const { data, loading, error } = useInventory();
  const [filter, setFilter] = useState<Category | "All">("All");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<InventoryItem | null | "new">(null);
  const today = localToday();

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter(
      (i) =>
        (filter === "All" || i.category === filter) &&
        (!q || `${i.name} ${i.location} ${i.notes}`.toLowerCase().includes(q)),
    );
  }, [data, filter, search]);

  return (
    <>
      <PageHeader
        title="Inventory"
        sub={`${data.length} items recorded`}
        action={
          <Button
            variant="copper"
            icon={Plus}
            onClick={() => setEditing("new")}
          >
            Add item
          </Button>
        }
      />
      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          <Input
            icon={Search}
            wrapperClassName="w-full sm:w-72"
            aria-label="Search inventory"
            placeholder="Search name, location, notes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            className="w-auto"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Category | "All")}
          >
            <option>All</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        {loading ? (
          <Empty>Loading…</Empty>
        ) : rows.length === 0 ? (
          <Empty>
            {data.length
              ? "No items match."
              : "No items yet. Add your water, food and supplies."}
          </Empty>
        ) : (
          <div className="-mx-3.5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate">
                <tr className="border-b border-line">
                  <th className="px-3.5 py-1.5 font-medium">Name</th>
                  <th className="px-2 py-1.5 font-medium">Category</th>
                  <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                  <th className="hidden px-2 py-1.5 font-medium sm:table-cell">
                    Location
                  </th>
                  <th className="px-2 py-1.5 font-medium">Expires</th>
                  <th className="hidden px-3.5 py-1.5 font-medium md:table-cell">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((i) => {
                  const d = i.expiresOn ? daysUntil(i.expiresOn, today) : null;
                  return (
                    <tr
                      key={i.id}
                      onClick={() => setEditing(i)}
                      className="cursor-pointer hover:bg-well"
                    >
                      <td className="px-3.5 py-1.5 font-medium text-ivory">
                        {i.name}
                      </td>
                      <td className="px-2 py-1.5 text-sage">{i.category}</td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
                        {i.quantity}{" "}
                        <span className="text-slate">{i.unit}</span>
                      </td>
                      <td className="hidden px-2 py-1.5 text-sage sm:table-cell">
                        {i.location || "—"}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {i.expiresOn ? (
                          <Badge
                            tone={
                              d! < 0 ? "bad" : d! <= 30 ? "warn" : "neutral"
                            }
                          >
                            {i.expiresOn}
                          </Badge>
                        ) : (
                          <span className="text-slate/60">—</span>
                        )}
                      </td>
                      <td className="hidden max-w-xs truncate px-3.5 py-1.5 text-sage md:table-cell">
                        {i.notes}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add inventory item" : "Edit inventory item"}
      >
        {editing !== null && (
          <ItemForm
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}
