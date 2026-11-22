import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link, type Locale } from "@/i18n/routing";
import { canAccess, requireSection } from "@/lib/admin/access";
import { replyToQuestionAction, setQuestionStatusAction } from "@/lib/contact/question-actions";
import { loadContactQuestion } from "@/lib/contact/questions";
import { REPLY_MAX } from "@/lib/contact/questions-core";
import { formatDateTime } from "@/lib/format/date";
import { cn } from "@/lib/utils";

type PageProps = Readonly<{
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ ok?: string; chyba?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("qDetail") };
}

const box = "border border-race-line/55 bg-race-surface p-4";

/** Detail dotazu z kontaktního formuláře: text, odpovědi, odpověď e-mailem, stav (#205). */
export default async function AdminContactQuestionPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale, id: rawId } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireSection("messages", "read");
  const id = Number.parseInt(rawId, 10);
  if (!Number.isFinite(id)) notFound();
  const [question, canWrite] = await Promise.all([
    loadContactQuestion(id),
    canAccess("messages", "write"),
  ]);
  if (!question) notFound();
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const flash = await searchParams;
  const statusLabel = (s: string) =>
    s === "new"
      ? copy("qStatusNew")
      : s === "answered"
        ? copy("qStatusAnswered")
        : copy("qStatusClosed");
  const ok =
    flash.ok === "replied"
      ? copy("qOkReplied")
      : flash.ok === "new" || flash.ok === "answered" || flash.ok === "closed"
        ? copy("qOkStatus", { status: statusLabel(flash.ok) })
        : null;
  const error =
    flash.chyba === "invalid"
      ? copy("qErrInvalid")
      : flash.chyba === "not_found"
        ? copy("qErrNotFound")
        : null;
  const nextStatuses = (["new", "answered", "closed"] as const).filter(
    (s) => s !== question.status,
  );

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <p className="mb-4">
          <Link
            href="/admin/zpravy/dotazy"
            className="text-sm font-medium text-race-accent hover:underline"
          >
            ← {copy("qTitle")}
          </Link>
        </p>
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("qDetail")} · {question.name}
        </h1>
        <p className="mt-2 text-sm text-race-muted">
          <a
            href={`mailto:${question.email}`}
            className="font-medium text-race-accent hover:underline"
          >
            {question.email}
          </a>{" "}
          · {formatDateTime(question.createdAt, locale)} · {copy("qLang")}:{" "}
          {question.locale.toUpperCase()} ·{" "}
          <span data-question-status={question.status}>{statusLabel(question.status)}</span>
        </p>
        {!question.notifiedAt ? (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">{copy("qNotNotified")}</p>
        ) : null}
        {ok ? (
          <p
            className="mt-4 border border-race-accent/60 bg-race-surface p-3 text-sm"
            role="status"
          >
            {ok}
          </p>
        ) : null}
        {error ? (
          <p
            className="mt-4 border border-red-600/60 bg-race-surface p-3 text-sm text-red-700 dark:text-red-300"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <section className={cn(box, "mt-6")}>
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground dark:text-white">
            {question.message}
          </p>
        </section>

        <h2 className="mt-8 font-display text-xl font-semibold text-foreground dark:text-white">
          {copy("qRepliesTitle")}
        </h2>
        {question.replies.length === 0 ? (
          <p className="mt-2 text-sm text-race-muted">{copy("qNoReplies")}</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {question.replies.map((r) => (
              <li key={r.id} className={cn(box, "border-l-4 border-l-race-accent")}>
                <p className="text-xs text-race-dim">
                  {r.authorName} · {formatDateTime(r.createdAt, locale)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{r.body}</p>
              </li>
            ))}
          </ul>
        )}

        {canWrite ? (
          <>
            <form action={replyToQuestionAction} className={cn(box, "mt-6 grid gap-3")}>
              <input type="hidden" name="id" value={question.id} />
              <Label htmlFor="reply-body">{copy("qReplyTitle")}</Label>
              <Textarea
                id="reply-body"
                name="body"
                required
                maxLength={REPLY_MAX}
                className="min-h-40 bg-race-surface text-sm"
              />
              <p className="text-xs text-race-muted">
                {copy("qReplyHint", { email: question.email })}
              </p>
              <div>
                <Button type="submit">{copy("qReplySend")}</Button>
              </div>
            </form>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-race-muted">{copy("qStatusChange")}:</span>
              {nextStatuses.map((s) => (
                <form key={s} action={setQuestionStatusAction}>
                  <input type="hidden" name="id" value={question.id} />
                  <input type="hidden" name="status" value={s} />
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-9 border-race-line bg-race-surface"
                  >
                    {s === "closed"
                      ? copy("qClose")
                      : copy("qSetStatus", { status: statusLabel(s) })}
                  </Button>
                </form>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-6 text-sm text-race-muted">{copy("qReadOnly")}</p>
        )}
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
