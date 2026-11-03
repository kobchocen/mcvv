import type { ComponentProps } from "react";

import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

type Href = ComponentProps<typeof Link>["href"];

export type McvvAdminDictsSubnavItem = {
  href: Href;
  label: string;
  active?: boolean;
  testId?: string;
};

/**
 * Podnabídka číselníku (Běžci, Kluby): odkaz zpět na Číselníky a záložky sekce
 * (např. Hledání a úpravy · Slučování běžců). Slučování tak patří pod svůj číselník.
 */
export function McvvAdminDictsSubnav({
  backLabel,
  label,
  items,
}: {
  /** „Číselníky“ – odkaz zpět na rozcestník. */
  backLabel: string;
  /** Přístupný název navigace (název číselníku). */
  label: string;
  items: McvvAdminDictsSubnavItem[];
}) {
  return (
    <div className="mb-6">
      <Link
        href="/admin/ciselniky"
        className="text-sm font-semibold text-race-accent hover:underline"
      >
        ← {backLabel}
      </Link>
      <nav
        aria-label={label}
        className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-b border-race-line/55"
        data-testid="dicts-subnav"
      >
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            aria-current={item.active ? "page" : undefined}
            data-testid={item.testId}
            className={cn(
              "-mb-px border-b-2 py-2 text-sm font-semibold transition-colors",
              item.active
                ? "border-race-accent text-foreground dark:text-white"
                : "border-transparent text-race-muted hover:border-race-line hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Záložky číselníku klubů: seznam, slučování, úklid nepoužívaných klubů (jen admin). */
export function clubsSubnav(
  labels: { list: string; merge: string; orphans: string },
  isAdmin: boolean,
  active: "list" | "merge" | "orphans",
): McvvAdminDictsSubnavItem[] {
  return [
    { href: "/admin/ciselniky/kluby", label: labels.list, active: active === "list" },
    {
      href: "/admin/ciselniky/kluby/slouceni",
      label: labels.merge,
      active: active === "merge",
      testId: "subnav-club-merge",
    },
    ...(isAdmin
      ? [
          {
            href: "/admin/ciselniky/kluby/sirotci" as const,
            label: labels.orphans,
            active: active === "orphans",
          },
        ]
      : []),
  ];
}

/** Záložky číselníku běžců: hledání a úpravy, slučování, úklid běžců bez dat (vše jen admin). */
export function runnersSubnav(
  labels: { search: string; merge: string; orphans: string },
  active: "search" | "merge" | "orphans" | null,
): McvvAdminDictsSubnavItem[] {
  return [
    { href: "/admin/ciselniky/bezci", label: labels.search, active: active === "search" },
    {
      href: "/admin/ciselniky/bezci/slouceni",
      label: labels.merge,
      active: active === "merge",
      testId: "subnav-runner-merge",
    },
    {
      href: "/admin/ciselniky/bezci/sirotci",
      label: labels.orphans,
      active: active === "orphans",
      testId: "subnav-runner-orphans",
    },
  ];
}
