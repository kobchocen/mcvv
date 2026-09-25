import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { logout } from "@/lib/auth/actions";
import { getSession, isStaffRole } from "@/lib/auth/session";
import { McvvAdminNav } from "@/components/organisms/mcvv-admin-nav";
import { redirect } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";

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
    redirect({ href: "/prihlaseni", locale });
  }

  const copy = await getTranslations({ locale, namespace: "Admin" });
  const auth = await getTranslations({ locale, namespace: "Auth" });

  return (
    <div className="min-h-screen bg-race-deep text-foreground">
      <header className="border-b border-race-line bg-race-forest px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent">
              {copy("eyebrow")}
            </p>
            <p className="font-display text-lg font-semibold text-foreground dark:text-white">
              {copy("title")}
            </p>
          </div>
          <McvvAdminNav
            items={[
              { href: "/admin", label: copy("navOverview") },
              { href: "/admin/partneri", label: copy("navPartners") },
              { href: "/admin/rocniky", label: copy("navEditions") },
              { href: "/admin/ciselniky", label: copy("navDictionaries") },
              { href: "/admin/prihlasky", label: copy("navRegistrations") },
            ]}
          />
          <div className="flex items-center gap-3">
            <p className="hidden text-sm text-race-muted sm:block">{session?.name}</p>
            <form action={logout}>
              <Button
                type="submit"
                variant="outline"
                className="h-10 border-race-line bg-race-surface font-display text-sm font-semibold"
              >
                {auth("logout")}
              </Button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
