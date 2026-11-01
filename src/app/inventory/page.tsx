"use client";

import { ArrowLeft, CircleCheck, Info, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { InventoryItemForm } from "@/components/InventoryItemForm";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorText,
  Input,
  linkClass,
  Modal,
  PageHeader,
  Select,
} from "@/components/ui";
import { useInventory } from "@/lib/data";
import { parseCategory } from "@/lib/inventory";
import { classifyItem, describeQuantity } from "@/lib/quantities";
import { daysUntil, localToday, type ReadinessFeedback } from "@/lib/readiness";
import { CATEGORIES, type Category } from "@/lib/types";
import { setParams, useSearch } from "@/lib/url-state";

type Editing = { kind: "new" } | { kind: "edit"; id: string } | null;

/** A Goals workspace URL to return to (only same-app goal links). */
function returnToGoal(from: string | null) {
  return from && /^\/goals\/\?[\w=&%.-]*$/.test(from) ? from : null;
}

/**
 * Deep links: /inventory/?category=Water filters (URL-backed, survives
 * refresh and back/forward); &add=1 opens Add item preset to that category;
 * ?item=<id> opens that record.
 */
export default function InventoryPage() {
  const { data, loading, error } = useInventory();
  const params = useSearch();
  const filter: Category | "All" =
    parseCategory(params.get("category")) ?? "All";
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Editing>(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search);
    const item = p.get("item");
    if (item) return { kind: "edit", id: item };
    return p.get("add") === "1" ? { kind: "new" } : null;
  });
  const [feedback, setFeedback] = useState<ReadinessFeedback[] | null>(null);
  const today = localToday();

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter(
      (i) =>
        (filter === "All" || i.category === filter) &&
        (!q || `${i.name} ${i.location} ${i.notes}`.toLowerCase().includes(q)),
    );
  }, [data, filter, search]);

  const editItem =
    editing?.kind === "edit"
      ? (data.find((i) => i.id === editing.id) ?? null)
      : null;
  const open = editing?.kind === "new" || editItem !== null;

  function openNew() {
    setFeedback(null);
    setEditing({ kind: "new" });
  }
  function close() {
    setEditing(null);
    // One-shot deep-link parameters must not reopen the dialog on refresh.
    if (params.has("add") || params.has("item"))
      setParams({ add: null, item: null });
  }

  const addLabel = filter === "All" ? "Add item" : `Add ${filter} item`;
  const backTo = returnToGoal(params.get("from"));

  return (
    <>
      {backTo && (
        <Link
          href={backTo}
          className={`mb-2 inline-flex min-h-9 items-center gap-1.5 text-sm ${linkClass}`}
        >
          <ArrowLeft size={14} aria-hidden />
          Back to goal
        </Link>
      )}
      <PageHeader
        title="Inventory"
        sub={
          filter === "All"
            ? `${data.length} items recorded`
            : `${rows.length} of ${data.length} items · ${filter}`
        }
        action={
          <Button variant="copper" icon={Plus} onClick={openNew}>
            {addLabel}
          </Button>
        }
      />
      {feedback && feedback.length > 0 && (
        <div
          role="status"
          className="mb-3 flex items-start gap-2 rounded-md border border-line bg-well px-3 py-2 text-sm"
        >
          <ul className="flex-1 space-y-0.5">
            {feedback.map((f) => (
              <li key={f.text} className="flex gap-2">
                {f.tone === "met" ? (
                  <CircleCheck
                    size={15}
                    aria-hidden
                    className="mt-0.5 shrink-0 text-pine"
                  />
                ) : (
                  <Info
                    size={15}
                    aria-hidden
                    className="mt-0.5 shrink-0 text-copper-light"
                  />
                )}
                <span
                  className={f.tone === "met" ? "text-ivory" : "text-ivory-dim"}
                >
                  {f.text}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss"
            className="rounded-md p-1 text-sage outline-none hover:text-ivory focus-visible:ring-2 focus-visible:ring-amber"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      )}
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
            aria-label="Category"
            value={filter}
            onChange={(e) =>
              setParams({
                category: e.target.value === "All" ? null : e.target.value,
              })
            }
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
            {search.trim()
              ? "No items match."
              : filter !== "All"
                ? `No ${filter} items recorded yet. Use “${addLabel}” to record one.`
                : data.length
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
                  const c = classifyItem(i, today);
                  return (
                    <tr
                      key={i.id}
                      onClick={() => setEditing({ kind: "edit", id: i.id })}
                      className="cursor-pointer hover:bg-well"
                    >
                      <td className="px-3.5 py-1.5 font-medium text-ivory">
                        <button
                          type="button"
                          className="rounded-sm text-left outline-none hover:text-copper-light focus-visible:ring-2 focus-visible:ring-amber"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing({ kind: "edit", id: i.id });
                          }}
                        >
                          {i.name}
                        </button>
                        {c.kind === "unconvertible" && (
                          <span className="ml-1.5" title={c.fix}>
                            <Badge tone="warn">Not counted</Badge>
                          </span>
                        )}
                        {c.kind === "equipment" && (
                          <span className="ml-1.5">
                            <Badge tone="info">Equipment</Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-sage">{i.category}</td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
                        {i.quantity}{" "}
                        <span className="text-slate">{i.unit}</span>
                        {i.contains && (
                          <span
                            className="block text-[11px] text-slate"
                            title={describeQuantity(i)}
                          >
                            {describeQuantity(i).split(" = ")[1]}
                          </span>
                        )}
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
        // A deep-linked item that no longer exists leaves the dialog closed.
        open={open}
        onClose={close}
        title={
          editing?.kind === "new" ? "Add inventory item" : "Edit inventory item"
        }
      >
        {open && (
          <InventoryItemForm
            key={editItem ? editItem.id : "new"}
            initial={editItem}
            initialCategory={filter === "All" ? undefined : filter}
            inventory={data}
            onSaved={setFeedback}
            onDone={close}
          />
        )}
      </Modal>
    </>
  );
}
