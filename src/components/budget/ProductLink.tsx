import { ExternalLink } from "lucide-react";
import { safeProductHref } from "@/lib/budget";
import { cx } from "@/components/ui";

/**
 * "View product" link for a stored product URL. The URL is re-validated at
 * render time and only ever used as an href (never rendered as HTML).
 */
export function ProductLink({
  url,
  itemName,
  className,
}: {
  url: unknown;
  itemName: string;
  className?: string;
}) {
  const href = safeProductHref(url);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      referrerPolicy="no-referrer"
      aria-label={`View product: ${itemName} (opens in a new tab)`}
      className={cx(
        "btn btn-secondary text-xs font-medium",
        "h-8 px-2.5 text-copper-light hover:text-amber",
        className,
      )}
    >
      <ExternalLink size={14} aria-hidden />
      View product
    </a>
  );
}
