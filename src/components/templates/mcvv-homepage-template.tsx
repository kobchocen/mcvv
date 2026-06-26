import {
  McvvFinalCtaSection,
  McvvFooter,
  McvvGallerySection,
  McvvHeroSection,
  McvvInfoSection,
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
    <main className="min-h-screen overflow-hidden bg-race-deep text-foreground">
      <McvvHeroSection content={content} />
      <McvvOverviewSection content={content.overview} />
      <McvvProfileSection content={content.profile} />
      <McvvScheduleSection content={content.schedule} />
      <McvvInfoSection content={content.info} />
      <McvvResultsSection content={content.results} />
      <McvvGallerySection content={content.gallery} photoIds={galleryPhotoIds} />
      <McvvPartnersSection content={content.partners} />
      <McvvFinalCtaSection content={content.finalCta} />
      <McvvFooter content={content} />
    </main>
  );
}
