import { Suspense, type ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  McvvAdminShell,
  McvvFooter,
  McvvLoginNextRedirect,
  McvvPublicNavbar,
} from "@/components/organisms";
import { can, canOpenAdmin, getAccess } from "@/lib/admin/access";
import { McvvAdminViewAsBar } from "@/components/organisms/mcvv-admin-view-as";
import { isSectionId } from "@/lib/admin/permissions";
import { togglePin } from "@/lib/admin/pin-actions";
import { defaultPins, storedPins } from "@/lib/admin/pins";
import { navTree, visibleSectionsBy } from "@/lib/admin/sections";
import { staffUnreadCount } from "@/lib/messages/store";
import { withFooterYear, type McvvHomepageContent } from "@/components/templates";
import { prisma } from "@/lib/db/client";
import { redirect, type Locale } from "@/i18n/routing";

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
  if (session && !canOpenAdmin(access)) {
    // Přihlášený účet bez rozcestníku: rovnou pryč, ne prázdná stránka s klientským
    // přesměrováním na přihlášení (to by ho poslalo zpět sem). Resultboard na své obrazovky,
    // závodník na přihlášky (stejně jako výchozí cíl po přihlášení).
    redirect({ href: session.role === "resultboard" ? "/resultboard" : "/prihlasky", locale });
  }
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
  // Editor oprávnění (P8) jen při zapnutém přepínači.
  const visible = visibleSectionsBy((item) =>
    item.id === "permissions" && !access.v2
      ? false
      : isSectionId(item.id)
        ? can(access, item.id, "read")
        : (item.allowed?.(session.role) ?? false),
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
  // Náhled očima jiné role: viditelný pruh s ukončením (role podle režimu náhledu).
  let viewAsBar: ReactNode = null;
  if (access.preview) {
    const usersCopy = await getTranslations({ locale, namespace: "AdminUsers" });
    const viewCopy = await getTranslations({ locale, namespace: "AdminViewAs" });
    const preview = access.preview;
    const labels = preview.roles.map((role) =>
      usersCopy.has(`${preview.mode === "v2" ? "staffRole" : "role"}_${role}`)
        ? usersCopy(`${preview.mode === "v2" ? "staffRole" : "role"}_${role}` as "role_admin")
        : role,
    );
    viewAsBar = (
      <McvvAdminViewAsBar
        locale={locale}
        title={viewCopy("barTitle", { roles: labels.join(", ") })}
        readOnly={viewCopy("barReadOnly")}
        stop={viewCopy("stop")}
      />
    );
  }
  const brand = home.raw("brand") as McvvHomepageContent["brand"];
  const nav = home.raw("nav") as McvvHomepageContent["nav"];
  const footer = withFooterYear(
    home.raw("footer") as McvvHomepageContent["footer"],
    latestYearRow?.year ?? null,
  );

  return (
    <div className="min-h-screen bg-race-deep text-foreground">
      {viewAsBar}
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
