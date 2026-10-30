import {
  LayoutDashboard,
  ListChecks,
  NotebookText,
  Package,
  ShoppingCart,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Primary destinations. "Budget" keeps the /purchases route for compatibility. */
export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory/", label: "Inventory", icon: Package },
  { href: "/tasks/", label: "Tasks", icon: ListChecks },
  { href: "/purchases/", label: "Budget", icon: ShoppingCart },
  { href: "/notes/", label: "Notes", icon: NotebookText },
  { href: "/household/", label: "Household", icon: Users },
];

const norm = (p: string) => (p.endsWith("/") ? p : `${p}/`);

export function isActive(pathname: string, href: string) {
  return norm(pathname) === href;
}

export function currentNav(pathname: string): NavItem | undefined {
  return NAV.find((n) => isActive(pathname, n.href));
}
