import type { ReactNode } from "react";

import { McvvAdminSectionNav } from "@/components/organisms/mcvv-admin-section-nav";
import { sectionNavItems, type SectionNavItem } from "@/lib/admin/section-nav-core";

type Props = Readonly<{
  /** `null` = navigátor vypnutý (permissions.v2 off) → children beze změny. */
  items: readonly SectionNavItem[] | null;
  title: string;
  children: ReactNode;
}>;

/** Obal dlouhé stránky adminu s navigátorem sekcí (P10). Bez položek vrací obsah beze změny. */
export function McvvAdminSectionFrame({ items, title, children }: Props) {
  const valid = items ? sectionNavItems(items) : [];
  if (valid.length < 2) return <>{children}</>;
  return (
    <div className="xl:flex xl:gap-8" data-testid="section-frame">
      <div className="min-w-0 flex-1">
        <McvvAdminSectionNav items={valid} title={title} variant="chips" />
        {children}
      </div>
      <aside className="hidden w-56 shrink-0 xl:block">
        <McvvAdminSectionNav items={valid} title={title} variant="aside" />
      </aside>
    </div>
  );
}
