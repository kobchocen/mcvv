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
import { getSession, isStaffRole } from "@/lib/auth/session";
import { countConfirmedRunners } from "@/lib/entries/status";
import { currentRaceYear, registrationDeadlineEnd } from "@/lib/entries/year";

export type McvvHomepageTemplateProps = {
  content: McvvHomepageContent;
  galleryPhotoIds?: number[];
};

export async function McvvHomepageTemplate({
  content,
  galleryPhotoIds,
}: McvvHomepageTemplateProps) {
  const session = await getSession();
  const { year, deadline, open } = await currentRaceYear();
  const enrolledCount = await countConfirmedRunners(year);
  const deadlineEnd = registrationDeadlineEnd(deadline);
  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvNavbar
        content={content}
        variant="solid"
        account={
          session
            ? { name: session.name, email: session.email, staff: isStaffRole(session.role) }
            : null
        }
      />
      <McvvHeroSection
        content={content}
        deadlineMs={open ? (deadlineEnd?.getTime() ?? null) : null}
        enrolledLabel={(content.hero.enrolled ?? "Přihlášeno {count} běžců").replaceAll(
          "{count}",
          String(enrolledCount),
        )}
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
