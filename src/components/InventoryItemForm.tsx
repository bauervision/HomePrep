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
import { useRef, useState, type FormEvent } from "react";
import { ReadinessPreview } from "@/components/ReadinessPreview";
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
  DEFAULT_UNIT,
  draftFromItem,
  emptyDraftFor,
  normalizeInventoryDraft,
  withCategory,
  type InventoryDraft,
} from "@/lib/inventory";
import { useObjective } from "@/lib/objective";
import { householdPlan } from "@/lib/profile";
import { describeQuantity, MEAL_UNITS, VOLUME_UNITS } from "@/lib/quantities";
import {
  localToday,
  readinessFeedback,
  type ReadinessFeedback,
} from "@/lib/readiness";
import {
  CATEGORIES,
  UNITS,
  type Category,
  type InventoryItem,
} from "@/lib/types";

/** Units that already measure an amount; contents only apply to packages. */
const isMeasureUnit = (u: string) =>
  VOLUME_UNITS.includes(u) || MEAL_UNITS.includes(u);

const contentUnitFor = (category: Category) =>
  category === "Water" ? "pt" : DEFAULT_UNIT[category];

/** The inventory field set, shared by the Inventory page and Budget transfers. */
export function InventoryFields({
  value: d,
  onChange,
  autoFocus,
  preview,
  isNew = false,
}: {
  value: InventoryDraft;
  onChange: (next: InventoryDraft) => void;
  autoFocus?: boolean;
  /** Show projected readiness against the household's current inventory. */
  preview?: { items: InventoryItem[]; editingId: string | null };
  /** New records follow the category's default unit when it changes. */
  isNew?: boolean;
}) {
  const set = <K extends keyof InventoryDraft>(k: K, v: InventoryDraft[K]) =>
    onChange({ ...d, [k]: v });
  const contentUnit = d.contains?.unit ?? contentUnitFor(d.category);
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
            onChange={(e) =>
              onChange(withCategory(d, e.target.value as Category, isNew))
            }
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
          <Select
            value={d.unit}
            onChange={(e) =>
              onChange({
                ...d,
                unit: e.target.value,
                // A measured unit (gal, meals…) has no package contents.
                contains: isMeasureUnit(e.target.value) ? null : d.contains,
              })
            }
          >
            {/* Keep a historical unit selectable rather than silently changing it. */}
            {!(UNITS as readonly string[]).includes(d.unit) && (
              <option>{d.unit}</option>
            )}
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Field>
      </div>
      {!isMeasureUnit(d.unit) && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs text-sage">
              Contents of one {d.unit}{" "}
              <span className="text-slate">(optional)</span>
            </span>
            <Input
              type="number"
              min={0}
              step="any"
              aria-label={`Amount in one ${d.unit}`}
              className="w-24"
              placeholder="e.g. 40"
              value={d.contains?.amount ?? ""}
              onChange={(e) =>
                set(
                  "contains",
                  e.target.value === ""
                    ? null
                    : { amount: Number(e.target.value), unit: contentUnit },
                )
              }
            />
            <Select
              aria-label={`Unit inside one ${d.unit}`}
              className="w-24"
              value={contentUnit}
              disabled={!d.contains}
              onChange={(e) =>
                d.contains &&
                set("contains", { ...d.contains, unit: e.target.value })
              }
            >
              {UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </div>
          {d.contains && d.contains.amount > 0 && (
            <p
              className="text-[11px] text-slate tabular-nums"
              data-testid="quantity-total"
            >
              Total: {describeQuantity(d)}
            </p>
          )}
        </div>
      )}
      {(d.category === "Water" || d.category === "Food") && (
        <label className="flex items-start gap-2 text-xs text-sage">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={d.readinessRole === "equipment"}
            onChange={(e) =>
              set("readinessRole", e.target.checked ? "equipment" : "supply")
            }
          />
          <span>
            Equipment, not stored supply
            <span className="block text-slate">
              {d.category === "Water"
                ? "Filter straw, purifier, treatment tablets: recorded as a capability, not counted as stored water."
                : "Stove, cookware: recorded, not counted as meals."}
            </span>
          </span>
        </label>
      )}
      {preview && (
        <ReadinessPreview
          draft={d}
          items={preview.items}
          editingId={preview.editingId}
        />
      )}
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
      {!preview && (d.category === "Water" || d.category === "Food") && (
        <p className="text-[11px] text-slate">
          Readiness counts Water in gal / qt / pt / fl oz / L and Food in meals
          / person-days, including the contents of packaged units.
        </p>
      )}
    </>
  );
}

/** Create/edit/remove an inventory item (Inventory page). */
export function InventoryItemForm({
  initial,
  onDone,
  onSaved,
  inventory,
  initialCategory,
}: {
  initial: InventoryItem | null;
  onDone: () => void;
  /** Called after a save with how it moved the viewer's objective. */
  onSaved?: (feedback: ReadinessFeedback[]) => void;
  /** Household inventory, for the projected-readiness preview. */
  inventory?: InventoryItem[];
  /** Category a new item starts in (from a category deep link). */
  initialCategory?: Category;
}) {
  const { household, user } = useHousehold();
  const [objective] = useObjective(user.uid, household.id);
  const [d, setD] = useState<InventoryDraft>(() =>
    initial ? draftFromItem(initial) : emptyDraftFor(initialCategory),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Blocks a second submit that arrives before the busy state re-renders.
  const saving = useRef(false);
  const col = collection(db(), "households", household.id, "inventory");

  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving.current) return;
    setError(null);
    let draft: InventoryDraft;
    try {
      draft = normalizeInventoryDraft(d);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      const payload = {
        ...draft,
        updatedAt: serverTimestamp(),
        updatedByName: displayNameOf(user),
      };
      if (initial) await updateDoc(doc(col, initial.id), payload);
      else await addDoc(col, { ...payload, createdAt: serverTimestamp() });
      if (onSaved && inventory) {
        const saved: InventoryItem = { ...draft, id: initial?.id ?? "__new__" };
        const after = initial
          ? inventory.map((i) => (i.id === initial.id ? saved : i))
          : [...inventory, saved];
        onSaved(
          readinessFeedback(
            inventory,
            after,
            [],
            householdPlan(household),
            objective,
            localToday(),
          ),
        );
      }
      onDone();
    } catch (err) {
      setError((err as Error).message);
      saving.current = false;
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
      <InventoryFields
        value={d}
        onChange={setD}
        autoFocus
        isNew={!initial}
        preview={
          inventory
            ? { items: inventory, editingId: initial?.id ?? null }
            : undefined
        }
      />
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
