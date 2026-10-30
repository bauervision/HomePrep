"use client";

import { CheckCircle2, PackageCheck, PackagePlus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { InventoryFields } from "@/components/InventoryItemForm";
import { useHousehold } from "@/components/SessionProvider";
import { Button, ErrorText, Field, Input, Select } from "@/components/ui";
import {
  estimatedTotalCents,
  formatCents,
  parseMoneyInput,
} from "@/lib/budget";
import { displayNameOf } from "@/lib/household";
import { draftFromPurchase, type InventoryDraft } from "@/lib/inventory";
import {
  addPurchaseToInventory,
  PurchaseFlowError,
  recordAcquisition,
} from "@/lib/purchases";
import type { InventoryItem, Purchase } from "@/lib/types";

type Step = "acquire" | "offer" | "inventory" | "done";

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/**
 * Acquire → (optional, explicit) add to Inventory.
 * - "acquire": record acquisition and actual cost. Inventory is untouched.
 * - "offer":   ask whether to add to inventory now; "Not now" leaves it unlinked.
 * - "inventory": confirm a prefilled inventory record (or add to an existing
 *   matching item). Success is shown only after Firestore commits.
 */
export function AcquireFlow({
  purchase,
  inventory,
  inventoryLoading,
  startAt,
  onClose,
}: {
  purchase: Purchase;
  inventory: InventoryItem[];
  inventoryLoading: boolean;
  startAt: "acquire" | "inventory";
  onClose: () => void;
}) {
  const { household, user } = useHousehold();
  const byName = displayNameOf(user);
  const [step, setStep] = useState<Step>(startAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finalError, setFinalError] = useState(false);

  // Step 1 — acquisition
  const [cost, setCost] = useState("");
  const est = estimatedTotalCents(purchase);

  async function acquire(e: FormEvent) {
    e.preventDefault();
    setError(null);
    let cents: number | null;
    try {
      cents = parseMoneyInput(cost);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    setBusy(true);
    try {
      await recordAcquisition(household.id, purchase.id, {
        actualCostCents: cents,
        byName,
      });
      setStep("offer");
    } catch (err) {
      if (err instanceof PurchaseFlowError && err.code === "already-acquired") {
        // Another device (or an earlier click) already recorded it; continue safely.
        setStep("offer");
      } else {
        setError(`Could not mark acquired: ${(err as Error).message}`);
      }
    } finally {
      setBusy(false);
    }
  }

  // Step 3 — inventory transfer
  const matches = useMemo(
    () =>
      inventory.filter(
        (i) => i.category === purchase.category && i.unit === purchase.unit,
      ),
    [inventory, purchase.category, purchase.unit],
  );
  const [target, setTarget] = useState<string>("new");
  const [draft, setDraft] = useState<InventoryDraft>(() =>
    draftFromPurchase(purchase),
  );
  const existing = matches.find((i) => i.id === target);
  const [savedName, setSavedName] = useState("");

  async function transfer(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await addPurchaseToInventory(
        household.id,
        purchase.id,
        existing
          ? { mode: "existing", itemId: existing.id }
          : { mode: "new", draft },
        byName,
      );
      setSavedName(existing ? existing.name : draft.name.trim());
      setStep("done");
    } catch (err) {
      const terminal =
        err instanceof PurchaseFlowError &&
        (err.code === "already-linked" || err.code === "not-found");
      setFinalError(terminal);
      setError(
        terminal
          ? (err as Error).message
          : `Inventory was not updated: ${(err as Error).message} Your entries are kept — you can try again.`,
      );
    } finally {
      setBusy(false);
    }
  }

  const summary = (
    <span className="font-medium text-ivory">
      {fmtQty(purchase.quantity)} {purchase.unit} · {purchase.name}
    </span>
  );

  if (step === "acquire") {
    return (
      <form onSubmit={acquire} className="space-y-3">
        <p className="text-sm text-ivory-dim">Mark {summary} as acquired.</p>
        <Field label="Actual cost, total paid ($) — optional">
          <Input
            inputMode="decimal"
            autoFocus
            placeholder={
              est != null ? `Estimated ${formatCents(est)}` : "e.g. 24.99"
            }
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </Field>
        <p className="text-[11px] text-slate">
          Leave blank if you don’t know it yet; Budget will show spending as
          incomplete. Marking acquired does not change readiness — only
          inventory does.
        </p>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="copper"
            icon={PackageCheck}
            loading={busy}
          >
            Mark acquired
          </Button>
        </div>
      </form>
    );
  }

  if (step === "offer") {
    return (
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-sm text-ivory-dim">
          <CheckCircle2
            size={18}
            aria-hidden
            className="mt-px shrink-0 text-pine"
          />
          <span>
            {summary} is marked acquired. Add it to Inventory now so readiness
            can count it?
          </span>
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>Not now</Button>
          <Button
            variant="emerald"
            icon={PackagePlus}
            autoFocus
            onClick={() => setStep("inventory")}
          >
            Add to inventory
          </Button>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="space-y-3" role="status">
        <p className="flex items-start gap-2 text-sm text-ivory-dim">
          <CheckCircle2
            size={18}
            aria-hidden
            className="mt-px shrink-0 text-pine"
          />
          <span>
            Saved to Inventory as{" "}
            <span className="font-medium text-ivory">{savedName}</span>.
            Readiness updates from inventory automatically.
          </span>
        </p>
        <div className="flex justify-end">
          <Button variant="emerald" autoFocus onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={transfer} className="space-y-3">
      <p className="text-sm text-ivory-dim">Add {summary} to Inventory.</p>
      <Field label="Add as">
        <Select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={inventoryLoading || busy}
        >
          <option value="new">New inventory item</option>
          {matches.map((i) => (
            <option key={i.id} value={i.id}>
              Add to existing: {i.name} ({fmtQty(i.quantity)} {i.unit}
              {i.location ? `, ${i.location}` : ""})
            </option>
          ))}
        </Select>
      </Field>
      {existing ? (
        <p className="rounded-md border border-line bg-well px-3 py-2 text-sm text-ivory-dim">
          {existing.name}: {fmtQty(existing.quantity)} →{" "}
          <span className="font-medium text-ivory">
            {fmtQty(existing.quantity + purchase.quantity)} {existing.unit}
          </span>
          . No new entry is created.
        </p>
      ) : (
        <InventoryFields value={draft} onChange={setDraft} />
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{finalError ? "Close" : "Cancel"}</Button>
        {!finalError && (
          <Button
            type="submit"
            variant="copper"
            icon={PackagePlus}
            loading={busy}
            disabled={inventoryLoading || (!existing && !draft.name.trim())}
          >
            {error ? "Try again" : "Add to inventory"}
          </Button>
        )}
      </div>
    </form>
  );
}
