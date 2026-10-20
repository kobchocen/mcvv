import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { McvvMessageBubble } from "@/components/organisms/mcvv-message-thread";
import { Button } from "@/components/ui/button";
import { Link, type Locale } from "@/i18n/routing";
import { requireStaff } from "@/lib/admin/staff";
import { formatDateTime } from "@/lib/format/date";
import { parseAdminThreadFilters, sortAdminThreads } from "@/lib/messages/core";
import { listAdminThreads } from "@/lib/messages/store";
import { getMessageSettings } from "@/lib/settings/messages";
import { cn } from "@/lib/utils";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ stav?: string; neprectene?: string; typ?: string; rok?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("msgTitle") };
}

export default async function AdminMessagesPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireStaff();
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const filters = parseAdminThreadFilters(await searchParams);
  const [threads, settings] = await Promise.all([listAdminThreads(filters), getMessageSettings()]);
  const sorted = sortAdminThreads(threads);

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <McvvAdminHomeLink label={copy("title")} />
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("msgTitle")}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-race-muted">{copy("msgIntro")}</p>
        {!settings.enabled ? (
          <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">{copy("msgDisabled")}</p>
        ) : null}
        <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
          <label className="grid gap-1 text-sm">
            <span className="text-race-muted">{copy("msgFilterStatus")}</span>
            <select
              name="stav"
              defaultValue={filters.status}
              className="h-10 border border-race-line bg-race-surface px-2"
            >
              <option value="all">{copy("msgStatusAll")}</option>
              <option value="open">{copy("msgStatusOpen")}</option>
              <option value="resolved">{copy("msgStatusResolved")}</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-race-muted">{copy("msgFilterType")}</span>
            <select
              name="typ"
              defaultValue={filters.type}
              className="h-10 border border-race-line bg-race-surface px-2"
            >
              <option value="all">{copy("msgTypeAll")}</option>
              <option value="registration">{copy("msgTypeRegistration")}</option>
              <option value="general">{copy("msgTypeGeneral")}</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-race-muted">{copy("msgFilterYear")}</span>
            <input
              name="rok"
              type="number"
              inputMode="numeric"
              placeholder={copy("msgYearAll")}
              defaultValue={filters.year ?? ""}
              className="h-10 w-28 border border-race-line bg-race-surface px-2"
            />
          </label>
          <label className="flex h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="neprectene"
              value="1"
              defaultChecked={filters.unreadOnly}
            />
            {copy("msgFilterUnread")}
          </label>
          <Button type="submit" variant="outline" className="h-10 border-race-line bg-race-surface">
            {copy("filter")}
          </Button>
        </form>

        {sorted.length === 0 ? (
          <p className="mt-8 text-sm text-race-muted">{copy("msgEmpty")}</p>
        ) : (
          <ul className="mt-8 grid gap-3">
            {sorted.map((thread) => {
              const title =
                thread.year !== null && thread.registrationId !== null
                  ? `${copy("msgThreadRegistration", { year: thread.year, id: thread.registrationId })}${
                      thread.registration?.name ? ` · ${thread.registration.name}` : ""
                    }`
                  : `${copy("msgThreadGeneral")}${thread.subject ? ` · ${thread.subject}` : ""}`;
              const who = thread.registration?.email ?? thread.user?.email ?? "";
              const last = thread.messages[0];
              return (
                <li key={thread.id}>
                  <Link
                    href={{ pathname: "/admin/zpravy/[id]", params: { id: String(thread.id) } }}
                    className={cn(
                      "block border bg-race-surface p-4 transition-colors hover:border-race-accent/60",
                      thread.unread && thread.status === "open"
                        ? "border-race-accent"
                        : "border-race-line/55",
                      thread.status === "resolved" && "opacity-75",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-lg font-semibold text-foreground dark:text-white">
                          {title}
                        </p>
                        <p className="truncate text-xs text-race-dim">{who}</p>
                      </div>
                      <McvvMessageBubble
                        count={thread._count.messages}
                        unread={thread.unread && thread.status === "open" ? 1 : 0}
                        label={
                          thread.unread
                            ? copy("msgUnread")
                            : copy("msgCount", { count: thread._count.messages })
                        }
                      />
                    </div>
                    {last ? (
                      <p className="mt-1 line-clamp-2 text-sm text-race-muted">{last.body}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-race-dim">
                      {formatDateTime(thread.lastMessageAt, locale)} ·{" "}
                      {thread.status === "open" ? copy("msgStatusOpen") : copy("msgStatusResolved")}
                      {thread.unread ? ` · ${copy("msgUnread")}` : ""}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
