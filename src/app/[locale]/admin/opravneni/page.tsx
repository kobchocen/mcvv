import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { getAccess, requireSection } from "@/lib/admin/access";
import { resetPermissions, savePermissions } from "@/lib/admin/permission-actions";
import {
  defaultLevel,
  EDITABLE_ROLES,
  EDITABLE_SECTIONS,
  effectiveCell,
  matrixField,
  overrideKey,
  type SectionId,
} from "@/lib/admin/permissions";
import { ADMIN_SECTIONS, type AdminNavLabel } from "@/lib/admin/sections";
import type { Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "AdminPermissions" });
  return { title: t("title") };
}

/** Sekce mimo panel (jen akce uvnitř stránek) mají vlastní popisky. */
const EXTRA_LABELS = {
  "raceControl.resultboard": "sec_resultboard",
  "raceControl.testRun": "sec_testRun",
  "raceOffice.bankPaid": "sec_bankPaid",
  "dictionaries.clubs.merge": "sec_clubsMerge",
  "dictionaries.clubs.orphans": "sec_clubsOrphans",
  "dictionaries.runners.merge": "sec_runnersMerge",
} as const satisfies Partial<Record<SectionId, string>>;

/**
 * Editor oprávnění rolí (P8, Systém › Oprávnění rolí): matice role × sekce s úrovní
 * – / čtení / úpravy. Jen admin a jen při zapnutém `permissions.v2` (jinak 404).
 * Zvýrazněné buňky se liší od výchozí matice z kódu.
 */
export default async function AdminPermissionsPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireSection("permissions", "read");
  const access = await getAccess();
  if (!access.v2) notFound();
  const sp = await searchParams;
  const copy = await getTranslations({ locale, namespace: "AdminPermissions" });
  const nav = await getTranslations({ locale, namespace: "AdminNav" });
  const users = await getTranslations({ locale, namespace: "AdminUsers" });

  const labels = new Map<string, string>();
  for (const group of ADMIN_SECTIONS) {
    for (const chapter of group.chapters) {
      labels.set(chapter.id, nav(chapter.label as AdminNavLabel));
      for (const child of chapter.children ?? []) {
        labels.set(child.id, `${nav(chapter.label as AdminNavLabel)} › ${nav(child.label)}`);
      }
    }
  }
  const sectionLabel = (id: SectionId) =>
    id in EXTRA_LABELS
      ? copy(EXTRA_LABELS[id as keyof typeof EXTRA_LABELS])
      : (labels.get(id) ?? id);
  const levelLabel = { none: "–", read: copy("levelRead"), write: copy("levelWrite") };
  const overrideCount = [...access.overrides.keys()].length;
  const savedCount = Number.parseInt(sp.saved ?? "", 10);

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("title")}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-race-muted">{copy("intro")}</p>
        {sp.saved === "reset" ? (
          <p className="mt-4 text-sm font-semibold text-race-accent" role="status">
            {copy("resetDone")}
          </p>
        ) : Number.isFinite(savedCount) ? (
          <p className="mt-4 text-sm font-semibold text-race-accent" role="status">
            {copy("saved", { count: savedCount })}
          </p>
        ) : null}
        {sp.error === "confirm" ? (
          <p className="mt-4 text-sm font-semibold text-red-600" role="alert">
            {copy("errorConfirm")}
          </p>
        ) : null}

        <form action={savePermissions} className="mt-8" data-testid="permissions-form">
          <div className="overflow-x-auto border border-race-line/55">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-race-line/55 text-left text-xs text-race-muted">
                  <th className="sticky left-0 z-10 bg-race-deep px-3 py-2">
                    {copy("colSection")}
                  </th>
                  {EDITABLE_ROLES.map((role) => (
                    <th key={role} className="px-2 py-2 align-bottom font-semibold">
                      {users(`staffRole_${role}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EDITABLE_SECTIONS.map((id) => (
                  <tr key={id} className="border-b border-race-line/35">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-race-deep px-3 py-1.5 text-left font-medium whitespace-nowrap"
                    >
                      {sectionLabel(id)}
                    </th>
                    {EDITABLE_ROLES.map((role) => {
                      const level = effectiveCell(role, id, access.overrides);
                      const changed =
                        access.overrides.has(overrideKey(role, id)) &&
                        level !== defaultLevel(role, id);
                      return (
                        <td
                          key={role}
                          className={changed ? "bg-race-accent/15 px-1 py-1" : "px-1 py-1"}
                          title={
                            changed
                              ? copy("changedHint", { level: levelLabel[defaultLevel(role, id)] })
                              : undefined
                          }
                        >
                          <select
                            name={matrixField(role, id)}
                            defaultValue={level}
                            aria-label={`${sectionLabel(id)} – ${users(`staffRole_${role}`)}`}
                            className="h-8 border border-race-line bg-race-surface px-1 text-xs"
                          >
                            <option value="none">{levelLabel.none}</option>
                            <option value="read">{levelLabel.read}</option>
                            <option value="write">{levelLabel.write}</option>
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-race-muted">{copy("lockedNote")}</p>
          <Button type="submit" className="mt-4">
            {copy("save")}
          </Button>
        </form>

        <form
          action={resetPermissions}
          className="mt-10 grid max-w-xl gap-3 border border-race-line/55 p-4"
          data-testid="permissions-reset"
        >
          <h2 className="font-display text-lg font-semibold">{copy("resetTitle")}</h2>
          <p className="text-sm text-race-muted">{copy("resetIntro", { count: overrideCount })}</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="confirm" value="1" required />
            {copy("resetConfirm")}
          </label>
          <Button type="submit" variant="outline" className="w-fit">
            {copy("resetButton")}
          </Button>
        </form>
      </div>
    </main>
  );
}
