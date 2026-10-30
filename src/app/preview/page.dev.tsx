"use client";

// Development-only design preview (excluded from production builds via the
// `dev.tsx` page extension). Renders real shell/onboarding/dashboard components
// with fixture sessions and data so layouts can be checked without signing in.
// Usage: /preview/?screen=signin|onboarding|dashboard|budget|kit|modal

import type { User } from "firebase/auth";
import {
  Check,
  Copy,
  House,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { InteriorFrame, Onboarding, SignIn } from "@/components/AppShell";
import { BudgetView } from "@/components/budget/BudgetView";
import { DashboardView } from "@/components/DashboardView";
import {
  SessionContext,
  type SessionState,
} from "@/components/SessionProvider";
import {
  Badge,
  Bar,
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
import type { InventoryItem, Purchase, Task } from "@/lib/types";

const TODAY = "2026-10-30";
const user = {
  uid: "preview",
  email: "you@example.com",
  displayName: "Preview Member",
  photoURL: null,
} as unknown as User;

const household = {
  id: "preview",
  name: "Preview Household",
  ownerUid: "preview",
  householdSize: 5,
};
const member = {
  uid: "preview",
  displayName: "Preview Member",
  email: "you@example.com",
  photoURL: null,
  role: "owner" as const,
};

const item = (p: Partial<InventoryItem>): InventoryItem => ({
  id: Math.random().toString(36).slice(2),
  name: "Item",
  category: "Water",
  quantity: 1,
  unit: "gal",
  location: "Garage",
  expiresOn: null,
  notes: "",
  ...p,
});

const INVENTORY: InventoryItem[] = [
  item({ name: "Water jugs", quantity: 8, unit: "gal" }),
  item({
    name: "Canned soup",
    category: "Food",
    quantity: 18,
    unit: "meals",
    expiresOn: "2026-11-20",
  }),
  item({
    name: "Freeze-dried meals",
    category: "Food",
    quantity: 4,
    unit: "person-days",
  }),
  item({
    name: "First aid kit",
    category: "Medical",
    quantity: 1,
    unit: "kit",
  }),
  item({
    name: "Antibiotic ointment",
    category: "Medical",
    quantity: 2,
    unit: "each",
    expiresOn: "2026-10-12",
  }),
  item({ name: "LED lantern", category: "Power", quantity: 2, unit: "each" }),
];

const task = (p: Partial<Task>): Task => ({
  id: Math.random().toString(36).slice(2),
  title: "Task",
  notes: "",
  category: "Water",
  milestone: "72h",
  priority: 2,
  status: "todo",
  ...p,
});

const TASKS: Task[] = [
  task({
    title: "Establish 15 gallons of potable water",
    priority: 1,
    status: "in_progress",
  }),
  task({
    title: "Inventory 45 meals (15 person-days) of food",
    category: "Food",
    priority: 1,
  }),
  task({
    title: "Review essential medications and first aid",
    category: "Medical",
    priority: 1,
    status: "complete",
  }),
  task({
    title: "Verify emergency lighting and communications",
    category: "Communications",
  }),
  task({
    title: "Establish emergency sanitation supplies",
    category: "Sanitation",
  }),
  task({
    title: "Create a family evacuation and communications plan",
    category: "Evacuation",
    seedKey: "plan",
  }),
];

const PURCHASES: Purchase[] = [
  {
    id: "p1",
    name: "Weather radio",
    category: "Communications",
    quantity: 1,
    unit: "each",
    estimatedPrice: 39.99,
    priority: 1,
    status: "approved",
    notes: "",
  },
  {
    id: "p2",
    name: "Water storage cubes",
    category: "Water",
    quantity: 2,
    unit: "each",
    estimatedPrice: 24.5,
    priority: 2,
    status: "proposed",
    notes: "",
  },
];

const LINKED_ITEM: InventoryItem = item({
  id: "purchase-b4",
  name: "LED lantern 4-pack",
  category: "Power",
  quantity: 1,
  unit: "pack",
});

const BUDGET: Purchase[] = [
  ...PURCHASES.map((p) => ({
    ...p,
    productUrl: "https://example.com/product",
  })),
  {
    id: "b1",
    name: "Heavy-duty 5-gallon BPA-free stackable water storage containers with spigot (set of 6)",
    category: "Water",
    quantity: 6,
    unit: "each",
    estimatedPrice: 18.75,
    priority: 1,
    status: "proposed",
    notes: "",
  },
  {
    id: "b2",
    name: "Hand-crank weather radio",
    category: "Communications",
    quantity: 1,
    unit: "each",
    estimatedPrice: 45,
    priority: 2,
    status: "acquired",
    notes: "",
    actualCostCents: 3999,
    productUrl: "https://example.com/radio",
  },
  {
    id: "b3",
    name: "Emergency toilet kit",
    category: "Sanitation",
    quantity: 1,
    unit: "kit",
    estimatedPrice: 32,
    priority: 2,
    status: "acquired",
    notes: "",
  },
  {
    id: "b4",
    name: "LED lantern 4-pack",
    category: "Power",
    quantity: 1,
    unit: "pack",
    estimatedPrice: 29.99,
    priority: 3,
    status: "acquired",
    notes: "",
    actualCostCents: 2849,
    inventoryItemId: "purchase-b4",
  },
  {
    id: "b5",
    name: "N95 masks",
    category: "Medical",
    quantity: 20,
    unit: "each",
    estimatedPrice: null,
    priority: 3,
    status: "proposed",
    notes: "",
  },
];

function Session({
  state,
  children,
}: {
  state: SessionState;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider
      value={{
        state,
        signIn: async () => undefined,
        signOut: async () => undefined,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

const ready: SessionState = {
  status: "ready",
  user,
  household,
  member,
  seedError: null,
};

function Kit() {
  return (
    <InteriorFrame>
      <PageHeader
        title="Design system"
        sub="Cinematic Wilderness components"
        action={
          <Button variant="copper" icon={Plus}>
            Add item
          </Button>
        }
      />
      <div className="grid gap-3 lg:grid-cols-3">
        <Card title="Buttons" icon={House}>
          <div className="flex flex-wrap gap-2">
            <Button variant="emerald" icon={Send}>
              Continue
            </Button>
            <Button variant="emerald" icon={Send} loading>
              Saving…
            </Button>
            <Button variant="emerald" icon={Send} disabled>
              Disabled
            </Button>
            <Button variant="copper" icon={Plus}>
              Create
            </Button>
            <Button variant="copper" icon={Plus} loading>
              Creating…
            </Button>
            <Button variant="copper" icon={Plus} disabled>
              Disabled
            </Button>
            <Button icon={Copy}>Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger" icon={Trash2}>
              Delete
            </Button>
            <Button size="sm" icon={Check}>
              Small
            </Button>
          </div>
        </Card>
        <Card title="Form fields" icon={UserPlus}>
          <div className="space-y-3">
            <Field label="Search">
              <Input icon={Search} placeholder="Search name, location, notes" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <Select defaultValue="Water">
                  <option>Water</option>
                  <option>Food</option>
                </Select>
              </Field>
              <Field label="Disabled">
                <Input disabled value="Read only" readOnly />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea rows={2} placeholder="Notes" />
            </Field>
            <ErrorText>Example validation message.</ErrorText>
          </div>
        </Card>
        <Card title="Status" icon={Users}>
          <div className="flex flex-wrap gap-1.5">
            <Badge>Neutral</Badge>
            <Badge tone="good">Complete</Badge>
            <Badge tone="warn">Medium</Badge>
            <Badge tone="bad">High</Badge>
            <Badge tone="info">In Progress</Badge>
          </div>
          <div className="mt-3 space-y-2">
            <Bar value={8} max={15} />
            <Bar value={15} max={15} />
          </div>
          <Empty>No items match.</Empty>
          <Button variant="emerald" icon={Save} className="w-full">
            Save
          </Button>
        </Card>
      </div>
    </InteriorFrame>
  );
}

function Screen() {
  const screen = useSearchParams().get("screen") ?? "onboarding";
  switch (screen) {
    case "signin":
      return (
        <Session state={{ status: "signedOut" }}>
          <SignIn />
        </Session>
      );
    case "dashboard":
      return (
        <Session state={ready}>
          <InteriorFrame>
            <DashboardView
              householdSize={5}
              inventory={INVENTORY}
              tasks={TASKS}
              purchases={PURCHASES}
              today={TODAY}
            />
          </InteriorFrame>
        </Session>
      );
    case "budget":
      return (
        <Session state={ready}>
          <InteriorFrame>
            <BudgetView
              data={BUDGET}
              loading={false}
              error={null}
              inv={{
                data: [...INVENTORY, LINKED_ITEM],
                loading: false,
                error: null,
              }}
            />
          </InteriorFrame>
        </Session>
      );
    case "kit":
      return (
        <Session state={ready}>
          <Kit />
        </Session>
      );
    case "modal":
      return (
        <Session state={ready}>
          <InteriorFrame>
            <PageHeader title="Inventory" sub="6 items recorded" />
            <Modal open onClose={() => undefined} title="Add inventory item">
              <div className="space-y-3">
                <Field label="Name">
                  <Input defaultValue="Water jugs" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Quantity">
                    <Input type="number" defaultValue={8} />
                  </Field>
                  <Field label="Unit">
                    <Select defaultValue="gal">
                      <option>gal</option>
                    </Select>
                  </Field>
                </div>
                <div className="flex justify-end gap-2">
                  <Button>Cancel</Button>
                  <Button variant="copper" icon={Plus}>
                    Add item
                  </Button>
                </div>
              </div>
            </Modal>
          </InteriorFrame>
        </Session>
      );
    default:
      return (
        <Session state={{ status: "noHousehold", user, notice: null }}>
          <Onboarding />
        </Session>
      );
  }
}

export default function PreviewPage() {
  return (
    <Suspense>
      <Screen />
    </Suspense>
  );
}
