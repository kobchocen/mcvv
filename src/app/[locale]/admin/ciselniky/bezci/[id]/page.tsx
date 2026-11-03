import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CountryFlag } from "@/components/atoms";
import { NationalityFlagSelect } from "@/components/molecules/nationality-flag-select";
import { McvvAdminHomeLink } from "@/components/organisms";
import { McvvAdminPendingSubmit } from "@/components/organisms/mcvv-admin-pending-submit";
import { McvvAdminRunnerDelete } from "@/components/organisms/mcvv-admin-runner-delete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, type Locale } from "@/i18n/routing";
import { loadRunnerDetail } from "@/lib/admin/runner-directory";
import { countRunnerAuditEntries, loadRunnerLinkCounts } from "@/lib/admin/runner-orphans";
import { canDeleteRunner, RUNNER_LINK_KINDS, totalLinks } from "@/lib/admin/runner-orphans-core";
import { previewRunnerRename } from "@/lib/admin/runner-rename";
import { renameRunnerAction } from "@/lib/admin/runner-rename-actions";
import { keptOtherNames, RUNNER_NAME_MAX, splitRunnerName } from "@/lib/admin/runner-rename-core";
import { birthYearOf, runnerSexOf } from "@/lib/admin/runner-sex-core";
import { saveRunnerNationality } from "@/lib/admin/runner-nationality-actions";
import { requireAdmin } from "@/lib/admin/staff";
import { prisma } from "@/lib/db/client";
import { currentRaceYear } from "@/lib/entries/year";
import { countryName, isCountryCode } from "@/lib/runner/nationality";
import { nationalityField } from "@/lib/runner/nationality-field";

type Search = {
  prijmeni?: string;
  jmeno?: string;
  rezim?: string;
  od?: string;
  z?: string;
  chyba?: string;
  prejmenovano?: string;
  /** Výsledek uložení státu: ulozeno | chyba. */
  stat?: string;
  /** Chyba smazání běžce: potvrzeni | vazby. */
  smazani?: string;
};

type PageProps = Readonly<{
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Search>;
}>;

const ERRORS = new Set(["empty", "too_long", "unchanged", "year", "not_found", "failed"]);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "AdminRunners" });
  return { title: `${t("title")} – ${id}` };
}

/** Návrat na detail přihlášky („rok-id“), odkud admin přišel zkratkou u změny pohlaví. */
function backTarget(value: string | undefined): { rok: string; id: string } | null {
  const match = /^(\d{4})-(\d{1,6})$/.exec(value ?? "");
  return match ? { rok: match[1], id: match[2] } : null;
}

/**
 * Detail běžce v Číselnících (#198): ročníky a jména v nich, změna jména s náhledem.
 * Krok 1 = GET formulář (náhled dotčených ročníků), krok 2 = potvrzení serverovou akcí.
 */
