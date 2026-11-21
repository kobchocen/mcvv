import { Suspense, type ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  McvvAdminShell,
  McvvFooter,
  McvvLoginNextRedirect,
  McvvPublicNavbar,
} from "@/components/organisms";
import { can, canOpenAdmin, getAccess } from "@/lib/admin/access";
import { isSectionId } from "@/lib/admin/permissions";
import { togglePin } from "@/lib/admin/pin-actions";
import { defaultPins, storedPins } from "@/lib/admin/pins";
import { navTree, visibleSectionsBy } from "@/lib/admin/sections";
import { staffUnreadCount } from "@/lib/messages/store";
import { withFooterYear, type McvvHomepageContent } from "@/components/templates";
import { prisma } from "@/lib/db/client";
import { type Locale } from "@/i18n/routing";

type LayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>;

export default async function AdminLayout({ children, params }: LayoutProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const access = await getAccess();
  const session = access.session;
  if (!session || !canOpenAdmin(access)) {
    return (
      <Suspense fallback={null}>
        <McvvLoginNextRedirect />
      </Suspense>
    );
  }

  const home = await getTranslations({ locale, namespace: "Home" });
  const navCopy = await getTranslations({ locale, namespace: "AdminNav" });
  const unreadMessages = can(access, "messages", "read")
    ? await staffUnreadCount().catch(() => 0)
    : 0;
  // Flag vypnutý: can() = dnešní predikáty rolí, navigace je stejná jako dřív.
  const visible = visibleSectionsBy((item) =>
    isSectionId(item.id) ? can(access, item.id, "read") : (item.allowed?.(session.role) ?? false),
  );
  const groups = navTree(visible, (key) => navCopy(key), {
    unreadMessages,
  });
  // Připnuté (P6): jen při zapnutém permissions.v2, jinak panel beze změny.
  let pins: string[] | null = null;
  if (access.v2) {
    const rows = await prisma.userPin
      .findMany({ where: { userId: session.id }, select: { sectionId: true, pos: true } })
      .catch(() => []);
    pins = (storedPins(rows) ?? defaultPins(access.grants)).filter(
      (id) => isSectionId(id) && can(access, id, "read"),
    );
  }
  const latestYearRow = await prisma.result.findFirst({
    orderBy: { year: "desc" },
    select: { year: true },
  });
  const brand = home.raw("brand") as McvvHomepageContent["brand"];
  const nav = home.raw("nav") as McvvHomepageContent["nav"];
  const footer = withFooterYear(
    home.raw("footer") as McvvHomepageContent["footer"],
    latestYearRow?.year ?? null,
  );

  return (
    <div className="min-h-screen bg-race-deep text-foreground">
      <McvvPublicNavbar content={{ brand, nav }} variant="solid" />
      <McvvAdminShell
        groups={groups}
        copy={{
          home: navCopy("home"),
          navLabel: navCopy("navLabel"),
          search: navCopy("search"),
          noResults: navCopy("noResults"),
          back: navCopy("back"),
          breadcrumb: navCopy("breadcrumb"),
          detail: navCopy("detail"),
          external: navCopy("external"),
          pinned: navCopy("pinned"),
          pinEdit: navCopy("pinEdit"),
          pinDone: navCopy("pinDone"),
          pin: navCopy("pin"),
          unpin: navCopy("unpin"),
        }}
        pins={pins ? { ids: pins, toggle: togglePin } : undefined}
      >
        {children}
      </McvvAdminShell>
      <McvvFooter content={{ brand, footer }} />
    </div>
  );
}
