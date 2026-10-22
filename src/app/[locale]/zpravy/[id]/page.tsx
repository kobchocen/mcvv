import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvPublicNavbar } from "@/components/organisms";
import { userThreadCopy } from "@/components/organisms/mcvv-message-copy";
import { McvvMessageThread } from "@/components/organisms/mcvv-message-thread";
import type { McvvHomepageContent } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Link, type Locale } from "@/i18n/routing";
import { getSession } from "@/lib/auth/session";
import { markReadByUser, postUserMessage } from "@/lib/messages/actions";
import { recordUserView } from "@/lib/messages/service";
import { loadThread, userCanAccessThread } from "@/lib/messages/store";
import { getMessageSettings } from "@/lib/settings/messages";

type PageProps = Readonly<{ params: Promise<{ locale: string; id: string }> }>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Messages" });
  return { title: t("title"), robots: { index: false } };
}

export default async function MessageThreadPage({ params }: PageProps) {
  const { locale: requestedLocale, id: rawId } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const id = Number.parseInt(rawId, 10);
  if (!Number.isFinite(id) || String(id) !== rawId) notFound();
  const home = await getTranslations({ locale, namespace: "Home" });
  const t = await getTranslations({ locale, namespace: "Messages" });
  const session = await getSession();
  const settings = session ? await getMessageSettings() : null;
  const thread = session && settings?.enabled ? await loadThread(id) : null;
  if (session && settings?.enabled && (!thread || !(await userCanAccessThread(thread, session)))) {
    notFound();
  }
  // Potvrzení o přečtení pro pořadatele: zobrazené zprávy pořadatele = přečtené (ne pro staff).
  if (session && thread) await recordUserView(thread, session);
  const title = thread
    ? thread.year !== null && thread.registrationId !== null
      ? t("threadRegistration", { year: thread.year, id: thread.registrationId })
      : thread.subject || t("threadGeneral")
    : t("title");

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
          <p className="flex flex-wrap gap-4 text-sm">
            <Link href="/zpravy" className="font-medium text-race-accent hover:underline">
              ← {t("backToList")}
            </Link>
            {thread?.registrationId !== null && thread?.registrationId !== undefined ? (
              <Link href="/prihlasky" className="font-medium text-race-accent hover:underline">
                {t("backToEntry")}
              </Link>
            ) : null}
          </p>
          <h1 className="mt-5 font-display text-3xl font-bold text-foreground dark:text-white sm:text-4xl">
            {title}
          </h1>
          {!session ? (
            <div className="mt-8 grid max-w-md gap-4">
              <p className="text-base leading-7 text-race-muted">{t("needLogin")}</p>
              <Button
                asChild
                className="h-11 bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
              >
                <Link href={{ pathname: "/prihlaseni", query: { next: `/zpravy/${id}` } }}>
                  {t("login")}
                </Link>
              </Button>
            </div>
          ) : !thread ? (
            <p className="mt-8 text-base leading-7 text-race-muted">{t("disabled")}</p>
          ) : (
            <div className="mt-8">
              <McvvMessageThread
                viewer="user"
                messages={thread.messages.map((message) => ({
                  id: message.id,
                  side: message.side,
                  body: message.body,
                  createdAt: message.createdAt,
                  authorName: message.author?.name ?? "",
                }))}
                lastRead={thread.lastReadByUser}
                status={thread.status}
                threadId={thread.id}
                locale={locale}
                copy={await userThreadCopy(locale)}
                replyAction={postUserMessage}
                markReadAction={markReadByUser}
              />
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
