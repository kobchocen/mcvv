import { Footprints, Mountain, Route, Timer, Trees } from "lucide-react";

import { RaceInfoCard, SectionHeader } from "@/components/molecules";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";
import { McvvCourseMapCard } from "./mcvv-course-map-card";

const profileIcons = [Mountain, Footprints, Timer, Trees];

export type McvvProfileSectionProps = {
  content: McvvHomepageContent["profile"];
};

export function McvvProfileSection({ content }: McvvProfileSectionProps) {
  return (
    <section id="route" className="bg-race-deep px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          eyebrow={content.eyebrow}
          title={content.title}
          titleClassName="max-w-none lg:whitespace-nowrap lg:text-[2.15rem] xl:text-5xl"
        />

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-stretch">
          <McvvCourseMapCard
            kicker={content.mapKicker}
            title={content.mapTitle}
            address={content.mapAddress}
            alt={content.mapAlt}
            expandLabel={content.mapExpandLabel}
          />
          <div className="flex flex-col border border-race-line/60 bg-race-forest p-4 sm:p-6 lg:h-full">
            <p className="mb-4 text-sm leading-6 text-race-muted">{content.description}</p>
            <div className="relative aspect-[1200/330] w-full overflow-hidden lg:min-h-0 lg:flex-1 lg:aspect-auto">
              <svg
                viewBox="0 0 1200 330"
                className="absolute inset-0 size-full"
                role="img"
                aria-label={content.title}
              >
                <defs>
                  <linearGradient id="profileFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.68 0.205 39 / 0.45)" />
                    <stop offset="100%" stopColor="oklch(0.68 0.205 39 / 0.04)" />
                  </linearGradient>
                </defs>
                {/* Real elevation profile - using the improved vector curve from dumps/mcvv-profile-current-new.svg (user-edited) */}
                <path
                  d="M24,229.599C43.674,241.862 41.746,274.455 57.977,273.931C63.698,273.747 74.76,259.128 84.697,260.273C90.64,260.958 103.963,266.37 112.713,262.984C123.822,258.685 146.375,94.703 161.148,95.26C168.562,95.54 170.552,108.729 181,109.5C189.592,110.134 190.504,140.321 202.816,139.133C212.937,138.156 207.346,135.363 215.707,136.952C226.211,138.947 232.78,237.269 254.118,261.156C270.737,279.761 264.143,306.672 282.398,308.315C292.021,309.181 314.58,228.725 330.599,196.658C351.068,155.684 348.433,102.401 360.891,99.635C375.162,96.467 395.33,135.076 409.439,176.44C423.769,218.45 430.71,264.513 447.026,264.346C467.117,264.141 493.169,123.039 508.659,109.5C515.782,103.274 510.721,113.583 522.744,109.5C533.402,105.881 525.463,94.839 540.069,89.974C551.269,86.243 566.88,97.469 582.459,96C600.517,94.297 618.318,80.203 625.771,80.089C640.485,79.862 636.258,95.82 653.697,89.437C662.931,86.057 672.723,88.287 686.378,81.656C693.599,78.149 702.315,81.449 709.813,77.273C720.498,71.321 729.545,58.651 735.419,61.865C771.957,81.85 787.439,85.246 798.698,93.784C803.803,97.656 813.233,160.185 827.963,186.299C832.158,193.735 849.106,214.212 855.607,231.471C858.3,238.621 852.669,255.748 872.03,263.059C891.853,270.544 898.951,293.733 912.641,291.646C922.213,290.186 949.93,242.915 956.74,192.886C958.638,178.944 963.21,146.344 969.843,134C972.908,128.295 975.771,131.368 986.254,122C992.16,116.723 986.064,105.402 993,98.667C1004.71,87.294 1028.99,80.976 1031.91,80.495C1040.84,79.024 1066.1,92.186 1085.09,98.667C1102.37,104.567 1131.62,239.876 1143.31,243.57C1155.25,247.344 1145,222.044 1176,225.044 L1176 320 L24 320 Z"
                  fill="url(#profileFill)"
                />
                <path
                  d="M24,229.599C43.674,241.862 41.746,274.455 57.977,273.931C63.698,273.747 74.76,259.128 84.697,260.273C90.64,260.958 103.963,266.37 112.713,262.984C123.822,258.685 146.375,94.703 161.148,95.26C168.562,95.54 170.552,108.729 181,109.5C189.592,110.134 190.504,140.321 202.816,139.133C212.937,138.156 207.346,135.363 215.707,136.952C226.211,138.947 232.78,237.269 254.118,261.156C270.737,279.761 264.143,306.672 282.398,308.315C292.021,309.181 314.58,228.725 330.599,196.658C351.068,155.684 348.433,102.401 360.891,99.635C375.162,96.467 395.33,135.076 409.439,176.44C423.769,218.45 430.71,264.513 447.026,264.346C467.117,264.141 493.169,123.039 508.659,109.5C515.782,103.274 510.721,113.583 522.744,109.5C533.402,105.881 525.463,94.839 540.069,89.974C551.269,86.243 566.88,97.469 582.459,96C600.517,94.297 618.318,80.203 625.771,80.089C640.485,79.862 636.258,95.82 653.697,89.437C662.931,86.057 672.723,88.287 686.378,81.656C693.599,78.149 702.315,81.449 709.813,77.273C720.498,71.321 729.545,58.651 735.419,61.865C771.957,81.85 787.439,85.246 798.698,93.784C803.803,97.656 813.233,160.185 827.963,186.299C832.158,193.735 849.106,214.212 855.607,231.471C858.3,238.621 852.669,255.748 872.03,263.059C891.853,270.544 898.951,293.733 912.641,291.646C922.213,290.186 949.93,242.915 956.74,192.886C958.638,178.944 963.21,146.344 969.843,134C972.908,128.295 975.771,131.368 986.254,122C992.16,116.723 986.064,105.402 993,98.667C1004.71,87.294 1028.99,80.976 1031.91,80.495C1040.84,79.024 1066.1,92.186 1085.09,98.667C1102.37,104.567 1131.62,239.876 1143.31,243.57C1155.25,247.344 1145,222.044 1176,225.044"
                  fill="none"
                  stroke="oklch(0.68 0.205 39)"
                  strokeLinecap="round"
                  strokeWidth="8"
                />
                {/* Numbers adjusted per user feedback to center on peaks */}
                <g>
                  <circle cx="163" cy="93" r="19" fill="oklch(0.68 0.205 39)" />
                  <text
                    x="163"
                    y="99"
                    textAnchor="middle"
                    fontSize="16"
                    fontWeight="700"
                    fill="white"
                  >
                    1
                  </text>

                  <circle cx="360" cy="95" r="19" fill="oklch(0.68 0.205 39)" />
                  <text
                    x="360"
                    y="101"
                    textAnchor="middle"
                    fontSize="16"
                    fontWeight="700"
                    fill="white"
                  >
                    2
                  </text>

                  <circle cx="530" cy="95" r="19" fill="oklch(0.68 0.205 39)" />
                  <text
                    x="530"
                    y="101"
                    textAnchor="middle"
                    fontSize="16"
                    fontWeight="700"
                    fill="white"
                  >
                    3
                  </text>

                  <circle cx="1033" cy="75" r="19" fill="oklch(0.68 0.205 39)" />
                  <text
                    x="1033"
                    y="81"
                    textAnchor="middle"
                    fontSize="16"
                    fontWeight="700"
                    fill="white"
                  >
                    4
                  </text>
                </g>
                <line
                  x1="24"
                  x2="1176"
                  y1="320"
                  y2="320"
                  stroke="oklch(0.38 0.06 150)"
                  strokeWidth="2"
                />
              </svg>

              {/* Floating elevation labels for min/max */}
              <div
                className="absolute -translate-x-1/2 -translate-y-full text-[10px] font-mono px-1.5 py-0.5 bg-race-deep/90 border border-race-line/60 rounded text-green-400 shadow-sm"
                style={{ left: "27%", top: "93%" }}
              >
                286 m.n.m.
              </div>
              <div
                className="absolute -translate-x-1/2 -translate-y-full text-[10px] font-mono px-1.5 py-0.5 bg-race-deep/90 border border-race-line/60 rounded text-green-400 shadow-sm"
                style={{ left: "58%", top: "20%" }}
              >
                343 m.n.m.
              </div>
            </div>
            <div className="relative mt-4 h-7 text-[10px] font-medium text-race-dim sm:text-xs">
              {content.axis?.map((label, i) => {
                const last = (content.axis?.length ?? 1) - 1;
                const pcts = [0, 100 / 4.3, 200 / 4.3, 300 / 4.3, 400 / 4.3, 100];
                const pct = pcts[i] ?? 0;
                const isFirst = i === 0;
                const isLast = i === last;
                const [main, sub] = label.split(" · ");
                return (
                  <span
                    key={label}
                    className={`absolute top-0 leading-tight ${isFirst ? "left-0" : isLast ? "right-0 text-right" : ""}`}
                    style={
                      !isFirst && !isLast
                        ? { left: `${pct}%`, transform: "translateX(-50%)" }
                        : undefined
                    }
                  >
                    {main}
                    {sub ? (
                      <>
                        <br />
                        {sub}
                      </>
                    ) : null}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {content.stats.map((stat, index) => (
            <RaceInfoCard
              key={stat.title}
              icon={profileIcons[index] ?? Route}
              title={stat.title}
              description={stat.description}
              className="sm:block"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
