import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvPublicNavbar } from "@/components/organisms";
import { McvvMessageBubble } from "@/components/organisms/mcvv-message-thread";
import type { McvvHomepageContent } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Link, redirect, type Locale } from "@/i18n/routing";
import { getSession } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format/date";
import { listUserThreads } from "@/lib/messages/store";
import { getMessageSettings } from "@/lib/settings/messages";
import { cn } from "@/lib/utils";

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Messages" });
  return { title: t("title"), robots: { index: false } };
}

export default async function MessagesPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const home = await getTranslations({ locale, namespace: "Home" });
  const t = await getTranslations({ locale, namespace: "Messages" });
  const session = await getSession();
  if (!session) {
    redirect({ href: { pathname: "/prihlaseni", query: { next: "/zpravy" } }, locale });
    return null;
  }
  const settings = await getMessageSettings();
  const threads = settings?.enabled ? await listUserThreads(session) : [];

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvPublicNavbar
        content={{
          brand: home.raw("brand") as McvvHomepageContent["brand"],
          nav: home.raw("nav") as McvvHomepageContent["nav"],
        }}
        variant="solid"
      />
      <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-3">
            <span className="h-0.5 w-7 bg-race-accent" />
            <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent">
              {t("eyebrow")}
            </p>
          </div>
          <h1 className="mt-5 font-display text-4xl font-bold text-foreground dark:text-white sm:text-5xl">
            {t("title")}
          </h1>
          {!settings?.enabled ? (
            <p className="mt-8 text-base leading-7 text-race-muted">
              {t("disabled")}{" "}
              <Link href="/kontakt" className="font-medium text-race-accent hover:underline">
                {t("contactLink")}
              </Link>
            </p>
          ) : (
            <>
              <p className="mt-4 text-base leading-7 text-race-muted">{t("intro")}</p>
              <p className="mt-6">
                <Button
                  asChild
                  variant="outline"
                  className="h-10 border-race-line bg-race-surface font-display font-semibold"
                >
                  <Link href="/kontakt">{t("newMessage")}</Link>
                </Button>
              </p>
              {threads.length === 0 ? (
                <p className="mt-8 text-sm text-race-muted">{t("empty")}</p>
              ) : (
                <ul className="mt-8 grid gap-3">
                  {threads.map((thread) => {
                    const title =
                      thread.year !== null && thread.registrationId !== null
                        ? `${t("threadRegistration", { year: thread.year, id: thread.registrationId })}${
                            thread.registrationName ? ` · ${thread.registrationName}` : ""
                          }`
                        : thread.subject || t("threadGeneral");
                    const last = thread.messages[0];
                    return (
                      <li key={thread.id}>
                        <Link
                          href={{ pathname: "/zpravy/[id]", params: { id: String(thread.id) } }}
                          className={cn(
                            "block rounded-[12px] border bg-race-surface p-4 transition-colors hover:border-race-accent/60",
                            thread.unread ? "border-race-accent" : "border-race-line/60",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="font-display text-lg font-semibold text-foreground dark:text-white">
                              {title}
                            </p>
                            <McvvMessageBubble
                              count={thread._count.messages}
                              unread={thread.unread ? 1 : 0}
                              label={
                                thread.unread
                                  ? t("unread")
                                  : t("messagesCount", { count: thread._count.messages })
                              }
                            />
                          </div>
                          {last ? (
                            <p className="mt-1 line-clamp-2 text-sm text-race-muted">
                              {last.side === "user" ? `${t("you")}: ` : `${t("organizer")}: `}
                              {last.body}
                            </p>
                          ) : null}
                          <p className="mt-2 text-xs text-race-dim">
                            {formatDateTime(thread.lastMessageAt, locale)} ·{" "}
                            {thread.status === "open" ? t("statusOpen") : t("statusResolved")}
                          </p>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
