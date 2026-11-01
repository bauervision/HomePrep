"use client";

import { ChevronDown, LogOut, Menu } from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { currentNav, isActive, NAV, type NavItem } from "./nav";
import { cx } from "./ui";

/**
 * Compact dropdown navigation for small screens (below `lg`).
 * Closes on navigation, outside click, backdrop tap, Escape, and when focus
 * leaves the menu. While open, a dimming backdrop covers the page below the
 * header and background scrolling is locked.
 */

const noopSubscribe = () => () => {};

/** Locks page scrolling; returns a function that restores the prior state. */
export function lockScroll() {
  const html = document.documentElement;
  const body = document.body;
  const prev = [html.style.overflow, body.style.overflow];
  html.style.overflow = "hidden";
  body.style.overflow = "hidden";
  return () => {
    html.style.overflow = prev[0];
    body.style.overflow = prev[1];
  };
}
export function MobileNav({
  pathname,
  onSignOut,
  account,
  items = NAV,
}: {
  pathname: string;
  onSignOut: () => void;
  account?: string;
  items?: NavItem[];
}) {
  // Tied to the pathname it was opened on, so any navigation closes it.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  // Portals need the DOM; false during server rendering.
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const current = currentNav(pathname, items);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      // The backdrop closes on click instead, so the tap can't fall through
      // to content underneath once the backdrop stops catching pointer events.
      if (backdropRef.current?.contains(target)) return;
      if (!rootRef.current?.contains(target)) setOpenFor(null);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpenFor(null);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    const unlockScroll = lockScroll();
    // Move focus into the menu: the current page, else the first item.
    const target =
      panelRef.current?.querySelector<HTMLElement>('[aria-current="page"]') ??
      panelRef.current?.querySelector<HTMLElement>("a,button");
    target?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [open]);

  function onPanelKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>("a,button") ?? [],
    );
    const i = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (i + 1) % items.length;
    else if (e.key === "ArrowUp") next = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next >= 0) {
      e.preventDefault();
      items[next]?.focus();
    }
  }

  const backdrop =
    isClient &&
    createPortal(
      <div
        ref={backdropRef}
        aria-hidden
        data-testid="mobile-nav-backdrop"
        data-state={open ? "open" : "closed"}
        onClick={() => {
          setOpenFor(null);
          buttonRef.current?.focus();
        }}
        className={cx(
          // Below the sticky header (z-20), above page content.
          "fixed inset-0 z-10 bg-black/60 transition-opacity duration-200 ease-out motion-reduce:transition-none lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />,
      document.body,
    );

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (
          open &&
          e.relatedTarget &&
          !rootRef.current?.contains(e.relatedTarget as Node)
        ) {
          setOpenFor(null);
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpenFor(open ? null : pathname)}
        className={cx(
          "flex h-11 min-w-11 items-center gap-2 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-amber",
          open
            ? "border-line-strong bg-white/[0.06] text-ivory"
            : "border-line text-ivory-dim hover:border-line-strong hover:text-ivory",
        )}
      >
        <Menu size={18} aria-hidden className="text-copper-light" />
        <span className="sr-only">Menu, current page: </span>
        <span className="max-w-[9rem] truncate font-medium">
          {current?.label ?? "Menu"}
        </span>
        <ChevronDown
          size={14}
          aria-hidden
          className={cx(
            "text-slate transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>

      {backdrop}
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          onKeyDown={onPanelKeyDown}
          className="absolute top-[calc(100%+0.6rem)] right-0 z-30 w-64 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-line-strong bg-[#08141a] p-1.5 shadow-[0_24px_48px_-12px_rgb(0_0_0/0.9),inset_0_1px_0_rgb(255_240_220/0.06)]"
        >
          <nav aria-label="Main">
            <ul>
              {items.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setOpenFor(null)}
                      className={cx(
                        "relative flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] outline-none focus-visible:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-amber",
                        active
                          ? "bg-white/[0.04] font-medium text-ivory"
                          : "text-ivory-dim hover:bg-white/[0.04] hover:text-ivory",
                      )}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gradient-to-b from-copper-light to-copper"
                        />
                      )}
                      <Icon
                        size={17}
                        aria-hidden
                        className={active ? "text-copper-light" : "text-slate"}
                      />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="mt-1.5 border-t border-line pt-1.5">
            {account && (
              <p className="truncate px-3 pt-0.5 pb-1 text-[11px] text-slate">
                {account}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setOpenFor(null);
                onSignOut();
              }}
              className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] text-ivory-dim outline-none hover:bg-white/[0.04] hover:text-ivory focus-visible:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-amber"
            >
              <LogOut size={17} aria-hidden className="text-slate" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
