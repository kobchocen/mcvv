import Image from "next/image";

import { SectionHeader } from "@/components/molecules";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

const galleryImages = [
  "/images/runner-climb.jpg",
  "/illustrations/trail-map.jpg",
  "/images/hero.jpg",
  "/illustrations/topographic-map.jpg",
];

export type McvvGallerySectionProps = {
  content: McvvHomepageContent["gallery"];
};

export function McvvGallerySection({ content }: McvvGallerySectionProps) {
  return (
    <section id="gallery" className="bg-race-deep px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          eyebrow={content.eyebrow}
          title={content.title}
          description={content.description}
          className="lg:flex-row lg:items-end lg:justify-between"
          titleClassName="max-w-3xl"
        />
        <div className="mt-10 grid auto-rows-[15rem] gap-4 md:grid-cols-4 md:auto-rows-[18rem]">
          {galleryImages.map((image, index) => (
            <div
              key={image}
              className="relative overflow-hidden border border-race-line/60 bg-race-forest md:[&:first-child]:col-span-2 md:[&:first-child]:row-span-2"
            >
              <Image
                src={image}
                alt={content.alt[index] ?? content.title}
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
