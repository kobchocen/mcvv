import { Suspense, type ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getSession, isStaffRole } from "@/lib/auth/session";
import { McvvFooter, McvvLoginNextRedirect, McvvPublicNavbar } from "@/components/organisms";
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
  const session = await getSession();
  if (!session || !isStaffRole(session.role)) {
    return (
      <Suspense fallback={null}>
        <McvvLoginNextRedirect />
      </Suspense>
    );
  }

  const home = await getTranslations({ locale, namespace: "Home" });
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
      {children}
      <McvvFooter content={{ brand, footer }} />
    </div>
  );
}
