import { versionLabel } from "@/lib/version";

/** Subtle application version, e.g. "v0.3.0" (shared by sign-in and navbar). */
export function VersionLabel({ className = "" }: { className?: string }) {
  const label = versionLabel();
  if (!label) return null;
  return (
    <span
      data-testid="app-version"
      className={`font-mono text-[10px] leading-none tracking-wide text-slate tabular-nums ${className}`}
    >
      {label}
    </span>
  );
}
