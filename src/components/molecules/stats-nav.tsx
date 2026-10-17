import { Link } from "@/i18n/routing";

export type StatsNavItem = { slug: string; label: string };

/** Pill navigation between the statistics pages; scrolls horizontally on small screens. */
export function StatsNav({
  items,
  current,
  ariaLabel,
}: {
  items: StatsNavItem[];
  current: string;
  ariaLabel: string;
}) {
  return (
    <nav aria-label={ariaLabel} className="-mx-4 mt-8 sm:mx-0">
      <ul className="flex snap-x gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:flex-wrap sm:overflow-visible sm:px-0">
        {items.map((item) => {
          const active = item.slug === current;
          return (
            <li key={item.slug} className="shrink-0 snap-start">
              <Link
                href={{ pathname: "/statistiky/[slug]", params: { slug: item.slug } }}
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
