"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useState, type FormEvent } from "react";
import { useHousehold } from "@/components/SessionProvider";
import {
  Button,
  ErrorText,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { db } from "@/lib/firebase";
import { displayNameOf } from "@/lib/household";
import {
  draftFromItem,
  EMPTY_INVENTORY_DRAFT,
  normalizeInventoryDraft,
  type InventoryDraft,
} from "@/lib/inventory";
import {
  CATEGORIES,
  UNITS,
  type Category,
  type InventoryItem,
} from "@/lib/types";

/** The inventory field set, shared by the Inventory page and Budget transfers. */
export function InventoryFields({
  value: d,
  onChange,
  autoFocus,
}: {
  value: InventoryDraft;
  onChange: (next: InventoryDraft) => void;
  autoFocus?: boolean;
}) {
  const set = <K extends keyof InventoryDraft>(k: K, v: InventoryDraft[K]) =>
    onChange({ ...d, [k]: v });
  return (
    <>
      <Field label="Name">
        <Input
          required
          autoFocus={autoFocus}
          data-autofocus={autoFocus || undefined}
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
    </>
  );
}

/** Create/edit/remove an inventory item (Inventory page). */
export function InventoryItemForm({
  initial,
  onDone,
}: {
  initial: InventoryItem | null;
  onDone: () => void;
}) {
  const { household, user } = useHousehold();
  const [d, setD] = useState<InventoryDraft>(() =>
    initial ? draftFromItem(initial) : EMPTY_INVENTORY_DRAFT,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const col = collection(db(), "households", household.id, "inventory");

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...normalizeInventoryDraft(d),
        updatedAt: serverTimestamp(),
        updatedByName: displayNameOf(user),
      };
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
      <InventoryFields value={d} onChange={setD} autoFocus />
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
