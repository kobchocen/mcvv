import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { ClubNameLink, StatsNav, type StatsNavItem } from "@/components/molecules";
import { McvvPublicNavbar } from "@/components/organisms";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";
import { Link } from "@/i18n/routing";
import type { Duel, Performance, StatsOverview } from "@/lib/stats/overview";
import { cn, formatRaceTime } from "@/lib/utils";

/** All copy is resolved by the page (ICU plurals, number formatting). */
export type McvvStatsOverviewCopy = {
  eyebrow: string;
  title: string;
  lead: string;
  counters: { value: string; unit?: string; label: string; sub: string }[];
  top: string;
  men: string;
  women: string;
  more: Record<"records" | "wins" | "photos" | "winners" | "attendance" | "ages" | "times", string>;
  records: { title: string; sameYear: string | null };
  wins: { title: string };
  photos: { title: string; total: string };
  closest: { title: string };
  margin: { title: string };
  vs: string;
  prs: { title: string; big: string; unit: string; best: string | null };
  ages: {
    title: string;
    oldest: string;
    youngest: string;
    oldestUnit: string;
    youngestUnit: string;
    note: string;
  };
  recordEdition: { title: string; unit: string };
  womenTile: { title: string; value: string; unit: string; axis: [string, string, string] };
  clubs: { title: string };
  together: { title: string; value: string; unit: string; note: string };
  moment: { title: string; headline: string; body: string } | null;
  footnote: string;
  gap: (seconds: number) => string;
  winsCount: (count: number) => string;
  yearRange: (from: number, to: number) => string;
  number: (value: number) => string;
};

export type McvvStatsOverviewProps = {
  brand: McvvHomepageContent["brand"];
  nav: McvvHomepageContent["nav"];
  data: StatsOverview;
  copy: McvvStatsOverviewCopy;
  statsNav: { items: StatsNavItem[]; current: string; ariaLabel: string };
};

function RunnerLink({ id, name, className }: { id: string; name: string; className?: string }) {
  return (
    <Link
      href={{ pathname: "/bezec/[id]", params: { id } }}
      className={cn(
        // Same look as RunnerNameLink on the detail stats pages.
        "font-semibold text-race-accent underline-offset-2 hover:underline",
        className,
      )}
    >
      {name}
    </Link>
  );
}

function Tile({
  title,
  children,
  more,
  className,
}: {
  title: string;
  children: ReactNode;
  more?: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-race-line/70 bg-race-surface p-4 sm:p-5",
        className,
      )}
    >
      <h3 className="font-display text-[15px] font-semibold uppercase tracking-[0.08em] text-race-accent">
        {title}
      </h3>
      {children}
      {more ? <div className="mt-auto pt-1">{more}</div> : null}
    </article>
  );
}

function MoreLink({
  href,
  label,
}: {
  href: "/fotogalerie" | { pathname: "/statistiky/[slug]"; params: { slug: string } };
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-[0.1em] text-race-accent hover:underline"
    >
      {label}
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}

const statHref = (slug: string) => ({ pathname: "/statistiky/[slug]" as const, params: { slug } });

function Duo({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5">{children}</div>;
}

function DuoCell({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-race-forest p-3 dark:bg-race-deep/70">{children}</div>
  );
}

const metaClass = "text-[13px] leading-5 text-race-muted";
const bigClass = "font-display text-3xl font-bold leading-none text-foreground dark:text-white";

function PerfCell({ label, perf }: { label: string; perf: Performance | null }) {
  return (
    <DuoCell>
      <div className={metaClass}>{perf ? `${label} · ${perf.year}` : label}</div>
      <div className={cn(bigClass, "mt-1")}>{perf ? formatRaceTime(perf.time) : "—"}</div>
      {perf ? (
        <RunnerLink id={perf.runnerId} name={perf.name} className="mt-1 block truncate" />
      ) : null}
    </DuoCell>
  );
}

function RankedList({
  rows,
}: {
  rows: { rank: number; name: string; value: string; runnerId?: string; clubSlug?: string }[];
}) {
  return (
    <ol className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <li
          key={`${row.rank}-${row.runnerId ?? row.name}`}
          className="flex items-baseline justify-between gap-3 border-b border-dashed border-race-line/60 pb-1.5 text-sm"
        >
          <span className="min-w-0 truncate">
            <span className="inline-block w-5 text-race-dim">{row.rank}</span>
            {row.runnerId ? (
              <RunnerLink id={row.runnerId} name={row.name} className="font-medium" />
            ) : row.clubSlug ? (
              <ClubNameLink
                slug={row.clubSlug}
                name={row.name}
                className="font-medium text-race-accent underline-offset-2 hover:underline"
              />
            ) : (
              row.name
            )}
          </span>
          <b className="shrink-0 font-display text-base">{row.value}</b>
        </li>
      ))}
    </ol>
  );
}

