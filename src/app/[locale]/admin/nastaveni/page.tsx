import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { requireAdmin } from "@/lib/admin/staff";
import { saveSettings } from "@/lib/admin/settings";
import { getFreeEntryEmailsText } from "@/lib/entries/settings";
import { getOrganizerRegistrationEmailText } from "@/lib/entries/organizer-registration";
import { DEFAULT_ORGANIZER_REGISTRATION_EMAIL } from "@/lib/entries/organizer-registration-core";
import { getSiteSettings, ONLINE_RESULTS_URL_MAX, STATS_MOMENT_MAX } from "@/lib/settings/site";
import { type Locale } from "@/i18n/routing";
import { env } from "@/lib/env";
import { getMessageSettings, resolveOrganizerEmail } from "@/lib/settings/messages";
import {
  DEFAULT_RECEIPT_ISSUER,
  getStoredReceiptIssuer,
  RECEIPT_ADDRESS_MAX,
  RECEIPT_TEXT_MAX,
} from "@/lib/settings/receipt";
import { McvvAdminHomeLink } from "@/components/organisms";
import { AdminField } from "@/components/organisms/mcvv-admin-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("settingsTitle") };
}

export default async function AdminSettingsPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const { saved, error } = await searchParams;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireAdmin();
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const [emails, site, messages, receipt, organizerRegEmail] = await Promise.all([
    getFreeEntryEmailsText(),
    getSiteSettings(),
    getMessageSettings(),
    getStoredReceiptIssuer(),
    getOrganizerRegistrationEmailText(),
  ]);
  const organizerFallback = resolveOrganizerEmail(null, env.CONTACT_TO);

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <McvvAdminHomeLink label={copy("title")} />
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("settingsTitle")}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-race-muted">{copy("settingsIntro")}</p>
        {error === "url" ? (
          <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
            {copy("settingsOnlineUrlInvalid")}
          </p>
        ) : error === "organizerRegistrationEmail" ? (
          <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
            {copy("settingsOrganizerRegistrationEmailInvalid")}
          </p>
        ) : error === "email" ? (
          <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
            {copy("settingsOrganizerEmailInvalid")}
          </p>
        ) : saved === "1" ? (
          <p role="status" className="mt-4 text-sm text-race-accent">
            {copy("settingsSaved")}
          </p>
        ) : null}
        <form action={saveSettings} className="mt-8 grid gap-8">
          <fieldset className="grid gap-4 border border-race-line/60 bg-race-surface/40 p-4">
            <legend className="px-1 font-display text-lg font-semibold">
              {copy("settingsRaceDay")}
            </legend>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="startlistPublished"
                defaultChecked={site.startlistPublished}
                className="mt-0.5 size-4"
              />
              <span>
                <span className="font-medium">{copy("settingsStartlistPublished")}</span>
                <span className="mt-1 block text-race-muted">
                  {copy("settingsStartlistPublishedHint")}
                </span>
              </span>
            </label>
            <div className="grid gap-1.5">
              <Label htmlFor="onlineResultsUrl">{copy("settingsOnlineUrl")}</Label>
              <Input
                id="onlineResultsUrl"
                name="onlineResultsUrl"
                type="url"
                inputMode="url"
                placeholder="https://"
                pattern="https?://.+"
                maxLength={ONLINE_RESULTS_URL_MAX}
                defaultValue={site.onlineResultsUrl ?? ""}
                aria-describedby="onlineResultsUrlHint"
                className="h-10 bg-race-surface"
              />
              <p id="onlineResultsUrlHint" className="text-xs text-race-muted">
                {copy("settingsOnlineUrlHint")}
              </p>
            </div>
          </fieldset>

          <fieldset className="grid gap-4 border border-race-line/60 bg-race-surface/40 p-4">
            <legend className="px-1 font-display text-lg font-semibold">
              {copy("settingsStats")}
            </legend>
            <AdminField name="statsMoment" label={copy("settingsStatsMoment")}>
              <Textarea
                id="statsMoment"
                name="statsMoment"
                maxLength={STATS_MOMENT_MAX}
                defaultValue={site.statsMoment}
                aria-describedby="statsMomentHint"
                className="min-h-28 bg-race-surface"
              />
            </AdminField>
            <p id="statsMomentHint" className="-mt-2 text-xs text-race-muted">
              {copy("settingsStatsMomentHint")}
            </p>
          </fieldset>

          <fieldset className="grid gap-4 border border-race-line/60 bg-race-surface/40 p-4">
            <legend className="px-1 font-display text-lg font-semibold">
              {copy("settingsMessages")}
            </legend>
            <div className="grid gap-1.5">
              <Label htmlFor="organizerEmail">{copy("settingsOrganizerEmail")}</Label>
              <Input
                id="organizerEmail"
                name="organizerEmail"
                type="email"
                maxLength={254}
                placeholder={organizerFallback}
                defaultValue={messages.organizerEmail}
                aria-describedby="organizerEmailHint"
                className="h-10 bg-race-surface"
              />
              <p id="organizerEmailHint" className="text-xs text-race-muted">
                {copy("settingsOrganizerEmailHint", { fallback: organizerFallback })}
              </p>
            </div>
            {(
              [
                [
                  "messagesEnabled",
                  messages.enabled,
                  "settingsMessagesEnabled",
                  "settingsMessagesEnabledHint",
                ],
                [
                  "messagesNotifyOrganizer",
                  messages.notifyOrganizer,
                  "settingsNotifyOrganizer",
                  "settingsNotifyOrganizerHint",
                ],
                [
                  "messagesNotifyUser",
                  messages.notifyUser,
                  "settingsNotifyUser",
                  "settingsNotifyUserHint",
                ],
                [
                  "entriesNotifyChanges",
                  messages.notifyChanges,
                  "settingsNotifyChanges",
                  "settingsNotifyChangesHint",
                ],
              ] as const
            ).map(([name, checked, label, hint]) => (
              <label key={name} className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name={name}
                  defaultChecked={checked}
                  className="mt-0.5 size-4"
                />
                <span>
                  <span className="font-medium">{copy(label)}</span>
                  <span className="mt-1 block text-race-muted">{copy(hint)}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset className="grid gap-4 border border-race-line/60 bg-race-surface/40 p-4">
            <legend className="px-1 font-display text-lg font-semibold">
              {copy("settingsReceipt")}
            </legend>
            <p className="text-sm text-race-muted">{copy("settingsReceiptIntro")}</p>
            {(
              [
                [
                  "receiptIssuerName",
                  "settingsReceiptName",
                  receipt.name,
                  DEFAULT_RECEIPT_ISSUER.name,
                ],
                ["receiptIssuerIco", "settingsReceiptIco", receipt.ico, DEFAULT_RECEIPT_ISSUER.ico],
                [
                  "receiptVatNote",
                  "settingsReceiptVat",
                  receipt.vatNote,
                  DEFAULT_RECEIPT_ISSUER.vatNote,
                ],
              ] as const
            ).map(([name, label, value, placeholder]) => (
              <div key={name} className="grid gap-1.5">
                <Label htmlFor={name}>{copy(label)}</Label>
                <Input
                  id={name}
                  name={name}
                  maxLength={RECEIPT_TEXT_MAX}
                  placeholder={placeholder}
                  defaultValue={value}
                  className="h-10 bg-race-surface"
                />
              </div>
            ))}
            <div className="grid gap-1.5">
              <Label htmlFor="receiptIssuerAddress">{copy("settingsReceiptAddress")}</Label>
              <Textarea
                id="receiptIssuerAddress"
                name="receiptIssuerAddress"
                maxLength={RECEIPT_ADDRESS_MAX}
                placeholder={DEFAULT_RECEIPT_ISSUER.address}
                defaultValue={receipt.address}
                className="min-h-20 bg-race-surface"
              />
            </div>
          </fieldset>

          <fieldset className="grid gap-3 border border-race-line/60 bg-race-surface/40 p-4">
            <legend className="px-1 font-display text-lg font-semibold">
              {copy("settingsEntries")}
            </legend>
            <Label htmlFor="emails">{copy("settingsFreeEmails")}</Label>
            <Textarea
              id="emails"
              name="emails"
              defaultValue={emails}
              className="min-h-48 bg-race-surface font-mono text-sm"
            />
            <div className="mt-3 grid gap-1.5">
              <Label htmlFor="organizerRegistrationEmail">
                {copy("settingsOrganizerRegistrationEmail")}
              </Label>
              <Input
                id="organizerRegistrationEmail"
                name="organizerRegistrationEmail"
                type="email"
                maxLength={254}
                placeholder={DEFAULT_ORGANIZER_REGISTRATION_EMAIL}
                defaultValue={organizerRegEmail}
                aria-describedby="organizerRegistrationEmailHint"
                className="h-10 bg-race-surface"
              />
              <p id="organizerRegistrationEmailHint" className="text-xs text-race-muted">
                {copy("settingsOrganizerRegistrationEmailHint", {
                  fallback: DEFAULT_ORGANIZER_REGISTRATION_EMAIL,
                })}
              </p>
            </div>
          </fieldset>
          <Button
            type="submit"
            className="h-10 w-fit bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
          >
            {copy("save")}
          </Button>
        </form>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
