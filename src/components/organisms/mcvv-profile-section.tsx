import { Footprints, Mountain, Route, Timer, Trees } from "lucide-react";

import { RaceInfoCard, SectionHeader } from "@/components/molecules";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

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
          description={content.description}
          className="lg:grid lg:grid-cols-[1fr_21rem] lg:items-end"
          titleClassName="max-w-3xl"
        />

        <div className="mt-10 border border-race-line/60 bg-race-forest p-4 sm:p-6">
          <div className="relative aspect-[1.45/1] w-full overflow-hidden sm:aspect-[3.45/1]">
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
              <path
                d="M24 274 C110 268 130 150 206 158 C262 164 288 72 352 96 C422 122 448 248 518 206 C572 174 594 92 664 112 C738 136 760 236 842 218 C918 202 940 82 1012 108 C1084 132 1094 260 1176 248 L1176 306 L24 306 Z"
                fill="url(#profileFill)"
              />
              <path
                d="M24 274 C110 268 130 150 206 158 C262 164 288 72 352 96 C422 122 448 248 518 206 C572 174 594 92 664 112 C738 136 760 236 842 218 C918 202 940 82 1012 108 C1084 132 1094 260 1176 248"
                fill="none"
                stroke="oklch(0.68 0.205 39)"
                strokeLinecap="round"
                strokeWidth="8"
              />
              {[206, 352, 664, 1012].map((x, index) => (
                <g key={x}>
                  <circle
                    cx={x}
                    cy={[158, 96, 112, 108][index]}
                    r="19"
                    fill="oklch(0.68 0.205 39)"
                  />
                  <text
                    x={x}
                    y={[164, 102, 118, 114][index]}
                    textAnchor="middle"
                    fontSize="16"
                    fontWeight="700"
                    fill="white"
                  >
                    {content.points[index]}
                  </text>
                </g>
              ))}
              <line
                x1="24"
                x2="1176"
                y1="306"
                y2="306"
                stroke="oklch(0.38 0.06 150)"
                strokeWidth="2"
              />
            </svg>
          </div>
          <div className="mt-4 grid grid-cols-5 gap-2 text-xs font-medium text-race-dim">
            {content.axis.map((label) => (
              <span key={label}>{label}</span>
            ))}
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
