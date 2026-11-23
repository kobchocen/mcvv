import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/** `slug: ""` is the overview page (/statistiky). Optional `href` is a public path such as /kluby. */
export type StatsNavItem = {
  slug: string;
  label: string;
  href?: "/kluby" | "/statistiky";
};

export const STATS_OVERVIEW_SLUG = "";

/** Insert the Clubs item into the statistics nav, in front of Countries when present. */
export function withClubsNavItem(items: StatsNavItem[], label: string): StatsNavItem[] {
  const clubs: StatsNavItem = { slug: "kluby", label, href: "/kluby" };
  if (items.some((item) => item.slug === "kluby")) return items;
  const index = items.findIndex((item) => item.slug === "staty");
  if (index >= 0) return [...items.slice(0, index), clubs, ...items.slice(index)];
  return [...items, clubs];
}

/** Pill navigation between the statistics pages; scrolls horizontally on small screens. */
export function StatsNav({
  items,
  current,
  ariaLabel,
  sticky = false,
}: {
  items: StatsNavItem[];
  current: string;
  ariaLabel: string;
  /** Stick below the site navbar (overview page). */
  sticky?: boolean;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "-mx-4 mt-8 sm:mx-0",
        sticky &&
          "sticky top-[83px] z-40 border-b border-race-line/60 bg-race-deep/90 pt-3 backdrop-blur supports-[backdrop-filter]:bg-race-deep/75 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
      )}
    >
      <ul
        className={cn(
          "flex snap-x gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:px-0",
          sticky ? "pb-3 [scrollbar-width:none]" : "sm:flex-wrap sm:overflow-visible",
        )}
      >
        {items.map((item) => {
          const active = item.slug === current;
          const href =
            item.href ??
            (item.slug === STATS_OVERVIEW_SLUG
              ? "/statistiky"
              : { pathname: "/statistiky/[slug]" as const, params: { slug: item.slug } });
          return (
            <li key={item.slug || "overview"} className="shrink-0 snap-start">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "inline-flex h-9 items-center whitespace-nowrap rounded-full border border-race-accent bg-race-accent-solid px-4 font-display text-sm font-semibold text-white"
                    : "inline-flex h-9 items-center whitespace-nowrap rounded-full border border-race-line/70 bg-race-surface/60 px-4 font-display text-sm font-semibold text-race-muted transition hover:border-race-accent hover:text-race-accent"
                }
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