function DuelBlock({
  duel,
  label,
  copy,
  primary,
}: {
  duel: Duel | null;
  label: string;
  copy: McvvStatsOverviewCopy;
  primary: boolean;
}) {
  if (!duel) {
    return null;
  }
  return primary ? (
    <div>
      <div className={bigClass}>
        {copy.gap(duel.gap)}{" "}
        <small className="font-sans text-sm font-medium normal-case text-race-muted">
          {label} · {duel.year}
        </small>
      </div>
      <p className={cn(metaClass, "mt-2")}>
        <RunnerLink id={duel.first.runnerId} name={duel.first.name} />{" "}
        {formatRaceTime(duel.first.time)} {copy.vs}{" "}
        <RunnerLink id={duel.second.runnerId} name={duel.second.name} className="font-medium" />{" "}
        {formatRaceTime(duel.second.time)}
      </p>
    </div>
  ) : (
    <p className={metaClass}>
      {label}: {copy.gap(duel.gap)} · {duel.year} –{" "}
      <RunnerLink id={duel.first.runnerId} name={duel.first.name} className="font-medium" />{" "}
      {formatRaceTime(duel.first.time)} {copy.vs}{" "}
      <RunnerLink id={duel.second.runnerId} name={duel.second.name} className="font-medium" />{" "}
      {formatRaceTime(duel.second.time)}
    </p>
  );
}

/** Pick the sex with the more striking duel as the headline (closest: smaller gap). */
function duelOrder(men: Duel | null, women: Duel | null, smaller: boolean): ("M" | "F")[] {
  if (!men) return ["F", "M"];
  if (!women) return ["M", "F"];
  const menFirst = smaller ? men.gap <= women.gap : men.gap >= women.gap;
  return menFirst ? ["M", "F"] : ["F", "M"];
}

