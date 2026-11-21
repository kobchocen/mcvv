import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { can, getAccess, requireSection, type Access } from "@/lib/admin/access";
import { requireStaff } from "@/lib/admin/staff";
import { adminAccess } from "@/lib/auth/roles";
import { mailPolicy } from "@/lib/mail/queue";
import { mailStats } from "@/lib/mail/queue-store";
import { staffUnreadCount } from "@/lib/messages/store";
import buildInfo from "@/lib/build-info.json";
import { Link, type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const t = await getTranslations({ locale: requestedLocale as Locale, namespace: "Admin" });
  return { title: t("title") };
}

export default async function AdminPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const access = await getAccess();
  if (access.v2) {
    // Engine oprávnění: přehled zpráv a pošty jen s právem na Zprávy, jinak rozcestník.
    await requireSection("overview", "read");
    if (!can(access, "messages", "read")) return <RaceDayHome locale={locale} access={access} />;
  } else {
    const current = access.session;
    const level = current ? adminAccess(current.role) : "none";
    if (current && (level === "raceday" || level === "tools")) {
      // Role dne závodu (timing, splitmaker, startér, kancelář): rozcestník jen s jejich
      // sekcemi a obrazovkami (dřív je přihlášení přesměrovalo rovnou na ně).
      return <RaceDayHome locale={locale} access={access} />;
    }
    await requireStaff();
  }
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const [mail, policy] = await Promise.all([mailStats().catch(() => null), mailPolicy()]);
  const unreadThreads = await staffUnreadCount().catch(() => null);

  return (
    <main className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-4xl font-bold text-foreground dark:text-white">
          {copy("title")}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-race-muted">{copy("intro")}</p>
        <p className="mt-3 text-sm text-race-muted">
          {copy("versionLine", {
            version: buildInfo.version,
            buildNumber: buildInfo.buildNumber,
            revision: buildInfo.revision,
          })}
        </p>
        {mail ? (
          <p className="mt-3 text-sm text-race-muted" data-testid="mail-stats">
            {copy("mailStats", {
              today: mail.today,
              cap: policy.unlimited ? copy("mailUnlimited") : policy.cap,
              month: mail.month,
              pending: mail.pending,
              failed: mail.failed,
            })}
            {mail.quotaExceeded ? ` ${copy("mailQuotaExceeded")}` : ""}
          </p>
        ) : null}
        {(unreadThreads ?? 0) > 0 ? (
          <Link
            href="/admin/zpravy"
            className="mt-8 block max-w-xl border border-race-accent bg-race-surface p-5"
            data-testid="admin-unread"
          >
            <p className="font-display text-xl font-semibold text-foreground dark:text-white">
              {copy("navMessages")}
            </p>
            <p className="mt-1 text-sm font-semibold text-race-accent">
              {copy("messagesTile", { count: unreadThreads ?? 0 })}
            </p>
          </Link>
        ) : null}
      </div>
    </main>
  );
}

type RaceDayHref = "/admin/den-zavodu" | "/mezicasy" | "/start" | "/kancelar";

/** Rozcestník pro role dne závodu bez plné administrace. */
async function RaceDayHome({ locale, access }: { locale: Locale; access: Access }) {
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const tiles: { href: RaceDayHref; title: string }[] = [];
  // Flag vypnutý: can() = canAccessRaceDay / canAccessSplits / canAccessStarter / canUseCashDesk.
  if (can(access, "raceControl.overview", "read"))
    tiles.push({ href: "/admin/den-zavodu", title: copy("navRaceDay") });
  if (can(access, "screens.splits", "read"))
    tiles.push({ href: "/mezicasy", title: copy("navSplitEntry") });
  if (can(access, "screens.starter", "read"))
    tiles.push({ href: "/start", title: copy("navStarter") });
  if (can(access, "raceOffice.cash", "read"))
    tiles.push({ href: "/kancelar", title: copy("navCashDesk") });
  return (
    <main className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-4xl font-bold text-foreground dark:text-white">
          {copy("title")}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-race-muted">{copy("toolsIntro")}</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2" data-testid="raceday-home">
          {tiles.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="border border-race-line/55 bg-race-surface p-6 transition-colors hover:border-race-accent/50"
            >
              <p className="font-display text-2xl font-semibold text-foreground dark:text-white">
                {tile.title} {tile.href.startsWith("/admin") ? "" : "↗"}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
