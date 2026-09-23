import {
  AlertTriangle,
  Calendar,
  ClipboardList,
  Flag,
  Globe,
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
import { McvvNavbar } from "@/components/organisms";
import { Link } from "@/i18n/routing";
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
          className="grid grid-cols-[2rem_1fr] items-center rounded-lg px-2.5 py-2 text-sm text-white/78 transition-colors hover:bg-race-accent/10 hover:text-white"
        >
          <span className="text-race-dim">{String(index + 1).padStart(2, "0")}</span>
          <span>{content.sections[id].title}</span>
        </a>
      ))}
    </nav>
  );
}

export type McvvProgramTemplateProps = McvvProgramView;

export function McvvProgramTemplate({
  content,
  editionId,
  feeRows,
  feeRefund,
  prizeAdult,
  prizeVeterans,
  categories,
  infoWww,
  contactHref,
  contactLabel,
  mapHref,
}: McvvProgramTemplateProps) {
  return (
    <main id="top" className="min-h-screen bg-race-deep text-foreground">
      <McvvNavbar content={content} variant="solid" />
      <div className="bg-race-forest">
        <section className="px-4 py-10 sm:px-6 lg:px-8 lg:py-[60px]">
          <div className="mx-auto grid max-w-7xl gap-5">
            <div className="flex items-center gap-3">
              <span className="h-0.5 w-7 bg-race-accent" />
              <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent sm:text-sm">
                {content.header.eyebrow}
              </p>
            </div>
            <h1 className="font-display text-5xl font-bold leading-none tracking-normal text-white sm:text-6xl lg:text-[66px]">
              {content.header.title}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-white/84 sm:text-lg sm:leading-8">
              {content.header.lead.replace("{n}", String(editionId))}
            </p>
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
                    <h2 className="font-display text-2xl font-semibold leading-tight text-white">
                      {section.title}
                    </h2>
                  </div>
                  <div className="grid gap-3">
                    <p className="text-base font-semibold leading-7 text-white">
                      {section.summary}
                    </p>
                    {section.body ? (
                      <p className="max-w-3xl text-sm leading-7 text-race-muted sm:text-base">
                        {section.body}
                      </p>
                    ) : null}

                    {id === "venue" ? (
                      <p className="text-sm leading-7 text-race-muted sm:text-base">
                        <a
                          href={mapHref}
                          className="font-medium text-race-accent underline-offset-2 hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {content.gpsLabel}
                        </a>
                      </p>
                    ) : null}

                    {id === "registration" ? (
                      <p>
                        <Link
                          href="/prihlasky"
                          className="font-medium text-race-accent underline-offset-2 hover:underline"
                        >
                          {content.onlineEntry}
                        </Link>
                      </p>
                    ) : null}

                    {id === "fees" ? (
                      <>
                        <dl className="mt-1 grid gap-2 sm:grid-cols-2">
                          {feeRows.map((row) => (
                            <div
                              key={row.label}
                              className="border border-race-line/55 bg-race-surface px-4 py-3"
                            >
                              <dt className="text-xs font-semibold uppercase tracking-wide text-race-dim">
                                {row.label}
                              </dt>
                              <dd className="mt-1 font-display text-xl font-semibold text-white">
                                {row.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <p className="text-sm leading-7 text-race-muted sm:text-base">
                          {feeRefund}
                        </p>
                        <p className="text-sm leading-7 text-race-muted sm:text-base">
                          {content.fees.freeEntry}
                        </p>
                      </>
                    ) : null}

                    {id === "categories" ? (
                      categories.length === 0 ? (
                        <p className="text-sm leading-7 text-race-muted">
                          {content.emptyCategories}
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[22rem] border-collapse text-left text-sm">
                            <thead>
                              <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                                <th className="py-2 pr-4">{content.categories.name}</th>
                                <th className="py-2">{content.categories.birthYear}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {categories.map((row) => (
                                <tr key={row.id} className="border-b border-race-line/40">
                                  <td className="py-2.5 pr-4 font-medium text-white">{row.name}</td>
                                  <td className="py-2.5 text-race-muted">{row.birthYear}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    ) : null}

                    {id === "prizes" ? (
                      <>
                        <div className="grid gap-6 sm:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-race-dim">
                              {content.prizes.adult}
                            </p>
                            <ol className="mt-2 grid gap-1.5">
                              {prizeAdult.map((value, index) => (
                                <li key={`adult-${index}`} className="text-sm text-white">
                                  {content.prizes.place.replace("{n}", String(index + 1))}: {value}
                                </li>
                              ))}
                            </ol>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-race-dim">
                              {content.prizes.veterans}
                            </p>
                            <ol className="mt-2 grid gap-1.5">
                              {prizeVeterans.map((value, index) => (
                                <li key={`vet-${index}`} className="text-sm text-white">
                                  {content.prizes.place.replace("{n}", String(index + 1))}: {value}
                                </li>
                              ))}
                            </ol>
                          </div>
                        </div>
                        <p className="text-sm leading-7 text-race-muted sm:text-base">
                          {content.prizes.material}
                        </p>
                      </>
                    ) : null}

                    {id === "timetable" ? (
                      <ol className="grid gap-2">
                        <li className="text-sm leading-7 text-white sm:text-base">
                          {content.timetable.registration}
                        </li>
                        <li className="text-sm leading-7 text-white sm:text-base">
                          {content.timetable.start}
                        </li>
                        <li className="text-sm leading-7 text-white sm:text-base">
                          {content.timetable.ceremony}
                        </li>
                      </ol>
                    ) : null}

                    {id === "info" ? (
                      <ul className="grid gap-1 text-sm leading-7 text-race-muted sm:text-base">
                        {infoWww ? (
                          <li>
                            <a
                              href={infoWww.startsWith("http") ? infoWww : `https://${infoWww}`}
                              className="inline-flex items-center gap-2 text-race-accent hover:underline"
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Globe className="size-4" aria-hidden="true" />
                              {infoWww.replace(/^https?:\/\//, "")}
                            </a>
                          </li>
                        ) : null}
                        <li>
                          <Link href={contactHref} className="text-race-accent hover:underline">
                            {contactLabel}
                          </Link>
                        </li>
                      </ul>
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
