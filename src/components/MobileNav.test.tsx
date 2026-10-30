// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        e.preventDefault();
        rest.onClick?.(e);
      }}
    >
      {children}
    </a>
  ),
}));

const { MobileNav } = await import("./MobileNav");

afterEach(cleanup);

const trigger = () =>
  screen.getByRole("button", { name: /menu, current page/i });

describe("MobileNav", () => {
  it("shows the current page and starts closed", () => {
    render(<MobileNav pathname="/purchases/" onSignOut={() => {}} />);
    expect(trigger()).toHaveProperty(
      "textContent",
      expect.stringContaining("Budget"),
    );
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("opens with all destinations, highlights the active route and focuses it", () => {
    render(<MobileNav pathname="/inventory" onSignOut={() => {}} />);
    fireEvent.click(trigger());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(trigger().getAttribute("aria-controls")).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Dashboard",
      "Inventory",
      "Tasks",
      "Budget",
      "Household",
    ]);
    expect(within(nav).queryByText("Purchases")).toBeNull();
    const active = within(nav).getByRole("link", { name: "Inventory" });
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(document.activeElement).toBe(active);
    expect(
      within(nav).getByRole("link", { name: "Budget" }).getAttribute("href"),
    ).toBe("/purchases/");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("closes on Escape and returns focus to the trigger", () => {
    render(<MobileNav pathname="/" onSignOut={() => {}} />);
    fireEvent.click(trigger());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("closes on an outside click", () => {
    render(
      <div>
        <p>outside</p>
        <MobileNav pathname="/" onSignOut={() => {}} />
      </div>,
    );
    fireEvent.click(trigger());
    fireEvent.pointerDown(screen.getByText("outside"));
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("closes when a destination is chosen and when the route changes", () => {
    const { rerender } = render(
      <MobileNav pathname="/" onSignOut={() => {}} />,
    );
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("link", { name: "Tasks" }));
    expect(screen.queryByRole("navigation")).toBeNull();

    fireEvent.click(trigger());
    expect(screen.getByRole("navigation")).toBeTruthy();
    act(() => rerender(<MobileNav pathname="/tasks/" onSignOut={() => {}} />));
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(trigger().textContent).toContain("Tasks");
  });

  it("supports arrow-key movement between items", () => {
    render(<MobileNav pathname="/" onSignOut={() => {}} />);
    fireEvent.click(trigger());
    const nav = screen.getByRole("navigation");
    expect(document.activeElement?.textContent).toBe("Dashboard");
    fireEvent.keyDown(nav, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toBe("Inventory");
    fireEvent.keyDown(nav, { key: "End" });
    expect(document.activeElement?.textContent).toBe("Sign out");
    fireEvent.keyDown(nav, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toBe("Dashboard");
  });

  it("signs out and closes", () => {
    const onSignOut = vi.fn();
    render(
      <MobileNav
        pathname="/"
        onSignOut={onSignOut}
        account="Home · a@example.com"
      />,
    );
    fireEvent.click(trigger());
    expect(screen.getByText("Home · a@example.com")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledOnce();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  describe("backdrop", () => {
    const backdrop = () => screen.getByTestId("mobile-nav-backdrop");

    it("is hidden and inert while closed, visible at 60% black when open", () => {
      render(<MobileNav pathname="/" onSignOut={() => {}} />);
      expect(backdrop().dataset.state).toBe("closed");
      expect(backdrop().className).toContain("opacity-0");
      expect(backdrop().className).toContain("pointer-events-none");
      fireEvent.click(trigger());
      expect(backdrop().dataset.state).toBe("open");
      expect(backdrop().className).toContain("bg-black/60");
      expect(backdrop().className).toContain("opacity-100");
      // Fades, except for users who prefer reduced motion.
      expect(backdrop().className).toContain("duration-200");
      expect(backdrop().className).toContain("motion-reduce:transition-none");
      // Rendered outside the header so it can cover the page; header stays above.
      expect(backdrop().parentElement).toBe(document.body);
      expect(backdrop().getAttribute("aria-hidden")).toBe("true");
    });

    it("closes on tap without letting the press fall through, and restores focus", () => {
      render(<MobileNav pathname="/" onSignOut={() => {}} />);
      fireEvent.click(trigger());
      fireEvent.pointerDown(backdrop());
      expect(screen.getByRole("navigation")).toBeTruthy(); // still open on press
      fireEvent.click(backdrop());
      expect(screen.queryByRole("navigation")).toBeNull();
      expect(backdrop().dataset.state).toBe("closed");
      expect(document.activeElement).toBe(trigger());
    });

    it("locks page scrolling while open and restores it on close", () => {
      document.body.style.overflow = "auto";
      render(<MobileNav pathname="/" onSignOut={() => {}} />);
      fireEvent.click(trigger());
      expect(document.documentElement.style.overflow).toBe("hidden");
      expect(document.body.style.overflow).toBe("hidden");
      fireEvent.keyDown(document, { key: "Escape" });
      expect(document.documentElement.style.overflow).toBe("");
      expect(document.body.style.overflow).toBe("auto");
      expect(document.activeElement).toBe(trigger());
      document.body.style.overflow = "";
    });

    it("restores scrolling if unmounted while open and after navigation", () => {
      const { unmount, rerender } = render(
        <MobileNav pathname="/" onSignOut={() => {}} />,
      );
      fireEvent.click(trigger());
      act(() =>
        rerender(<MobileNav pathname="/tasks/" onSignOut={() => {}} />),
      );
      expect(document.body.style.overflow).toBe("");
      fireEvent.click(trigger());
      expect(document.body.style.overflow).toBe("hidden");
      unmount();
      expect(document.body.style.overflow).toBe("");
      expect(document.documentElement.style.overflow).toBe("");
    });
  });
});
