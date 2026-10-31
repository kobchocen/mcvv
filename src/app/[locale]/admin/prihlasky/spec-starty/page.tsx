import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { McvvAdminPartnerDatalist } from "@/components/organisms/mcvv-admin-partner-datalist";
import { McvvAdminSpecialStart } from "@/components/organisms/mcvv-admin-special-start";
import { McvvAdminSpecialStartBadge } from "@/components/organisms/mcvv-admin-special-start-badge";
import { Button } from "@/components/ui/button";
import {
  partnerOptions,
  specialCheckState,
  specialCheckText,
  specialStartChecks,
  specialStartCopy,
  specialStartFlash,
  specialStartValue,
} from "@/lib/admin/special-start-view";
import { requireStaff } from "@/lib/admin/staff";
import { prisma } from "@/lib/db/client";
import { formatOffset, isSpecialStartKind, SPECIAL_START_KINDS } from "@/lib/race/special-start";
import { startTimeForBib } from "@/lib/race/start-time";
import {
  latestEditionYear,
  loadAdminStartRows,
  loadStartSettings,
  type AdminStartRow,
} from "@/lib/race/startlist-load";
import { Link, type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ rok?: string; typ?: string; spec?: string; duvod?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "SpecialStart" });
  return { title: t("title") };
}

/**
 * Přehled spec. startů ročníku (jen administrace): typ, partner, posun, poznámka, číslo a stav
 * na startovce, odkaz na zprávy. Pod ním přihlášky, ve kterých přihlašující napsal zprávu
 * (Q216: jen indikátor, nic se nenastavuje automaticky).
 */
