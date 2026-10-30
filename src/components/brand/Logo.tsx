import { useId } from "react";
import mark from "./mark.json";

const MARK = mark.paths;
const MARK_COLORS = mark.colors;
const MARK_VIEWBOX = mark.viewBox;

/** HP shelter monogram: copper roofline, ivory HP, evergreen tree. */
export function LogoMark({
  size = 40,
  className,
  title = "HomePrep",
}: {
  size?: number;
  className?: string;
  title?: string | null;
}) {
  const id = useId().replace(/:/g, "");
  const [c0, c1, c2] = MARK_COLORS.copper;
  const [i0, i1, i2] = MARK_COLORS.ivory;
  const [t0, t1, t2] = MARK_COLORS.tree;
  // Slightly heavier strokes keep the roofline legible at small sizes.
  const stroke = size < 32 ? 6.5 : 5;
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      width={size}
      height={(size * 128) / 136}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title ?? undefined}
    >
      <defs>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c0} />
          <stop offset=".5" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
        <linearGradient id={`${id}i`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={i0} />
          <stop offset=".55" stopColor={i1} />
          <stop offset="1" stopColor={i2} />
        </linearGradient>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t0} />
          <stop offset=".5" stopColor={t1} />
          <stop offset="1" stopColor={t2} />
        </linearGradient>
      </defs>
      <g
        fill="none"
        stroke={`url(#${id}c)`}
        strokeWidth={stroke}
        strokeLinejoin="miter"
        strokeLinecap="square"
      >
        <path d={MARK.roof} />
        <path d={MARK.leftWall} />
        <path d={MARK.rightWall} />
      </g>
      <path d={MARK.tree} fill={`url(#${id}t)`} />
      <g fill={`url(#${id}i)`}>
        <path d={MARK.hStem} />
        <path d={MARK.hBar} />
        <path d={MARK.pStem} />
        <path d={MARK.pBowl} fillRule="evenodd" />
      </g>
    </svg>
  );
}

/** Logo + HomePrep wordmark, with optional tagline. */
export function Logo({
  size = "md",
  tagline = false,
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  tagline?: boolean;
  className?: string;
}) {
  const mark = { sm: 30, md: 44, lg: 96 }[size];
  const word = {
    sm: "text-[17px]",
    md: "text-2xl",
    lg: "text-4xl sm:text-5xl",
  }[size];
  return (
    <span className={`flex items-center gap-2.5 sm:gap-3.5 ${className}`}>
      <LogoMark
        size={mark}
        title={null}
        className="shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
      />
      <span className="flex min-w-0 flex-col">
        <span className={`leading-none font-bold tracking-tight ${word}`}>
          <span className="text-ivory">Home</span>
          <span className="text-copper-gradient">Prep</span>
        </span>
        {tagline && (
          <span className="mt-2 text-[10px] font-medium tracking-[0.16em] text-sage uppercase sm:text-xs sm:tracking-[0.28em]">
            Prepare today. Protect tomorrow.
          </span>
        )}
      </span>
    </span>
  );
}
