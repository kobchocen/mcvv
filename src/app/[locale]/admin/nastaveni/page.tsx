import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { requireAdmin } from "@/lib/admin/staff";
import { saveSettings } from "@/lib/admin/settings";
import { getFreeEntryEmailsText } from "@/lib/entries/settings";
import { type Locale } from "@/i18n/routing";
import { McvvAdminHomeLink } from "@/components/organisms";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("settingsTitle") };
}

export default async function AdminSettingsPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireAdmin();
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const emails = await getFreeEntryEmailsText();

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <McvvAdminHomeLink label={copy("title")} />
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("settingsTitle")}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-race-muted">{copy("settingsIntro")}</p>
        <form action={saveSettings} className="mt-8 grid gap-3">
          <Label htmlFor="emails">{copy("settingsFreeEmails")}</Label>
          <Textarea
            id="emails"
            name="emails"
            defaultValue={emails}
            className="min-h-48 bg-race-surface font-mono text-sm"
          />
          <Button
            type="submit"
            className="h-10 w-fit bg-race-accent font-display font-semibold text-white hover:bg-race-accent-hover"
          >
            {copy("save")}
          </Button>
        </form>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
