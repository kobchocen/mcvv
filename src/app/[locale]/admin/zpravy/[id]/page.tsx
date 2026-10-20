import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { staffThreadCopy } from "@/components/organisms/mcvv-message-copy";
import { McvvMessageThread } from "@/components/organisms/mcvv-message-thread";
import { Link, type Locale } from "@/i18n/routing";
import { requireStaff } from "@/lib/admin/staff";
import { prisma } from "@/lib/db/client";
import { markReadByStaff, postStaffMessage, setThreadStatus } from "@/lib/messages/actions";
import { loadThread } from "@/lib/messages/store";

type PageProps = Readonly<{ params: Promise<{ locale: string; id: string }> }>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("msgThread") };
}

export default async function AdminMessageThreadPage({ params }: PageProps) {
  const { locale: requestedLocale, id: rawId } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireStaff();
  const id = Number.parseInt(rawId, 10);
  if (!Number.isFinite(id)) notFound();
  const thread = await loadThread(id);
  if (!thread) notFound();
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const registration =
    thread.year !== null && thread.registrationId !== null
      ? await prisma.registration.findUnique({
          where: { year_id: { year: thread.year, id: thread.registrationId } },
          select: { year: true, id: true, name: true, email: true },
        })
      : null;
  const title =
    thread.year !== null && thread.registrationId !== null
      ? copy("msgThreadRegistration", { year: thread.year, id: thread.registrationId })
      : `${copy("msgThreadGeneral")}${thread.subject ? ` · ${thread.subject}` : ""}`;

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <McvvAdminHomeLink label={copy("title")} />
        <p className="mb-4">
          <Link
            href="/admin/zpravy"
            className="text-sm font-medium text-race-accent hover:underline"
          >
            ← {copy("msgTitle")}
          </Link>
        </p>
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">{title}</h1>
        <p className="mt-2 text-sm text-race-muted">
          {registration ? (
            <>
              {registration.name} · {registration.email} ·{" "}
              <Link
                href={{
                  pathname: "/admin/prihlasky/[rok]/[id]",
                  params: { rok: String(registration.year), id: String(registration.id) },
                }}
                className="font-medium text-race-accent hover:underline"
              >
                {copy("msgToRegistration")}
              </Link>
            </>
          ) : thread.user ? (
            <>
              {copy("msgAccount")}: {thread.user.name} · {thread.user.email}
            </>
          ) : null}
        </p>
        <div className="mt-8">
          <McvvMessageThread
            viewer="staff"
            messages={thread.messages.map((message) => ({
              id: message.id,
              side: message.side,
              body: message.body,
              createdAt: message.createdAt,
              authorName: message.author?.name ?? "",
            }))}
            lastRead={thread.lastReadByStaff}
            status={thread.status}
            threadId={thread.id}
            locale={locale}
            copy={await staffThreadCopy(locale)}
            replyAction={postStaffMessage}
            markReadAction={markReadByStaff}
            statusAction={setThreadStatus}
            showAuthorNames
          />
        </div>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
