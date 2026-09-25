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
import { getSession } from "@/lib/auth/session";

export type McvvHomepageTemplateProps = {
  content: McvvHomepageContent;
  galleryPhotoIds?: number[];
};

export async function McvvHomepageTemplate({
  content,
  galleryPhotoIds,
}: McvvHomepageTemplateProps) {
  const session = await getSession();
  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvNavbar
        content={content}
        variant="solid"
        account={session ? { name: session.name, email: session.email } : null}
      />
      <McvvHeroSection content={content} signedIn={Boolean(session)} />
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