export function McvvStatsOverview({ brand, nav, data, copy, statsNav }: McvvStatsOverviewProps) {
  const maxBar = data.recordEdition?.bars.reduce((max, bar) => Math.max(max, bar.count), 0) ?? 0;
  const maxShare = data.women.trend.reduce((max, point) => Math.max(max, point.share), 0);
  const trendPoints = data.women.trend
    .map((point, index, all) => {
      const x = all.length > 1 ? (index / (all.length - 1)) * 300 : 150;
      const y = maxShare ? 66 - (point.share / maxShare) * 60 : 66;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const sexLabel = (sex: "M" | "F") => (sex === "M" ? copy.men : copy.women);
  const closestOrder = duelOrder(data.closestFinish.M, data.closestFinish.F, true);
  const marginOrder = duelOrder(data.largestMargin.M, data.largestMargin.F, false);

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvPublicNavbar content={{ brand, nav }} variant="solid" />
      <div className="px-4 pb-16 pt-10 sm:px-6 lg:px-8 lg:pt-16">
        <div className="mx-auto max-w-6xl">
          <header>
            <div className="flex items-center gap-3">
              <span className="h-0.5 w-7 bg-race-accent" />
              <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent">
                {copy.eyebrow}
              </p>
            </div>
            <h1 className="mt-4 font-display text-4xl font-bold uppercase leading-[1.05] text-foreground dark:text-white sm:text-5xl lg:text-6xl">
              {copy.title}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-race-muted">{copy.lead}</p>
          </header>

          <StatsNav {...statsNav} sticky />

          <section
            aria-label={copy.title}
            className="mt-6 grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3"
          >
            {copy.counters.map((counter) => (
              <div
                key={counter.label}
                className="rounded-2xl border border-race-line/70 bg-gradient-to-br from-race-forest-2/70 to-race-surface px-3.5 py-4 dark:from-race-forest-2 dark:to-race-forest"
              >
                <div className="font-display text-[34px] font-bold leading-none text-foreground tabular-nums dark:text-white md:text-[46px]">
                  {counter.value}
                  {counter.unit ? (
                    <small className="ml-1 text-lg text-race-accent">{counter.unit}</small>
                  ) : null}
                </div>
                <div className="mt-1.5 font-display text-xs font-medium uppercase tracking-[0.1em] text-race-muted">
                  {counter.label}
                </div>
                <div className="mt-0.5 text-xs text-race-dim">{counter.sub}</div>
              </div>
            ))}
          </section>

          <h2 className="mb-3 mt-8 flex items-center gap-3 font-display text-[22px] font-semibold uppercase text-foreground dark:text-white">
            {copy.top}
            <span className="h-px flex-1 bg-race-line/70" aria-hidden="true" />
          </h2>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Tile
              title={copy.records.title}
              more={<MoreLink href={statHref("rekordy")} label={copy.more.records} />}
            >
              <Duo>
                <PerfCell label={copy.men} perf={data.courseRecords.M} />
                <PerfCell label={copy.women} perf={data.courseRecords.F} />
              </Duo>
              {copy.records.sameYear ? <p className={metaClass}>{copy.records.sameYear}</p> : null}
            </Tile>

            <Tile
              title={copy.wins.title}
              more={<MoreLink href={statHref("vitezove")} label={copy.more.wins} />}
            >
              <Duo>
                {(["F", "M"] as const).map((sex) => {
                  const leader = data.mostWins[sex];
                  return (
                    <DuoCell key={sex}>
                      <div className={metaClass}>{sexLabel(sex)}</div>
                      <div className={cn(bigClass, "mt-1")}>
                        {leader ? copy.winsCount(leader.count) : "—"}
                      </div>
                      {leader?.runners.map((runner) => (
                        <div key={runner.runnerId} className="mt-1">
                          <RunnerLink
                            id={runner.runnerId}
                            name={runner.name}
                            className="block truncate"
                          />
                          {leader.runners.length === 1 && runner.firstYear !== runner.lastYear ? (
                            <div className={metaClass}>
                              {copy.yearRange(runner.firstYear, runner.lastYear)}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </DuoCell>
                  );
                })}
              </Duo>
            </Tile>

            <Tile
              title={copy.photos.title}
              more={<MoreLink href="/fotogalerie" label={copy.more.photos} />}
            >
              <RankedList
                rows={data.photos.leaders.map((row) => ({
                  rank: row.rank,
                  name: row.name,
                  runnerId: row.runnerId,
                  value: copy.number(row.value),
                }))}
              />
              <p className={metaClass}>{copy.photos.total}</p>
            </Tile>

            <Tile
              title={copy.closest.title}
              more={<MoreLink href={statHref("vitezove")} label={copy.more.winners} />}
            >
              {closestOrder.map((sex, index) => (
                <DuelBlock
                  key={sex}
                  duel={data.closestFinish[sex]}
                  label={sexLabel(sex)}
                  copy={copy}
                  primary={index === 0}
                />
              ))}
            </Tile>

            <Tile
              title={copy.margin.title}
              more={<MoreLink href={statHref("vitezove")} label={copy.more.winners} />}
            >
              {marginOrder.map((sex, index) => (
                <DuelBlock
                  key={sex}
                  duel={data.largestMargin[sex]}
                  label={sexLabel(sex)}
                  copy={copy}
                  primary={index === 0}
                />
              ))}
            </Tile>

            {data.personalRecords ? (
              <Tile
                title={copy.prs.title}
                more={<MoreLink href={statHref("ucast")} label={copy.more.attendance} />}
              >
                <div className={bigClass}>
                  {copy.prs.big}{" "}
                  <small className="font-sans text-sm font-medium normal-case text-race-muted">
                    {copy.prs.unit}
                  </small>
                </div>
                {data.personalRecords.best && copy.prs.best ? (
                  <p className={metaClass}>
                    <RunnerLink
                      id={data.personalRecords.best.runnerId}
                      name={data.personalRecords.best.name}
                    />{" "}
                    {copy.prs.best}
                  </p>
                ) : null}
              </Tile>
            ) : null}

            <Tile
              title={copy.ages.title}
              more={<MoreLink href={statHref("vek")} label={copy.more.ages} />}
            >
              <Duo>
                {(
                  [
                    [data.ageExtremes.oldest, copy.ages.oldest, copy.ages.oldestUnit],
                    [data.ageExtremes.youngest, copy.ages.youngest, copy.ages.youngestUnit],
                  ] as const
                ).map(([row, label, unit]) => (
                  <DuoCell key={label}>
                    <div className={metaClass}>{label}</div>
                    <div className={cn(bigClass, "mt-1")}>
                      {row ? row.age : "—"}{" "}
                      <small className="font-sans text-sm font-medium normal-case text-race-muted">
                        {unit}
                      </small>
                    </div>
                    {row ? (
                      <>
                        <RunnerLink
                          id={row.runnerId}
                          name={row.name}
                          className="mt-1 block truncate"
                        />
                        <div className={metaClass}>{formatRaceTime(row.time)}</div>
                      </>
                    ) : null}
                  </DuoCell>
                ))}
              </Duo>
              <p className="text-xs text-race-dim">{copy.ages.note}</p>
            </Tile>

            {data.recordEdition ? (
              <Tile
                title={copy.recordEdition.title}
                className="md:col-span-2"
                more={<MoreLink href={statHref("ucast")} label={copy.more.attendance} />}
              >
                <div className={bigClass}>
                  {copy.number(data.recordEdition.count)}{" "}
                  <small className="font-sans text-sm font-medium normal-case text-race-muted">
                    {copy.recordEdition.unit}
                  </small>
                </div>
                <div
                  className="flex h-[70px] items-end gap-[2px]"
                  role="img"
                  aria-label={copy.recordEdition.title}
                >
                  {data.recordEdition.bars.map((bar) => (
                    <div
                      key={bar.year}
                      title={`${bar.year}: ${bar.count}`}
                      className={cn(
                        "min-w-0 flex-1 rounded-t-[2px]",
                        bar.year === data.recordEdition?.year
                          ? "bg-race-accent"
                          : "bg-race-line dark:bg-race-forest-2",
                      )}
                      style={{ height: maxBar ? `${Math.max(2, (bar.count / maxBar) * 100)}%` : 0 }}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-[11px] text-race-dim">
                  <span>{data.firstYear}</span>
                  <span>
                    {
                      data.recordEdition.bars[Math.floor((data.recordEdition.bars.length - 1) / 2)]
                        ?.year
                    }
                  </span>
                  <span>{data.lastYear}</span>
                </div>
              </Tile>
            ) : null}

            <Tile
              title={copy.womenTile.title}
              more={<MoreLink href={statHref("ucast")} label={copy.more.attendance} />}
            >
              <div className={bigClass}>
                {copy.womenTile.value}{" "}
                <small className="font-sans text-sm font-medium normal-case text-race-muted">
                  {copy.womenTile.unit}
                </small>
              </div>
              <svg
                viewBox="0 0 300 70"
                preserveAspectRatio="none"
                className="h-[70px] w-full"
                aria-hidden="true"
              >
                <polyline
                  points={trendPoints}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                  className="text-race-accent"
                />
              </svg>
              <div className="flex justify-between gap-2 text-[11px] text-race-dim">
                {copy.womenTile.axis.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            </Tile>

            {data.clubs.length > 0 ? (
              <Tile title={copy.clubs.title}>
                <RankedList
                  rows={data.clubs.map((club, index) => ({
                    rank: index + 1,
                    name: club.name,
                    clubSlug: club.slug,
                    value: `≈${copy.number(club.starts)}`,
                  }))}
                />
              </Tile>
            ) : null}

            <Tile
              title={copy.together.title}
              more={<MoreLink href={statHref("casy")} label={copy.more.times} />}
            >
              <div className={bigClass}>
                {copy.together.value}{" "}
                <small className="font-sans text-sm font-medium normal-case text-race-muted">
                  {copy.together.unit}
                </small>
              </div>
              <p className={metaClass}>{copy.together.note}</p>
            </Tile>
          </section>

          {copy.moment ? (
            <section className="relative mt-3 rounded-2xl border border-race-line/70 bg-[radial-gradient(120%_140%_at_0%_0%,var(--race-forest-2)_0%,var(--race-surface)_55%)] p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="h-0.5 w-7 bg-race-accent" />
                <h2 className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent">
                  {copy.moment.title}
                </h2>
              </div>
              <p className="my-2.5 font-display text-[22px] font-semibold uppercase leading-tight text-foreground dark:text-white">
                {copy.moment.headline}
              </p>
              {copy.moment.body ? (
                <p className="whitespace-pre-line text-sm leading-6 text-race-muted">
                  {copy.moment.body}
                </p>
              ) : null}
            </section>
          ) : null}

          <p className="mt-8 text-xs leading-5 text-race-dim">{copy.footnote}</p>
        </div>
      </div>
    </main>
  );
}