export default async function AdminSpecialStartsPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireStaff();
  const t = await getTranslations({ locale, namespace: "SpecialStart" });
  const admin = await getTranslations({ locale, namespace: "Admin" });
  const query = await searchParams;
  const parsedYear = Number.parseInt(query.rok ?? "", 10);
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
      ? parsedYear
      : await latestEditionYear();
  const kindFilter = isSpecialStartKind(query.typ) ? query.typ : null;

  const [settings, rows] = await Promise.all([loadStartSettings(year), loadAdminStartRows(year)]);
  const { model, ranges, champions } = settings;
  const byId = new Map(rows.map((row) => [row.runnerId, row]));
  const options = partnerOptions(rows);
  const optionById = new Map(options.map((option) => [option.runnerId, option.value]));
  const checks = specialStartChecks(model, ranges, champions, rows);
  const copy = specialStartCopy(t);
  const flash = specialStartFlash(t, query.spec, query.duvod);

  const special = rows
    .filter((row) => row.special && (!kindFilter || row.special.kind === kindFilter))
    .sort(
      (a, b) =>
        SPECIAL_START_KINDS.indexOf(a.special!.kind) -
          SPECIAL_START_KINDS.indexOf(b.special!.kind) || a.name.localeCompare(b.name, "cs"),
    );

  // Přihlášky se zprávou od přihlašujícího.
  const byRegistration = new Map<number, AdminStartRow[]>();
  for (const row of rows) {
    if (row.messageThreadId != null && !row.cancelled) {
      byRegistration.set(row.registrationId, [
        ...(byRegistration.get(row.registrationId) ?? []),
        row,
      ]);
    }
  }
  const registrationNames = new Map(
    (
      await prisma.registration.findMany({
        where: { year, id: { in: [...byRegistration.keys()] } },
        select: { id: true, name: true },
      })
    ).map((row) => [row.id, row.name ?? ""]),
  );
  const withMessages = [...byRegistration.entries()].sort(([a], [b]) => a - b);

  const detailHref = (registrationId: number) =>
    ({
      pathname: "/admin/prihlasky/[rok]/[id]",
      params: { rok: String(year), id: String(registrationId) },
    }) as const;
  const threadHref = (threadId: number) =>
    ({ pathname: "/admin/zpravy/[id]", params: { id: String(threadId) } }) as const;
  const nameOf = (runnerId: string | null) =>
    runnerId ? (byId.get(runnerId)?.name ?? runnerId) : "";

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-10">
        <div>
          <McvvAdminHomeLink label={admin("title")} />
          <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
            {t("overviewTitle", { year })}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-race-muted">{t("overviewIntro")}</p>
          <p className="mt-3 flex flex-wrap gap-4 text-sm">
            <Link
              href={{ pathname: "/admin/prihlasky", query: { rok: String(year) } }}
              className="font-medium text-race-accent hover:underline"
            >
              {t("overviewBack")}
            </Link>
            <Link
              href={{ pathname: "/admin/startovka", query: { rok: String(year) } }}
              className="font-medium text-race-accent hover:underline"
            >
              {t("overviewStartList")}
            </Link>
          </p>
          {flash ? (
            <p
              role={flash.ok ? "status" : "alert"}
              className={
                flash.ok
                  ? "mt-3 text-sm font-medium text-race-accent"
                  : "mt-3 text-sm text-red-600 dark:text-red-400"
              }
            >
              {flash.text}
            </p>
          ) : null}
          <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="rok" value={year} />
            <label className="grid gap-1 text-sm">
              <span className="text-race-muted">{t("filterKind")}</span>
              <select
                name="typ"
                defaultValue={kindFilter ?? ""}
                className="h-10 border border-race-line bg-race-surface px-2"
              >
                <option value="">{t("filterAll")}</option>
                {SPECIAL_START_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`kind_${kind}`)}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="submit"
              variant="outline"
              className="h-10 border-race-line bg-race-surface"
            >
              {t("filter")}
            </Button>
          </form>
        </div>

        <McvvAdminPartnerDatalist id="spec-start-partners" options={options} />

        <section>
          {special.length === 0 ? (
            <p className="text-sm text-race-muted">{t("overviewEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[64rem] border-collapse text-left text-sm"
                data-testid="spec-start-overview"
              >
                <thead>
                  <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                    <th className="py-2 pr-3">{t("colRunner")}</th>
                    <th className="py-2 pr-3">{t("colCategory")}</th>
                    <th className="py-2 pr-3">{t("colRegistration")}</th>
                    <th className="py-2 pr-3">{t("colKind")}</th>
                    <th className="py-2 pr-3">{t("colPartner")}</th>
                    <th className="py-2 pr-3">{t("colOffset")}</th>
                    <th className="py-2 pr-3">{t("colNote")}</th>
                    <th className="py-2 pr-3">{t("colBib")}</th>
                    <th className="py-2 pr-3">{t("colState")}</th>
                    <th className="py-2 pr-3">{t("colMessages")}</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {special.map((row) => {
                    const spec = row.special!;
                    const check = checks.get(row.runnerId);
                    const partner = spec.partnerId ? byId.get(spec.partnerId) : undefined;
                    return (
                      <tr key={row.runnerId} className="border-b border-race-line/40 align-top">
                        <td className="py-2.5 pr-3 font-medium">
                          {row.name}
                          {row.cancelled ? (
                            <span className="ml-1 text-xs text-race-dim">✕</span>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-3">{row.categoryName}</td>
                        <td className="py-2.5 pr-3">
                          <Link
                            href={detailHref(row.registrationId)}
                            className="text-race-accent hover:underline"
                          >
                            {row.registrationId}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-3">
                          <McvvAdminSpecialStartBadge label={t(`kind_${spec.kind}`)} />
                        </td>
                        <td className="py-2.5 pr-3">
                          {spec.kind === "with"
                            ? partner
                              ? `${partner.name}${partner.bib != null ? ` (${partner.bib})` : ""}`
                              : spec.partnerId
                                ? `${nameOf(spec.partnerId)} – ${t("withMissing")}`
                                : t("withMissing")
                            : ""}
                        </td>
                        <td className="py-2.5 pr-3 tabular-nums">
                          {spec.kind === "with" ? formatOffset(spec.offsetSeconds) : ""}
                        </td>
                        <td className="max-w-[16rem] py-2.5 pr-3 text-xs">{spec.note ?? ""}</td>
                        <td className="py-2.5 pr-3 tabular-nums">
                          {row.bib ?? "—"}
                          {row.bib != null ? (
                            <span className="ml-1 text-xs text-race-muted">
                              {startTimeForBib(model, row.bib)}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-3">
                          {check ? (
                            <McvvAdminSpecialStartBadge
                              state={specialCheckState(check)}
                              label={specialCheckText(t, check, spec)}
                            />
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-3">
                          {row.messageThreadId != null ? (
                            <Link
                              href={threadHref(row.messageThreadId)}
                              title={t("hasMessageTitle")}
                              className="whitespace-nowrap text-xs font-semibold text-race-accent hover:underline"
                            >
                              ✉ {t("hasMessage")}
                            </Link>
                          ) : null}
                        </td>
                        <td className="py-2.5">
                          <McvvAdminSpecialStart
                            year={year}
                            runnerId={row.runnerId}
                            runnerName={row.name}
                            registrationId={row.registrationId}
                            from="prehled"
                            value={specialStartValue(spec, optionById)}
                            partnerListId="spec-start-partners"
                            copy={copy}
                            compact
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">
            {t("messagesHeading", { count: withMessages.length })}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-race-muted">{t("messagesHint")}</p>
          {withMessages.length === 0 ? (
            <p className="mt-3 text-sm text-race-muted">{t("messagesEmpty")}</p>
          ) : (
            <ul className="mt-4 grid gap-3" data-testid="spec-start-messages">
              {withMessages.map(([registrationId, members]) => (
                <li
                  key={registrationId}
                  className="rounded-[12px] border border-race-line bg-race-surface p-3 text-sm"
                >
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="font-semibold">
                      {registrationId} · {registrationNames.get(registrationId) ?? ""}
                    </span>
                    <Link
                      href={threadHref(members[0].messageThreadId!)}
                      className="text-xs font-semibold text-race-accent hover:underline"
                    >
                      ✉ {t("openThread")}
                    </Link>
                    <Link
                      href={detailHref(registrationId)}
                      className="text-xs text-race-muted hover:underline"
                    >
                      {t("openRegistration")}
                    </Link>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                    {members.map((member) => (
                      <span key={member.runnerId} className="inline-flex items-center gap-2">
                        <span>{member.name}</span>
                        <McvvAdminSpecialStart
                          year={year}
                          runnerId={member.runnerId}
                          runnerName={member.name}
                          registrationId={registrationId}
                          from="prehled"
                          value={specialStartValue(member.special, optionById)}
                          partnerListId="spec-start-partners"
                          copy={copy}
                        />
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
