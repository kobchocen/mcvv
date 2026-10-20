import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getSession } from "@/lib/auth/session";
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
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const session = await getSession();
  const mail = await mailStats().catch(() => null);
  const unreadThreads = await staffUnreadCount().catch(() => null);

  const tiles: {
    href:
      | "/admin/partneri"
      | "/admin/rocniky"
      | "/admin/ciselniky"
      | "/admin/prihlasky"
      | "/admin/newsletter"
      | "/admin/platby"
      | "/admin/zpravy"
      | "/admin/nastaveni";
    title: string;
    detail?: string;
    highlight?: boolean;
  }[] = [
    {
      href: "/admin/zpravy",
      title: copy("navMessages"),
      detail: unreadThreads === null ? undefined : copy("messagesTile", { count: unreadThreads }),
      highlight: (unreadThreads ?? 0) > 0,
    },
    { href: "/admin/partneri", title: copy("navPartners") },
    { href: "/admin/rocniky", title: copy("navEditions") },
    { href: "/admin/ciselniky", title: copy("navDictionaries") },
    { href: "/admin/prihlasky", title: copy("navRegistrations") },
    { href: "/admin/newsletter", title: copy("navNewsletter") },
    { href: "/admin/platby", title: copy("navPayments") },
  ];
  if (session?.role === "admin") {
    tiles.push({ href: "/admin/nastaveni", title: copy("navSettings") });
  }

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
              cap: mailPolicy().cap,
              month: mail.month,
              pending: mail.pending,
              failed: mail.failed,
            })}
            {mail.quotaExceeded ? ` ${copy("mailQuotaExceeded")}` : ""}
          </p>
        ) : null}
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {tiles.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className={
                tile.highlight
                  ? "border border-race-accent bg-race-surface p-5 transition-colors hover:border-race-accent"
                  : "border border-race-line/55 bg-race-surface p-5 transition-colors hover:border-race-accent/50"
              }
            >
              <p className="font-display text-xl font-semibold text-foreground dark:text-white">
                {tile.title}
              </p>
              {tile.detail ? (
                <p
                  className={
                    tile.highlight
                      ? "mt-1 text-sm font-semibold text-race-accent"
                      : "mt-1 text-sm text-race-muted"
                  }
                >
                  {tile.detail}
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
