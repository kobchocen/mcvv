import { getTranslations } from "next-intl/server";

import { Link, type Locale } from "@/i18n/routing";

/** Stránka resultboardu pro přihlášeného bez oprávnění `screens.resultboard`. */
export async function McvvResultboardForbidden({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "Resultboard" });
  return (
    <main className="min-h-screen bg-race-deep px-4 py-16 text-foreground">
      <div className="mx-auto max-w-md" data-testid="resultboard-forbidden">
        <h1 className="font-display text-2xl font-bold">{t("forbiddenTitle")}</h1>
        <p className="mt-3 text-sm text-race-muted">{t("forbidden")}</p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm font-medium text-race-accent hover:underline"
        >
          {t("home")}
        </Link>
      </div>
    </main>
  );
}
