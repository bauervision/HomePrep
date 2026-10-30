"use client";

import { PackageCheck, PackagePlus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { AcquireFlow } from "./AcquireFlow";
import { BudgetSummary } from "./BudgetSummary";
import { ProductLink } from "./ProductLink";
import { PurchaseForm } from "./PurchaseForm";
import { Comments } from "@/components/Comments";
import {
  Badge,
  Button,
  Card,
  cx,
  Empty,
  ErrorText,
  Modal,
  PageHeader,
} from "@/components/ui";
import {
  budgetSummary,
  estimatedTotalCents,
  formatCents,
  inventoryLinkState,
  type InventoryLinkState,
} from "@/lib/budget";
import { sortPurchases } from "@/lib/data";
import {
  PRIORITY_LABEL,
  PURCHASE_STATUS_LABEL,
  type InventoryItem,
  type Purchase,
} from "@/lib/types";

const PRIORITY_TONE = { 1: "bad", 2: "warn", 3: "neutral" } as const;
const STATUS_TONE = {
  proposed: "neutral",
  approved: "info",
  acquired: "good",
} as const;

type ModalState =
  | { kind: "new" }
  | { kind: "edit"; id: string }
  | { kind: "acquire"; id: string; startAt: "acquire" | "inventory" };

const est = (p: Purchase) => {
  const c = estimatedTotalCents(p);
  return c == null ? "—" : formatCents(c);
};
const paid = (p: Purchase) =>
  typeof p.actualCostCents === "number" ? formatCents(p.actualCostCents) : null;

function PurchaseAction({
  p,
  link,
  onOpen,
  size = "sm",
  className,
}: {
  p: Purchase;
  link: InventoryLinkState;
  onOpen: (m: ModalState) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  if (link === "planned")
    return (
      <Button
        size={size}
        icon={PackageCheck}
        className={className}
        onClick={() =>
          onOpen({ kind: "acquire", id: p.id, startAt: "acquire" })
        }
        aria-label={`Mark ${p.name} acquired`}
      >
        Acquired…
      </Button>
    );
  if (link === "unlinked")
    return (
      <Button
        size={size}
        variant="copper"
        icon={PackagePlus}
        className={className}
        onClick={() =>
          onOpen({ kind: "acquire", id: p.id, startAt: "inventory" })
        }
        aria-label={`Add ${p.name} to inventory`}
      >
        Add to inventory
      </Button>
    );
  if (link === "linked") return <Badge tone="good">In inventory</Badge>;
  return null;
}

/** Budget workspace UI; data is supplied by the route (or the dev preview). */
export function BudgetView({
  data,
  loading,
  error,
  inv,
}: {
  data: Purchase[];
  loading: boolean;
  error: string | null;
  inv: { data: InventoryItem[]; loading: boolean; error: string | null };
}) {
  const [modal, setModal] = useState<ModalState | null>(null);
  const [showAcquired, setShowAcquired] = useState(false);

  const ids = useMemo(
    () => (inv.loading ? null : new Set(inv.data.map((i) => i.id))),
    [inv.loading, inv.data],
  );
  const summary = useMemo(() => budgetSummary(data), [data]);
  const rows = useMemo(
    () =>
      sortPurchases(data)
        .map((p) => ({ p, link: inventoryLinkState(p, ids) }))
        // Acquired items still awaiting inventory stay visible so they get added.
        .filter(
          ({ p, link }) =>
            showAcquired || p.status !== "acquired" || link === "unlinked",
        ),
    [data, ids, showAcquired],
  );
  const current =
    modal && modal.kind !== "new"
      ? (data.find((p) => p.id === modal.id) ?? null)
      : null;

  return (
    <>
      <PageHeader
        title="Budget"
        sub="Plan purchases, record what you paid, and move supplies into inventory."
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
      <div className="space-y-3">
        <BudgetSummary summary={summary} />
        <Card>
          <label className="mb-1 flex min-h-11 items-center gap-2 text-sm text-sage md:mb-2 md:min-h-0">
            <input
              type="checkbox"
              className="size-4"
              checked={showAcquired}
              onChange={(e) => setShowAcquired(e.target.checked)}
            />
            Show acquired
          </label>
          <ErrorText>{error || inv.error}</ErrorText>
          {loading ? (
            <Empty>Loading…</Empty>
          ) : rows.length === 0 ? (
            <Empty>No planned purchases.</Empty>
          ) : (
            <>
              {/* Mobile: stacked rows, no horizontal scrolling */}
              <ul
                className="divide-y divide-line md:hidden"
                aria-label="Budget items"
              >
                {rows.map(({ p, link }) => (
                  <li key={p.id} className="py-3 first:pt-1 last:pb-1">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setModal({ kind: "edit", id: p.id })}
                        className="min-w-0 text-left text-[15px] font-medium [overflow-wrap:anywhere] text-ivory outline-none hover:text-copper-light focus-visible:text-copper-light focus-visible:underline"
                      >
                        {p.name}
                      </button>
                      <span className="shrink-0">
                        <Badge tone={STATUS_TONE[p.status]}>
                          {PURCHASE_STATUS_LABEL[p.status]}
                        </Badge>
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-sage">
                      <span>{p.category}</span>
                      <span aria-hidden className="text-slate">
                        ·
                      </span>
                      <span className="tabular-nums">
                        {p.quantity} {p.unit}
                      </span>
                      <Badge tone={PRIORITY_TONE[p.priority]}>
                        {PRIORITY_LABEL[p.priority]}
                      </Badge>
                      <span className="ml-auto text-ivory-dim tabular-nums">
                        Est. <span className="text-ivory">{est(p)}</span>
                        {paid(p) && (
                          <>
                            {" "}
                            · Paid <span className="text-ivory">{paid(p)}</span>
                          </>
                        )}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                      <ProductLink
                        url={p.productUrl}
                        itemName={p.name}
                        className="h-11"
                      />
                      <PurchaseAction
                        p={p}
                        link={link}
                        onOpen={setModal}
                        size="md"
                        className="h-11"
                      />
                    </div>
                  </li>
                ))}
              </ul>

              {/* Desktop: table */}
              <table className="hidden w-full text-sm md:table">
                <thead className="text-left text-xs text-slate">
                  <tr className="border-b border-line">
                    <th className="py-1.5 pr-2 font-medium">Item</th>
                    <th className="px-2 py-1.5 font-medium">Priority</th>
                    <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                    <th className="hidden px-2 py-1.5 text-right font-medium lg:table-cell">
                      Est. each
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      Est. total
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium">Paid</th>
                    <th className="px-2 py-1.5 font-medium">Status</th>
                    <th className="py-1.5 pl-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map(({ p, link }) => (
                    <tr key={p.id} className="hover:bg-well">
                      <td className="max-w-0 py-1.5 pr-2 lg:w-[34%]">
                        <button
                          type="button"
                          className="block max-w-full truncate text-left font-medium text-ivory outline-none hover:text-copper-light focus-visible:text-copper-light focus-visible:underline"
                          title={p.name}
                          onClick={() => setModal({ kind: "edit", id: p.id })}
                        >
                          {p.name}
                        </button>
                        <div className="text-[11px] text-slate">
                          {p.category}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <Badge tone={PRIORITY_TONE[p.priority]}>
                          {PRIORITY_LABEL[p.priority]}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
                        {p.quantity}{" "}
                        <span className="text-slate">{p.unit}</span>
                      </td>
                      <td className="hidden px-2 py-1.5 text-right text-sage tabular-nums lg:table-cell">
                        {p.estimatedPrice == null
                          ? "—"
                          : formatCents(Math.round(p.estimatedPrice * 100))}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {est(p)}
                      </td>
                      <td
                        className={cx(
                          "px-2 py-1.5 text-right tabular-nums",
                          !paid(p) && "text-slate",
                        )}
                      >
                        {paid(p) ?? "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        <Badge tone={STATUS_TONE[p.status]}>
                          {PURCHASE_STATUS_LABEL[p.status]}
                        </Badge>
                      </td>
                      <td className="py-1.5 pl-2">
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          <ProductLink url={p.productUrl} itemName={p.name} />
                          <PurchaseAction p={p} link={link} onOpen={setModal} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>
      </div>
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={
          modal?.kind === "new"
            ? "Propose purchase"
            : modal?.kind === "acquire"
              ? modal.startAt === "inventory"
                ? "Add to inventory"
                : "Mark acquired"
              : "Purchase"
        }
        wide={modal?.kind === "edit" || modal?.kind === "acquire"}
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
          <AcquireFlow
            key={`${current.id}-${modal.startAt}`}
            purchase={current}
            inventory={inv.data}
            inventoryLoading={inv.loading}
            startAt={modal.startAt}
            onClose={() => setModal(null)}
          />
        )}
      </Modal>
    </>
  );
}
