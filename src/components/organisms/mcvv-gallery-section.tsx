import Image from "next/image";

import { SectionHeader } from "@/components/molecules";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

const fallbackImages = [
  "/images/runner-climb.jpg",
  "/illustrations/trail-map.jpg",
  "/images/hero.jpg",
  "/illustrations/topographic-map.jpg",
];

export type McvvGallerySectionProps = {
  content: McvvHomepageContent["gallery"];
  photoIds?: number[];
};

export function McvvGallerySection({ content, photoIds }: McvvGallerySectionProps) {
  const realSources =
    photoIds && photoIds.length > 0 ? photoIds.map((id) => `/api/test/fotka?id=${id}`) : [];
  const imageSources = [...realSources, ...fallbackImages].slice(0, 7);

  const largeSrc = imageSources[0];
  const smallSrcs = imageSources.slice(1, 7);

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
        {/* 
          Responsive spanning grid:
          - Base (mobile): grid-cols-3. Large uses col-span-3 + aspect so it's full-width above.
            The 6 smalls flow naturally into two rows of 3 below (gap-4 consistent).
          - md+: switches to grid-cols-5. Large overrides to col-span-2 + row-span-2 (left tall).
            The 6 direct small siblings auto-place into the right 3 columns × 2 rows.
            Row heights are dictated by the smalls' aspect-[3/4] boxes.
            Large's container is sized to exactly cover both rows + the grid gap → bottom edges align.
        */}
        <div className="mt-10 grid grid-cols-3 gap-4 md:grid-cols-5">
          {/* Large photo */}
          <div className="col-span-3 aspect-[3/4] md:aspect-auto md:col-span-2 md:row-span-2 overflow-hidden border border-race-line/60 bg-race-forest relative">
            <Image
              src={largeSrc}
              alt={content.alt[0] ?? content.title}
              fill
              className="object-cover object-top"
            />
          </div>

          {/* 6 small photos — always direct children of the grid.
              Mobile → fill the 3-col rows below the large.
              Desktop → auto-placed to the right of the large, defining its exact height. */}
          {smallSrcs.map((src, index) => (
            <div
              key={index}
              className="aspect-[3/4] overflow-hidden border border-race-line/60 bg-race-forest relative"
            >
              <Image
                src={src}
                alt={content.alt[(index + 1) % content.alt.length] ?? content.title}
                fill
                className="object-cover object-top"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
