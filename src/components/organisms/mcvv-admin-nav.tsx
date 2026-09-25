"use client";

import { Link, usePathname } from "@/i18n/routing";

export type AdminNavItem = {
  href: "/admin" | "/admin/partneri" | "/admin/rocniky" | "/admin/ciselniky" | "/admin/prihlasky";
  label: string;
};

export function McvvAdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
      {items.map((item) => {
        const active =
          item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "font-semibold text-race-accent"
                : "text-foreground/80 hover:text-foreground dark:text-white/75 dark:hover:text-white"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
