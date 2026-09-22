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

export type McvvHomepageTemplateProps = {
  content: McvvHomepageContent;
  galleryPhotoIds?: number[];
};

export function McvvHomepageTemplate({ content, galleryPhotoIds }: McvvHomepageTemplateProps) {
  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvNavbar content={content} variant="solid" />
      <McvvHeroSection content={content} />
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
