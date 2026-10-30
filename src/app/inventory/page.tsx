"use client";

import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { InventoryItemForm } from "@/components/InventoryItemForm";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorText,
  Input,
  Modal,
  PageHeader,
  Select,
} from "@/components/ui";
import { useInventory } from "@/lib/data";
import { daysUntil, localToday } from "@/lib/readiness";
import { CATEGORIES, type Category, type InventoryItem } from "@/lib/types";

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
          <InventoryItemForm
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? null : editing}
            inventory={data}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}
