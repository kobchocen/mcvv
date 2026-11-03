import {
  AlertTriangle,
  Calendar,
  ClipboardList,
  Flag,
  Info,
  MapPin,
  Route,
  Shield,
  Timer,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { BackToTop } from "@/components/molecules";
import { McvvPublicNavbar } from "@/components/organisms";
import { Link } from "@/i18n/routing";
import { splitRozpisMarkup } from "@/lib/race/rozpis-text";
import {
  PROGRAM_SECTION_ORDER,
  type McvvProgramView,
  type ProgramSectionId,
} from "@/components/templates/mcvv-program-content";

const sectionIcons: Record<ProgramSectionId, LucideIcon> = {
  intro: Flag,
  date: Calendar,
  venue: MapPin,
  organizer: Users,
  course: Route,
  registration: ClipboardList,
  fees: Wallet,
  categories: Users,
  prizes: Trophy,
  start: Timer,
  timetable: Calendar,
  privacy: Shield,
  notice: AlertTriangle,
  info: Info,
};

function TocLinks({
  content,
  className,
}: {
  content: McvvProgramView["content"];
  className?: string;
}) {
  return (
    <nav className={className} aria-label={content.tocTitle}>
      {PROGRAM_SECTION_ORDER.map((id, index) => (
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

const ZHL_HREF = "http://vco-ob.cz/index_zh.php";

const linkClass = "font-medium text-race-accent underline-offset-2 hover:underline";

/** Odkazy v textu Rozpisu – stejné cíle jako legacy `rozpis.php`. */
function RozpisLink({ tag, text, infoWww }: { tag: string; text: string; infoWww: string }) {
  switch (tag) {
    case "online":
      return (
        <Link href="/prihlasky" className={linkClass}>
          {text}
        </Link>
      );
    case "gps":
      return (
        <Link href="/kontakt" className={linkClass}>
          {text}
        </Link>
      );
    case "vitezove":
    case "veterani":
      return (
        <Link
          href={{ pathname: "/statistiky/[slug]", params: { slug: tag } }}
          className={linkClass}
        >
          {text}
        </Link>
      );
    case "zhl":
      return (
        <a href={ZHL_HREF} className={linkClass} target="_blank" rel="noreferrer">
          {text}
        </a>
      );
    case "www":
      return (
        <a
          href={infoWww.startsWith("http") ? infoWww : `https://${infoWww}`}
          className={linkClass}
          target="_blank"
          rel="noreferrer"
        >
          {text}
        </a>
      );
    default:
      return <>{text}</>;
  }
}

function RozpisText({ text, infoWww }: { text: string; infoWww: string }) {
  const lines = text.split("\n");
  return (
    <p className="max-w-3xl text-base leading-7 text-foreground dark:text-white/88">
      {lines.map((line, lineIndex) => (
        <span key={lineIndex}>
          {lineIndex > 0 ? <br /> : null}
          {splitRozpisMarkup(line).map((segment, index) =>
            segment.tag ? (
              <RozpisLink key={index} tag={segment.tag} text={segment.text} infoWww={infoWww} />
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )}
        </span>
      ))}
    </p>
  );
}

export type McvvProgramTemplateProps = McvvProgramView;

export function McvvProgramTemplate({ content, categories, infoWww }: McvvProgramTemplateProps) {
  return (
    <main id="top" className="min-h-screen bg-race-deep text-foreground">
      <McvvPublicNavbar content={content} variant="solid" />
      <div className="bg-race-forest">
        <section className="px-4 py-10 sm:px-6 lg:px-8 lg:py-[60px]">
          <div className="mx-auto grid max-w-7xl gap-5">
            <h1 className="font-display text-5xl font-bold leading-none tracking-normal text-foreground dark:text-white sm:text-6xl lg:text-[66px]">
              {content.header.title}
            </h1>
          </div>
        </section>
      </div>

      <section className="px-4 py-10 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[280px_1fr] lg:gap-14">
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

          <div className="grid gap-0">
            {PROGRAM_SECTION_ORDER.map((id) => {
              const Icon = sectionIcons[id];
              const section = content.sections[id];

              return (
                <article
                  key={id}
                  id={id}
                  className="grid scroll-mt-8 gap-4 border-b border-race-line py-6 first:pt-0 lg:grid-cols-[220px_1fr] lg:gap-10 lg:py-9"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-[11px] bg-race-accent/10 text-race-accent">
                      <Icon className="size-[21px]" aria-hidden="true" />
                    </span>
                    <h2 className="font-display text-2xl font-semibold leading-tight text-foreground dark:text-white">
                      {section.title}
                    </h2>
                  </div>
                  <div className="grid gap-3 lg:pt-2">
                    {section.body ? <RozpisText text={section.body} infoWww={infoWww} /> : null}

                    {id === "categories" ? (
                      categories.length === 0 ? (
                        <p className="text-sm leading-7 text-race-muted">
                          {content.emptyCategories}
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[20rem] border-collapse text-left text-base">
                            <tbody>
                              {categories.map((row) => (
                                <tr key={row.id} className="border-b border-race-line/40">
                                  <td className="py-2 pr-4 font-semibold text-foreground dark:text-white">
                                    {row.name}
                                  </td>
                                  <td className="py-2 text-foreground/85 dark:text-white/80">
                                    {row.birthYear}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
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
