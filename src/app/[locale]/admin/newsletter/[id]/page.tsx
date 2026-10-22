import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { requireStaff } from "@/lib/admin/staff";
import { prisma } from "@/lib/db/client";
import { BANNER_ERROR_MESSAGES, bannerChoiceValue, campaignBanner } from "@/lib/newsletter/banner";
import { loadBannerOptions } from "@/lib/newsletter/banner-store";
import { deleteNewsletterDraft, retryFailedNewsletter } from "@/lib/newsletter/actions";
import { audienceHints } from "@/lib/newsletter/hints";
import { newsletterOrigin } from "@/lib/newsletter/origin";
import { loadAudience, recipientCounts } from "@/lib/newsletter/store";
import { NEWSLETTER_BATCH_PAUSE_MS, newsletterDryRun } from "@/lib/newsletter/transport";
import {
  McvvNewsletterProgress,
  McvvNewsletterStartForm,
  McvvNewsletterTestForm,
} from "@/components/organisms/mcvv-admin-newsletter";
import { McvvAdminHomeLink } from "@/components/organisms";
import { McvvAdminNewsletterForm } from "@/components/organisms/mcvv-admin-newsletter-form";
import {
  McvvNewsletterBannerDraftProvider,
  McvvNewsletterEmailPreview,
} from "@/components/organisms/mcvv-admin-newsletter-banner";
import { type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ banner?: string }>;
}>;

export const metadata: Metadata = { title: "Kampaň — Newsletter" };

