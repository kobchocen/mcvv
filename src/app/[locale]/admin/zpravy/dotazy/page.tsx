import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Link, type Locale } from "@/i18n/routing";
import { requireSection } from "@/lib/admin/access";
import { listContactQuestions } from "@/lib/contact/questions";
import { parseQuestionFilter } from "@/lib/contact/questions-core";
import { formatDateTime } from "@/lib/format/date";
import { cn } from "@/lib/utils";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ stav?: string; q?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("qTitle") };
}

/** Dotazy z kontaktního formuláře od nepřihlášených návštěvníků (#205). */
export default async function AdminContactQuestionsPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireSection("messages", "read");
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const filter = parseQuestionFilter(await searchParams);
  const questions = await listContactQuestions(filter);
  const statusLabel = (s: string) =>
    s === "new"
      ? copy("qStatusNew")
      : s === "answered"
        ? copy("qStatusAnswered")
        : copy("qStatusClosed");

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="mb-4">
          <Link
            href="/admin/zpravy"
            className="text-sm font-medium text-race-accent hover:underline"
          >
            ← {copy("msgTitle")}
          </Link>
        </p>
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("qTitle")}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-race-muted">{copy("qIntro")}</p>
        <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
          <label className="grid gap-1 text-sm">
            <span className="text-race-muted">{copy("msgFilterStatus")}</span>
            <select
              name="stav"
              defaultValue={filter.status}
              className="h-10 border border-race-line bg-race-surface px-2"
            >
              <option value="open">{copy("qStatusOpen")}</option>
              <option value="new">{copy("qStatusNew")}</option>
              <option value="answered">{copy("qStatusAnswered")}</option>
              <option value="closed">{copy("qStatusClosed")}</option>
              <option value="all">{copy("msgStatusAll")}</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-race-muted">{copy("qSearch")}</span>
            <input
              name="q"
              type="search"
              defaultValue={filter.q}
              className="h-10 w-64 border border-race-line bg-race-surface px-2"
            />
          </label>
          <Button type="submit" variant="outline" className="h-10 border-race-line bg-race-surface">
            {copy("filter")}
          </Button>
        </form>

        {questions.length === 0 ? (
          <p className="mt-8 text-sm text-race-muted">{copy("qEmpty")}</p>
        ) : (
          <ul className="mt-8 grid gap-3">
            {questions.map((q) => (
              <li key={q.id}>
                <Link
                  href={{ pathname: "/admin/zpravy/dotazy/[id]", params: { id: String(q.id) } }}
                  className={cn(
                    "block border bg-race-surface p-4 transition-colors hover:border-race-accent/60",
                    q.status === "new" ? "border-race-accent" : "border-race-line/55",
                    q.status === "closed" && "opacity-75",
                  )}
                  data-question-status={q.status}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-lg font-semibold text-foreground dark:text-white">
                        {q.name}
                      </p>
                      <p className="truncate text-xs text-race-dim">{q.email}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 border px-2 py-0.5 text-xs font-medium",
                        q.status === "new"
                          ? "border-race-accent text-race-accent"
                          : "border-race-line text-race-muted",
                      )}
                    >
                      {statusLabel(q.status)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-race-muted">{q.message}</p>
                  <p className="mt-2 text-xs text-race-dim">
                    {formatDateTime(q.createdAt, locale)} · {q.locale.toUpperCase()}
                    {q._count.replies ? ` · ${copy("qReplies", { count: q._count.replies })}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
