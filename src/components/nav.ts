import {
  BookOpen,
  LayoutDashboard,
  ShieldCheck,
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
  { href: "/library/", label: "Library", icon: BookOpen },
  { href: "/household/", label: "Household", icon: Users },
];

/** Platform administration; listed only for the platform administrator. */
export const ADMIN_NAV: NavItem = {
  href: "/admin/",
  label: "Admin",
  icon: ShieldCheck,
};

/** Navigation for this user. Showing Admin is not authorization. */
export const navFor = (admin: boolean) => (admin ? [...NAV, ADMIN_NAV] : NAV);

const norm = (p: string) => (p.endsWith("/") ? p : `${p}/`);

export function isActive(pathname: string, href: string) {
  return norm(pathname) === href;
}

export function currentNav(
  pathname: string,
  items: NavItem[] = NAV,
): NavItem | undefined {
  return items.find((n) => isActive(pathname, n.href));
}