const STATUS: Record<string, string> = {
  draft: "Koncept",
  test_sent: "Test odeslán",
  sending: "Odesílá se",
  sent: "Odesláno",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 border-t border-race-line/55 pt-6">
      <h2 className="mb-4 font-display text-xl font-semibold text-foreground dark:text-white">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function AdminNewsletterDetailPage({ params, searchParams }: PageProps) {
  const { locale, id: rawId } = await params;
  const { banner: bannerErrorKey } = await searchParams;
  const bannerError =
    bannerErrorKey && Object.hasOwn(BANNER_ERROR_MESSAGES, bannerErrorKey)
      ? BANNER_ERROR_MESSAGES[bannerErrorKey as keyof typeof BANNER_ERROR_MESSAGES]
      : null;
  setRequestLocale(locale as Locale);
  const session = await requireStaff();
  const id = Number.parseInt(rawId, 10);
  const campaign = Number.isFinite(id)
    ? await prisma.newsletterCampaign.findUnique({ where: { id } })
    : null;
  if (!campaign) notFound();

  const editable = campaign.status === "draft" || campaign.status === "test_sent";
  const origin = await newsletterOrigin();
  // Náhled běží na stejném webu: relativní cesta (v e-mailu je absolutní URL podle AUTH_ORIGIN).
  const previewBanner = campaignBanner(campaign, "");
  const emailBanner = campaignBanner(campaign, origin);
  const bannerDraft = {
    choice: bannerChoiceValue(campaign),
    alt: campaign.bannerAlt ?? "",
    link: campaign.bannerLink ?? "",
  };
  const counts = await recipientCounts(campaign.id);
  const audience = editable
    ? await loadAudience({
        users: campaign.audienceUsers,
        years: campaign.audienceYears,
        excludeCurrentEntrants: campaign.excludeCurrentEntrants,
      })
    : null;
  const failed =
    counts.failed > 0
      ? await prisma.newsletterRecipient.findMany({
          where: { campaignId: campaign.id, status: "failed" },
          take: 50,
          select: { email: true, error: true },
        })
      : [];
  const dryRun = newsletterDryRun();

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <McvvAdminHomeLink label="Administrace" />
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {campaign.subject}
        </h1>
        <p className="mt-2 text-sm text-race-muted">
          Stav: <strong>{STATUS[campaign.status]}</strong>
          {campaign.testSentAt ? ` · test ${campaign.testSentAt.toLocaleString("cs-CZ")}` : ""}
          {campaign.sentAt ? ` · dokončeno ${campaign.sentAt.toLocaleString("cs-CZ")}` : ""}
        </p>
        {dryRun ? (
          <p className="mt-3 border border-amber-500/60 bg-amber-500/10 p-3 text-sm">
            Režim NEWSLETTER_DRY_RUN: rozesílka publiku se jen zaznamená, nic se neodešle. Testovací
            e-mail se odesílá normálně.
          </p>
        ) : null}

        {bannerError ? (
          <p role="alert" className="mt-4 border border-red-500/60 bg-red-500/10 p-3 text-sm">
            Banner se neuložil: {bannerError} Ostatní úpravy jsou uložené.
          </p>
        ) : null}

        {/* Klíč = poslední uložení: po „Uložit koncept“ začne náhled znovu z uloženého stavu. */}
        <McvvNewsletterBannerDraftProvider
          key={campaign.updatedAt.toISOString()}
          initial={bannerDraft}
        >
          <Section title="Náhled">
            <McvvNewsletterEmailPreview
              subject={campaign.subject}
              body={campaign.body}
              origin={origin}
              savedPreview={previewBanner}
              savedEmail={emailBanner}
            />
          </Section>

          {editable ? (
            <>
              <Section title="1. Úpravy">
                <McvvAdminNewsletterForm
                  values={{
                    id: campaign.id,
                    subject: campaign.subject,
                    body: campaign.body,
                    audienceUsers: campaign.audienceUsers,
                    audienceYears: campaign.audienceYears,
                    excludeCurrentEntrants: campaign.excludeCurrentEntrants,
                    banner: bannerDraft.choice,
                    bannerAlt: bannerDraft.alt,
                    bannerLink: bannerDraft.link,
                  }}
                  audienceHints={await audienceHints()}
                  bannerOptions={await loadBannerOptions()}
                />
                <form action={deleteNewsletterDraft} className="mt-4">
                  <input type="hidden" name="id" value={campaign.id} />
                  <button type="submit" className="text-sm text-race-muted hover:underline">
                    Smazat koncept
                  </button>
                </form>
              </Section>
              <Section title="2. Testovací e-mail">
                <McvvNewsletterTestForm id={campaign.id} defaultTo={session.email} />
              </Section>
              <Section title="3. Odeslat publiku">
                {audience ? (
                  <p className="mb-3 text-sm">
                    Publikum: <strong>{audience.emails.length}</strong> unikátních adres
                    (registrovaní {audience.users}, z přihlášek {audience.legacy}, vyřazeno{" "}
                    {audience.excluded}, z toho bez souhlasu s propagací {audience.noPromotion}
                    {campaign.excludeCurrentEntrants
                      ? `, letos přihlášených ${audience.currentEntrants}`
                      : ", letos přihlášení nevyřazeni"}
                    ).
                  </p>
                ) : null}
                {campaign.status === "test_sent" && audience && audience.emails.length > 0 ? (
                  <McvvNewsletterStartForm id={campaign.id} count={audience.emails.length} />
                ) : (
                  <p className="text-sm text-race-muted">
                    Odeslání publiku je dostupné po odeslání testovacího e-mailu aktuální verze.
                  </p>
                )}
              </Section>
            </>
          ) : (
            <Section title="Průběh odesílání">
              <McvvNewsletterProgress
                id={campaign.id}
                initial={counts}
                active={campaign.status === "sending"}
                pauseMs={NEWSLETTER_BATCH_PAUSE_MS}
              />
              {failed.length > 0 ? (
                <div className="mt-6">
                  <h3 className="mb-2 font-semibold">Chyby (prvních 50)</h3>
                  <ul className="text-sm">
                    {failed.map((row) => (
                      <li key={row.email}>
                        {row.email} — {row.error}
                      </li>
                    ))}
                  </ul>
                  <form action={retryFailedNewsletter} className="mt-3">
                    <input type="hidden" name="id" value={campaign.id} />
                    <button
                      type="submit"
                      className="text-sm font-semibold text-race-accent hover:underline"
                    >
                      Zkusit chybné znovu (pozor: u přerušených dávek může dojít k duplicitě)
                    </button>
                  </form>
                </div>
              ) : null}
            </Section>
          )}
        </McvvNewsletterBannerDraftProvider>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
