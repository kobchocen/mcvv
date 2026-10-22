import type { ComponentProps } from "react";

import { Link } from "@/i18n/routing";
import { paginationWindow } from "@/lib/site/pagination";
import { cn } from "@/lib/utils";

type Href = ComponentProps<typeof Link>["href"];

/** Plain links between pages of a server-rendered list (works without JavaScript). */
export function PaginationLinks({
  page,
  pageCount,
  hrefFor,
  labels,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => Href;
  labels: { nav: string; previous: string; next: string; page: (page: number) => string };
}) {
  if (pageCount <= 1) return null;
  const item =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-full border px-3 font-display text-sm font-semibold";
  const idle =
    "border-race-line/70 text-race-muted hover:border-race-accent hover:text-race-accent";
  return (
    <nav aria-label={labels.nav} className="mt-6">
      <ul className="flex flex-wrap items-center gap-2">
        {page > 1 ? (
          <li>
            <Link href={hrefFor(page - 1)} rel="prev" className={cn(item, idle)}>
              ← {labels.previous}
            </Link>
          </li>
        ) : null}
        {paginationWindow(page, pageCount).map((p, index) =>
          p === "gap" ? (
            <li key={`gap-${index}`} className="px-1 text-race-dim" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={p}>
              {p === page ? (
                <span
                  aria-current="page"
                  className={cn(item, "border-race-accent bg-race-accent-solid text-white")}
                >
                  {p}
                </span>
              ) : (
                <Link href={hrefFor(p)} aria-label={labels.page(p)} className={cn(item, idle)}>
                  {p}
                </Link>
              )}
            </li>
          ),
        )}
        {page < pageCount ? (
          <li>
            <Link href={hrefFor(page + 1)} rel="next" className={cn(item, idle)}>
              {labels.next} →
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
