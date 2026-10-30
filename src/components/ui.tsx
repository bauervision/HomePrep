"use client";

import { Loader2, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

/**
 * emerald — primary continuation actions
 * copper  — meaningful creation / milestone actions
 * secondary, ghost, danger — quieter supporting controls
 * ("primary" is kept as an alias of emerald.)
 */
type Variant =
  "emerald" | "primary" | "copper" | "secondary" | "ghost" | "danger";
const VARIANT: Record<Variant, string> = {
  emerald: "btn-emerald",
  primary: "btn-emerald",
  copper: "btn-copper",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

const SIZE = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-[15px]",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ComponentProps<"button"> & {
  variant?: Variant;
  size?: keyof typeof SIZE;
  icon?: LucideIcon;
  loading?: boolean;
}) {
  const iconSize = size === "sm" ? 14 : size === "lg" ? 18 : 16;
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx("btn", SIZE[size], VARIANT[variant], className)}
    >
      {loading ? (
        <Loader2
          size={iconSize}
          className="animate-spin motion-reduce:animate-none"
          aria-hidden
        />
      ) : (
        Icon && <Icon size={iconSize} strokeWidth={2} aria-hidden />
      )}
      {children}
    </button>
  );
}

function withIcon(
  Icon: LucideIcon | undefined,
  control: ReactNode,
  wrapperClassName?: string,
) {
  if (!Icon) return control;
  return (
    <span className={cx("relative block", wrapperClassName)}>
      <Icon
        size={16}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sage"
      />
      {control}
    </span>
  );
}

export function Input({
  className,
  icon,
  wrapperClassName,
  ...props
}: ComponentProps<"input"> & { icon?: LucideIcon; wrapperClassName?: string }) {
  return withIcon(
    icon,
    <input
      {...props}
      className={cx("field h-10 px-3", icon && "pl-9", className)}
    />,
    wrapperClassName,
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={cx("field h-10 px-2.5", className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={cx("field px-3 py-2", className)} />;
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("flex flex-col gap-1.5", className)}>
      <span className="text-[13px] font-medium text-ivory-dim">{label}</span>
      {children}
    </label>
  );
}

/** Card heading: uppercase tracked title, copper icon, copper accent rule. */
export function CardTitle({
  icon: Icon,
  children,
  large,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  large?: boolean;
}) {
  return (
    <div>
      <h2
        className={cx(
          "flex items-center gap-2.5 font-semibold text-ivory uppercase",
          large
            ? "text-sm tracking-[0.2em] sm:text-[15px]"
            : "text-[11px] tracking-[0.16em]",
        )}
      >
        {Icon && (
          <Icon
            size={large ? 22 : 15}
            aria-hidden
            className="shrink-0 text-copper-light"
            fill="currentColor"
            fillOpacity={0.2}
          />
        )}
        {children}
      </h2>
      <span className={cx("rule-copper", large ? "mt-3" : "mt-1.5")} />
    </div>
  );
}

export function Card({
  title,
  icon,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("surface min-w-0", className)}>
      {title && (
        <header className="flex items-start justify-between gap-2 px-4 pt-3">
          <CardTitle icon={icon}>{title}</CardTitle>
          {action}
        </header>
      )}
      <div className={cx("px-4 pb-3.5", title ? "pt-2.5" : "pt-3.5")}>
        {children}
      </div>
    </section>
  );
}

type Tone = "neutral" | "good" | "warn" | "bad" | "info";
const TONE: Record<Tone, string> = {
  neutral: "bg-well text-sage ring-line",
  good: "bg-pine/15 text-[#7fd8ad] ring-pine/30",
  warn: "bg-amber/12 text-amber ring-amber/30",
  bad: "bg-rust/12 text-rust ring-rust/30",
  info: "bg-sky/12 text-sky ring-sky/30",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md px-1.5 py-[3px] text-[11px] leading-none font-medium whitespace-nowrap ring-1 ring-inset",
        TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Bar({ value, max }: { value: number; max: number }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className={cx(
          "h-full rounded-full",
          ratio >= 1
            ? "bg-gradient-to-r from-pine-deep to-pine"
            : "bg-gradient-to-r from-copper to-amber",
        )}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // showModal() focuses the first focusable element (the close button);
      // content can opt a field in with data-autofocus instead.
      d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        "surface m-auto w-[calc(100%-2rem)] p-0 text-ivory backdrop:bg-[#020609]/75 backdrop:backdrop-blur-[2px]",
        wide ? "max-w-2xl" : "max-w-lg",
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-xs font-semibold tracking-[0.16em] text-ivory uppercase">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-sage outline-none hover:bg-well hover:text-ivory focus-visible:ring-2 focus-visible:ring-amber"
              aria-label="Close"
            >
              <X size={16} aria-hidden />
            </button>
          </header>
          <div className="overflow-y-auto p-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-xs text-rust">
      {children}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate">{children}</p>;
}

export function PageHeader({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ivory">
          {title}
        </h1>
        {sub && <p className="mt-0.5 text-xs text-sage">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/** Text link styled in the copper accent. */
export const linkClass =
  "text-copper-light underline-offset-2 outline-none hover:text-amber hover:underline focus-visible:underline";

export { cx };