export default async function AdminRunnerDetailPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale, id } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireAdmin();
  const [admin, copy, nationalityCopy, nationalityOptions, query, runner, { year: currentYear }] =
    await Promise.all([
      getTranslations({ locale, namespace: "Admin" }),
      getTranslations({ locale, namespace: "AdminRunners" }),
      getTranslations({ locale, namespace: "Nationality" }),
      nationalityField(locale),
      searchParams,
      loadRunnerDetail(id),
      currentRaceYear(),
    ]);
  if (!runner) notFound();
  const [links, auditEntries] = await Promise.all([
    loadRunnerLinkCounts(prisma, runner.id),
    countRunnerAuditEntries(prisma, runner.id),
  ]);
  const linkTotal = totalLinks(links);
  const deleteError =
    query.smazani === "potvrzeni" || query.smazani === "vazby" ? query.smazani : null;

  const back = backTarget(query.z);
  const split = splitRunnerName(runner.name);
  const lastName = query.prijmeni ?? split.lastName;
  const firstName = query.jmeno ?? split.firstName;
  const modeValue = query.rezim === "od" ? "od" : "vse";
  const fromYear = Number.parseInt(query.od ?? "", 10) || currentYear;
  const error = query.chyba && ERRORS.has(query.chyba) ? query.chyba : null;
  const wantsPreview = query.prijmeni !== undefined && !error;
  const preview = wantsPreview
    ? await previewRunnerRename(prisma, {
        runnerId: runner.id,
        lastName,
        firstName,
        mode: modeValue === "od" ? "from" : "all",
        fromYear,
      })
    : null;
  const shownError = error ?? (preview && !preview.ok ? preview.error : null);
  const plan = preview?.ok ? preview.plan : null;
  const keptNames = plan ? keptOtherNames(plan) : [];
  const tableLabel = (table: string) =>
    table === "mcvv_time" ? copy("tableResults") : copy("tableStarts");
  const nameCell = (value: string | null | undefined) =>
    value === undefined ? "" : value?.trim() ? value : copy("nameCurrent");

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <McvvAdminHomeLink label={admin("title")} />
        <div className="flex flex-wrap gap-4 text-sm font-semibold">
          <Link href="/admin/ciselniky/bezci" className="text-race-accent hover:underline">
            ← {copy("title")}
          </Link>
          {back ? (
            <Link
              href={{ pathname: "/admin/prihlasky/[rok]/[id]", params: back }}
              className="text-race-accent hover:underline"
              data-testid="runner-back-registration"
            >
              ← {copy("backRegistration", { id: back.id, year: back.rok })}
            </Link>
          ) : null}
        </div>

        <section
          className="mt-4 border border-race-line/55 bg-race-surface p-5"
          data-testid="runner-card"
        >
          <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
            {runner.name}
          </h1>
          <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-race-muted">{copy("colId")}</dt>
              <dd className="font-mono">{runner.id}</dd>
            </div>
            <div>
              <dt className="text-race-muted">{copy("colBirthYear")}</dt>
              <dd>{birthYearOf(runner.id)}</dd>
            </div>
            <div>
              <dt className="text-race-muted">{copy("colSex")}</dt>
              <dd>{runnerSexOf(runner.id) === "F" ? copy("sexF") : copy("sexM")}</dd>
            </div>
            <div>
              <dt className="text-race-muted">{copy("colNationality")}</dt>
              <dd className="flex items-center gap-1.5" data-testid="runner-card-nationality">
                {runner.nationality && isCountryCode(runner.nationality) ? (
                  <>
                    <CountryFlag code={runner.nationality} />
                    {countryName(runner.nationality, locale)}
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-race-muted">{copy("colPrevious")}</dt>
              <dd>{runner.previousNames.join(", ") || "—"}</dd>
            </div>
          </dl>
          <Link
            href={{ pathname: "/bezec/[id]", params: { id: runner.id } }}
            className="mt-3 inline-block text-sm font-semibold text-race-accent hover:underline"
          >
            {copy("profile")} →
          </Link>
        </section>

        <section className="mt-8" data-testid="runner-links">
          <h2 className="font-display text-2xl font-semibold text-foreground dark:text-white">
            {copy("linksTitle")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-race-muted">{copy("linksHint")}</p>
          <table className="mt-4 w-full max-w-xl border-collapse text-left text-sm">
            <tbody>
              {RUNNER_LINK_KINDS.map((kind) => (
                <tr
                  key={kind}
                  className="border-b border-race-line/40"
                  data-testid={`runner-link-${kind}`}
                >
                  <td className="py-1.5 pr-3">{copy(`link_${kind}`)}</td>
                  <td
                    className={`py-1.5 text-right tabular-nums ${links[kind] > 0 ? "font-semibold" : "text-race-muted"}`}
                  >
                    {links[kind]}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-1.5 pr-3">{copy("linksTotal")}</td>
                <td className="py-1.5 text-right tabular-nums" data-testid="runner-links-total">
                  {linkTotal}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 max-w-3xl text-xs text-race-dim">
            {copy("linksIndirect", { audit: auditEntries })}
          </p>
          {deleteError ? (
            <p
              role="alert"
              className="mt-3 text-sm font-medium text-red-600 dark:text-red-400"
              data-testid="runner-delete-error"
            >
              {copy(`deleteError_${deleteError}`)}
            </p>
          ) : null}
          {canDeleteRunner(links) ? (
            <McvvAdminRunnerDelete
              runnerId={runner.id}
              copy={{
                trigger: copy("deleteTrigger"),
                title: copy("deleteTitle", { name: runner.name }),
                description: copy("deleteText", { name: runner.name, id: runner.id }),
                confirm: copy("deleteConfirm"),
              }}
            />
          ) : (
            <p className="mt-3 text-sm text-race-muted" data-testid="runner-delete-locked">
              {copy("deleteLocked")}
            </p>
          )}
        </section>

        {query.prejmenovano ? (
          <div
            role="status"
            className="mt-6 border border-race-accent/50 bg-race-accent/10 p-4 text-sm"
            data-testid="runner-rename-done"
          >
            <p className="font-semibold text-foreground dark:text-white">{copy("doneTitle")}</p>
            <p className="mt-1 text-race-muted">{copy("doneDetail", { name: runner.name })}</p>
          </div>
        ) : null}

        <section className="mt-8" data-testid="runner-nationality">
          <h2 className="font-display text-2xl font-semibold text-foreground dark:text-white">
            {copy("nationalityTitle")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-race-muted">
            {copy("nationalityHint")}
          </p>
          <form
            key={runner.nationality ?? ""}
            action={saveRunnerNationality}
            className="mt-4 flex flex-wrap items-center gap-3"
            data-testid="runner-nationality-form"
          >
            <input type="hidden" name="runnerId" value={runner.id} />
            <input type="hidden" name="back" value="runner" />
            {back ? <input type="hidden" name="z" value={`${back.rok}-${back.id}`} /> : null}
            <label htmlFor="runner-nationality" className="sr-only">
              {nationalityOptions.label}
            </label>
            <NationalityFlagSelect
              id="runner-nationality"
              field={nationalityOptions}
              defaultValue={runner.nationality ?? ""}
              className="h-10 min-w-[14rem] border border-race-line bg-race-surface px-3 text-sm"
            />
            <Button type="submit" variant="outline" className="h-10">
              {nationalityCopy("save")}
            </Button>
          </form>
          {query.stat === "ulozeno" ? (
            <p
              role="status"
              className="mt-3 text-sm font-medium text-race-accent"
              data-testid="runner-nationality-saved"
            >
              {nationalityCopy("saved")}
            </p>
          ) : query.stat === "chyba" ? (
            <p role="alert" className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">
              {nationalityCopy("saveError")}
            </p>
          ) : null}
        </section>

        <section className="mt-8" data-testid="runner-rename">
          <h2 className="font-display text-2xl font-semibold text-foreground dark:text-white">
            {copy("renameTitle")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-race-muted">{copy("renameHint")}</p>
          {/* key: po přejmenování / jiném náhledu formulář znovu převezme výchozí hodnoty. */}
          <form
            key={`${runner.name}|${lastName}|${firstName}|${modeValue}|${fromYear}`}
            method="get"
            className="mt-4 grid max-w-3xl gap-4"
            data-testid="runner-rename-form"
          >
            {back ? <input type="hidden" name="z" value={`${back.rok}-${back.id}`} /> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="prijmeni">{copy("lastName")}</Label>
                <Input
                  id="prijmeni"
                  name="prijmeni"
                  defaultValue={lastName}
                  required
                  maxLength={RUNNER_NAME_MAX}
                  className="h-10 bg-race-surface"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="jmeno">{copy("firstName")}</Label>
                <Input
                  id="jmeno"
                  name="jmeno"
                  defaultValue={firstName}
                  required
                  maxLength={RUNNER_NAME_MAX}
                  className="h-10 bg-race-surface"
                />
              </div>
            </div>
            <fieldset className="grid gap-2 text-sm">
              <legend className="mb-1 font-medium">{copy("modeLabel")}</legend>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="rezim"
                  value="vse"
                  defaultChecked={modeValue === "vse"}
                  className="mt-1"
                />
                <span>
                  <span className="font-semibold">{copy("modeAll")}</span>
                  <span className="block text-race-muted">{copy("modeAllHint")}</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="rezim"
                  value="od"
                  defaultChecked={modeValue === "od"}
                  className="mt-1"
                />
                <span>
                  <span className="font-semibold">{copy("modeFrom")}</span>
                  <span className="block text-race-muted">{copy("modeFromHint")}</span>
                </span>
              </label>
              <div className="ml-6 grid max-w-40 gap-1.5">
                <Label htmlFor="od">{copy("fromYear")}</Label>
                <Input
                  id="od"
                  name="od"
                  type="number"
                  min={1990}
                  max={currentYear + 1}
                  defaultValue={fromYear}
                  className="h-10 bg-race-surface"
                />
              </div>
            </fieldset>
            <div>
              <Button type="submit" variant="outline" className="h-10">
                {copy("preview")}
              </Button>
            </div>
          </form>

          {shownError ? (
            <p
              role="alert"
              className="mt-4 text-sm font-medium text-red-600 dark:text-red-400"
              data-testid="runner-rename-error"
            >
              {copy(`error_${shownError}` as "error_failed")}
            </p>
          ) : null}

          {plan ? (
            <div
              className="mt-6 border border-race-line/55 bg-race-surface p-5"
              data-testid="runner-rename-preview"
            >
              <p className="text-sm">
                {copy.rich("previewSummary", {
                  old: plan.oldName,
                  new: plan.newName,
                  b: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
              <p className="mt-1 text-sm text-race-muted">
                {plan.mode === "from"
                  ? copy("previewModeFrom", { year: plan.fromYear ?? currentYear })
                  : copy("previewModeAll")}
              </p>
              {plan.updates.length ? (
                <table className="mt-4 w-full max-w-3xl border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-race-line text-xs uppercase tracking-wide text-race-muted">
                      <th className="py-2 pr-3">{copy("colYear")}</th>
                      <th className="py-2 pr-3">{copy("colTable")}</th>
                      <th className="py-2 pr-3">{copy("colBefore")}</th>
                      <th className="py-2 pr-3">{copy("colAfter")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.updates.map((update) => (
                      <tr
                        key={`${update.table}-${update.year}`}
                        className="border-b border-race-line/40"
                      >
                        <td className="py-2 pr-3">{update.year}</td>
                        <td className="py-2 pr-3">{tableLabel(update.table)}</td>
                        <td className="py-2 pr-3 text-race-muted">{nameCell(update.oldName)}</td>
                        <td className="py-2 pr-3 font-semibold">{update.newName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mt-3 text-sm text-race-muted">{copy("previewNoRows")}</p>
              )}
              {keptNames.length ? (
                <p className="mt-3 text-sm text-race-muted" data-testid="runner-rename-kept">
                  {copy("previewKept", {
                    rows: keptNames
                      .map((group) => `${group.name} (${group.years.join(", ")})`)
                      .join("; "),
                  })}
                </p>
              ) : null}
              <form action={renameRunnerAction} className="mt-4 flex flex-wrap items-center gap-3">
                <input type="hidden" name="runnerId" value={runner.id} />
                <input type="hidden" name="prijmeni" value={lastName} />
                <input type="hidden" name="jmeno" value={firstName} />
                <input type="hidden" name="rezim" value={modeValue} />
                <input type="hidden" name="od" value={fromYear} />
                {back ? <input type="hidden" name="z" value={`${back.rok}-${back.id}`} /> : null}
                <McvvAdminPendingSubmit
                  label={copy("confirm")}
                  pendingLabel={copy("confirmPending")}
                />
                <Link
                  href={{ pathname: "/admin/ciselniky/bezci/[id]", params: { id: runner.id } }}
                  className="text-sm font-semibold text-race-muted hover:underline"
                >
                  {copy("cancel")}
                </Link>
              </form>
            </div>
          ) : null}
        </section>

        <section className="mt-10">
          <h2 className="font-display text-2xl font-semibold text-foreground dark:text-white">
            {copy("yearsTitle")}
          </h2>
          {runner.years.length ? (
            <div className="mt-4 overflow-x-auto">
              <table
                className="w-full min-w-[36rem] border-collapse text-left text-sm"
                data-testid="runner-years"
              >
                <thead>
                  <tr className="border-b border-race-line text-xs uppercase tracking-wide text-race-muted">
                    <th className="py-2 pr-3">{copy("colYear")}</th>
                    <th className="py-2 pr-3">{copy("tableResults")}</th>
                    <th className="py-2 pr-3">{copy("tableStarts")}</th>
                    <th className="py-2 pr-3">{copy("colClub")}</th>
                    <th className="py-2 pr-3">{copy("colRegistration")}</th>
                  </tr>
                </thead>
                <tbody>
                  {runner.years.map((row) => (
                    <tr key={row.year} className="border-b border-race-line/40">
                      <td className="py-2 pr-3 font-semibold">{row.year}</td>
                      <td className="py-2 pr-3">{nameCell(row.resultName)}</td>
                      <td className="py-2 pr-3">{nameCell(row.startName)}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{row.clubId ?? ""}</td>
                      <td className="py-2 pr-3">
                        {row.registrationId != null ? (
                          <Link
                            href={{
                              pathname: "/admin/prihlasky/[rok]/[id]",
                              params: { rok: String(row.year), id: String(row.registrationId) },
                            }}
                            className="text-race-accent hover:underline"
                          >
                            #{row.registrationId}
                          </Link>
                        ) : (
                          ""
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-race-muted">{copy("yearsNone")}</p>
          )}
        </section>
      </div>
    </main>
  );
}
