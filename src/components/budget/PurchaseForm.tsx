"use client";

import { Link2, Plus, Save, Trash2 } from "lucide-react";
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
import { centsToInput, parseMoneyInput, parseProductUrl } from "@/lib/budget";
import { db } from "@/lib/firebase";
import {
  CATEGORIES,
  PRIORITY_LABEL,
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
> & { productUrl: string; actualCost: string };

export function PurchaseForm({
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
          productUrl: initial.productUrl ?? "",
          actualCost: centsToInput(initial.actualCostCents),
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
          productUrl: "",
          actualCost: "",
        },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setD((p) => ({ ...p, [k]: v }));
  const col = collection(db(), "households", household.id, "purchases");

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    let productUrl: string | null;
    let actualCostCents: number | null = null;
    try {
      productUrl = parseProductUrl(d.productUrl);
      if (acquired) actualCostCents = parseMoneyInput(d.actualCost);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    setBusy(true);
    const payload = {
      name: d.name.trim(),
      category: d.category,
      quantity: d.quantity,
      unit: d.unit,
      estimatedPrice: d.estimatedPrice,
      priority: d.priority,
      status: d.status,
      notes: d.notes.trim(),
      productUrl,
      // Actual cost is only editable once acquired; never written for planned items.
      ...(acquired ? { actualCostCents } : {}),
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
      <div
        className={acquired ? "grid gap-3 sm:grid-cols-[1fr_11rem]" : undefined}
      >
        <Field label="Product link (optional)">
          <Input
            icon={Link2}
            inputMode="url"
            autoComplete="url"
            maxLength={2048}
            placeholder="https://"
            value={d.productUrl}
            onChange={(e) => set("productUrl", e.target.value)}
          />
        </Field>
        {acquired && (
          <Field label="Actual cost, total ($)">
            <Input
              inputMode="decimal"
              placeholder="Not recorded"
              value={d.actualCost}
              onChange={(e) => set("actualCost", e.target.value)}
            />
          </Field>
        )}
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
