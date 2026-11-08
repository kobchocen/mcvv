import {
  AlertTriangle,
  Calendar,
  Car,
  ClipboardList,
  Flag,
  Hash,
  HeartPulse,
  MapPin,
  Megaphone,
  Route,
  Ruler,
  Shield,
  Tent,
  Timer,
  Trophy,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react";

import { BackToTop } from "@/components/molecules";
import { McvvPublicNavbar } from "@/components/organisms";
import {
  INSTRUCTION_SECTION_ORDER,
  type InstructionSectionId,
  type McvvInstructionsContent,
} from "@/components/templates/mcvv-instructions-content";
import { CourseMapLink, InstructionText } from "@/components/templates/mcvv-instructions-links";

const sectionIcons: Record<InstructionSectionId, LucideIcon> = {
  organizer: Users,
  race: Flag,
  date: Calendar,
  place: MapPin,
  parking: Car,
  distances: Ruler,
  office: ClipboardList,
  bib: Hash,
  start: Timer,
  course: Route,
  refreshments: Utensils,
  facilities: Tent,
  medical: HeartPulse,
  awards: Trophy,
  timetable: Calendar,
  privacy: Shield,
  notice: AlertTriangle,
  spectators: Megaphone,
};

function TocLinks({
  content,
  className,
}: {
  content: McvvInstructionsContent;
  className?: string;
}) {
  return (
    <nav className={className} aria-label={content.tocTitle}>
      {INSTRUCTION_SECTION_ORDER.map((id, index) => (
        <a
          key={id}
          href={`#${id}`}
          className="grid grid-cols-[2rem_1fr] items-center rounded-lg px-2.5 py-2 text-sm text-foreground/80 transition-colors hover:bg-race-accent/10 hover:text-foreground dark:text-white/78 dark:hover:text-white"
        >
          <span className="text-race-dim">{String(index + 1).padStart(2, "0")}</span>
          <span>{content.sections[id].title}</span>
        </a>
      ))}
    </nav>
  );
}

export type McvvInstructionsTemplateProps = {
  content: McvvInstructionsContent;
};

export function McvvInstructionsTemplate({ content }: McvvInstructionsTemplateProps) {
  return (
    <main id="top" className="min-h-screen bg-race-deep text-foreground">
      <McvvPublicNavbar content={content} variant="solid" />
      <div className="bg-race-forest">
        <section className="px-4 py-10 sm:px-6 lg:px-8 lg:py-[60px]">
          <div className="mx-auto grid max-w-7xl gap-5">
            <div className="flex items-center gap-3">
              <span className="h-0.5 w-7 bg-race-accent" />
              <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent sm:text-sm">
                {content.header.eyebrow}
              </p>
            </div>
            <h1 className="font-display text-5xl font-bold leading-none tracking-normal text-foreground dark:text-white sm:text-6xl lg:text-[66px]">
              {content.header.title}
            </h1>
          </div>
        </section>
      </div>

      <section className="px-4 py-10 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-14">
          <details className="rounded-2xl border border-race-line bg-race-surface p-4 lg:hidden">
            <summary className="cursor-pointer font-display text-xs font-semibold uppercase tracking-[0.12em] text-race-muted">
              {content.tocTitle}
            </summary>
            <TocLinks content={content} className="mt-3 grid gap-1" />
          </details>

          <aside className="hidden lg:block">
            <div className="sticky top-6 rounded-2xl border border-race-line bg-race-surface p-5">
              <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-race-muted">
                {content.tocTitle}
              </p>
              <TocLinks content={content} className="mt-4 grid gap-1" />
            </div>
          </aside>

          <div className="grid min-w-0 gap-0">
            {INSTRUCTION_SECTION_ORDER.map((id) => {
              const Icon = sectionIcons[id];
              const section = content.sections[id];
              return (
                <article
                  key={id}
                  id={id}
                  className="grid scroll-mt-8 gap-4 border-b border-race-line py-6 first:pt-0 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10 lg:py-9"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-[11px] bg-race-accent/10 text-race-accent">
                      <Icon className="size-[21px]" aria-hidden="true" />
                    </span>
                    <h2 className="font-display text-2xl font-semibold leading-tight text-foreground dark:text-white">
                      {section.title}
                    </h2>
                  </div>
                  <div className="grid min-w-0 gap-3">
                    {section.paragraphs.map((paragraph, index) => (
                      <p
                        key={`${id}-p-${index}`}
                        className="max-w-3xl text-sm leading-7 text-race-muted sm:text-base"
                      >
                        <InstructionText text={paragraph} />
                      </p>
                    ))}
                    {section.items.length > 0 ? (
                      <ul
                        className={
                          id === "office" ? "grid list-disc gap-1.5 pl-5" : "grid list-none gap-1.5"
                        }
                      >
                        {section.items.map((item, index) => (
                          <li
                            key={`${id}-i-${index}`}
                            className="text-sm leading-7 text-foreground dark:text-white sm:text-base"
                          >
                            <InstructionText text={item} />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {id === "course" ? (
                      <p className="text-sm leading-7 sm:text-base">
                        <CourseMapLink label={content.mapAlt} />
                      </p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <BackToTop label={content.backToTop} />
    </main>
  );
}
