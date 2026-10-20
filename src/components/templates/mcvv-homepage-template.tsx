import { BackToTop } from "@/components/molecules";
import {
  McvvFinalCtaSection,
  McvvFooter,
  McvvGallerySection,
  McvvHeroSection,
  McvvNavbar,
  McvvOverviewSection,
  McvvPartnersSection,
  McvvProfileSection,
  McvvResultsSection,
  McvvScheduleSection,
} from "@/components/organisms";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";
import { getTranslations } from "next-intl/server";

import { getSession, isStaffRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { countValidRunners } from "@/lib/entries/status";
import { currentRaceYear, registrationDeadlineEnd } from "@/lib/entries/year";
import { heroButtons, raceStartFor, resolveHeroPhase, type HeroButton } from "@/lib/race/phase";
import { getSiteSettings } from "@/lib/settings/site";
import { getOfeedSettings, resolveOnlineResultsUrl } from "@/lib/ofeed/settings";
import { getUnreadCount } from "@/lib/messages/store";
import type { McvvHeroCta } from "@/components/organisms/mcvv-hero-section";

export type McvvHomepageTemplateProps = {
  content: McvvHomepageContent;
  galleryPhotoIds?: number[];
  locale: string;
};

export async function McvvHomepageTemplate({
  content,
  galleryPhotoIds,
  locale,
}: McvvHomepageTemplateProps) {
  const session = await getSession();
  const { year, deadline, open, raceDate } = await currentRaceYear();
  const [settings, ofeed, resultsCount, startlistCount, entriesCount] = await Promise.all([
    getSiteSettings(),
    getOfeedSettings().catch(() => null),
    prisma.result.count({ where: { year } }),
    prisma.startEntry.count({ where: { year } }),
    countValidRunners(year),
  ]);
  const raceStart = raceStartFor(raceDate, year);
  const now = new Date();
  const phase = resolveHeroPhase({
    now,
    raceStart,
    startlistPublished: settings.startlistPublished,
    resultsCount,
  });
  const buttons = heroButtons({
    phase,
    entriesCount,
    startlistCount,
    resultsCount,
    // ručně zadaná URL má přednost, jinak veřejná stránka akce v OFeed (#127)
    onlineResultsUrl: resolveOnlineResultsUrl(settings.onlineResultsUrl, ofeed?.eventId ?? null),
  });
  const deadlineEnd = registrationDeadlineEnd(deadline);
  const t = await getTranslations({ locale, namespace: "Home.hero" });
  const toCta = (button: HeroButton): McvvHeroCta => {
    switch (button.kind) {
      case "entries":
        return {
          label: content.hero.primaryCta,
          href: button.href,
          count: button.count,
          ariaLabel: t("enrolledAria", { cta: content.hero.primaryCta, count: button.count ?? 0 }),
        };
      case "program":
        return { label: content.hero.secondaryCta, href: button.href };
      case "startlist":
        return {
          label: t("startlistCta"),
          href: button.href,
          count: button.count,
          ariaLabel: t("startlistAria", { cta: t("startlistCta"), count: button.count ?? 0 }),
        };
      case "instructions":
        return { label: t("instructionsCta"), href: button.href };
      case "results":
        return {
          label: t("resultsCta"),
          href: button.href,
          count: button.count,
          ariaLabel: t("resultsAria", { cta: t("resultsCta"), count: button.count ?? 0 }),
        };
      case "onlineResults":
        return {
          label: t("onlineResultsCta"),
          href: button.href,
          external: true,
          ariaLabel: t("onlineResultsAria", { cta: t("onlineResultsCta") }),
        };
    }
  };
  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvNavbar
        content={content}
        variant="solid"
        account={
          session
            ? {
                name: session.name,
                email: session.email,
                staff: isStaffRole(session.role),
                messages: await getUnreadCount(),
              }
            : null
        }
      />
      <McvvHeroSection
        content={content}
        deadlineMs={buttons.showCountdown && open ? (deadlineEnd?.getTime() ?? null) : null}
        primary={toCta(buttons.primary)}
        secondary={buttons.secondary ? toCta(buttons.secondary) : null}
        refreshAtMs={phase === "A" || phase === "B" ? raceStart.getTime() : null}
      />
      <McvvOverviewSection content={content.overview} />
      <McvvProfileSection content={content.profile} />
      <McvvScheduleSection content={content.schedule} />
      <McvvResultsSection content={content.results} />
      <McvvGallerySection content={content.gallery} photoIds={galleryPhotoIds} />
      <McvvPartnersSection content={content.partners} />
      <McvvFinalCtaSection content={content.finalCta} />
      <McvvFooter content={content} />
      <BackToTop label={content.backToTop} />
    </main>
  );
}
