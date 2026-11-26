import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ComponentProps } from "react";

import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export type SortableColumnHeaderProps = {
  label: string;
  href: ComponentProps<typeof Link>["href"];
  active: boolean;
  /** Direction of the active column; ignored when the column is inactive (shows ⇅). */
  direction?: "asc" | "desc";
  align?: "left" | "right";
  className?: string;
  /** Already localized accessible name (sort by / currently sorted, with direction). */
  ariaLabel: string;
};

/**
 * Clickable table header for a GET-sorted list: the whole cell is the hit target,
 * the active column shows a clear ↑/↓ arrow, other sortable columns a muted ⇅.
 */
export function SortableColumnHeader({
  label,
  href,
  active,
  direction = "desc",
  align = "left",
  className,
  ariaLabel,
}: SortableColumnHeaderProps) {
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={cn("p-0", className)}
    >
      <Link
        href={href}
        className={cn(
          "inline-flex w-full cursor-pointer items-center gap-1 py-2 pr-4",
          "hover:text-race-accent",
          align === "right" ? "justify-end" : "justify-start",
          active ? "text-race-accent" : "text-inherit",
        )}
        aria-label={ariaLabel}
      >
        <span>{label}</span>
        <Icon
          aria-hidden="true"
          className={cn("size-3.5 shrink-0", active ? "opacity-100" : "opacity-45")}
        />
      </Link>
    </th>
  );
}
