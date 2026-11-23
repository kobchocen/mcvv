import type { ReactNode } from "react";
import { ClubLink } from "@/components/molecules";
import { McvvPublicNavbar } from "@/components/organisms";
import { Link } from "@/i18n/routing";
import type { ClubInsights } from "@/lib/clubs/insights";
import { cn } from "@/lib/utils";

import type { McvvHomepageContent } from "./mcvv-homepage-content";

type CopyFn = (key: string, values?: Record<string, string | number>) => string;

export type McvvClubsHubCopy = {
  eyebrow: string;
  title: string;
  intro: string;
  lead: string;
  unlinkedNote: string;
  navLabel: string;
  toList: string;
  men: string;
  women: string;
  wins: string;
  podiums: string;
  empty: string;
  medalsNote: string;
  startListNote: string;
  streaksTitle: string;
  streaksLead: string;
  streaksCol: string;
  editions: string;
  starts: string;
  years: string;
  loyalTitle: string;
  loyalLead: string;
  loyalMissed: string;
  expeditionsTitle: string;
  expeditionsLead: string;
  expeditionsMax: string;
  expeditionsAll: string;
  colYear: string;
  colSize: string;
  newcomersTitle: string;
  newcomersLead: string;
  newcomersHeading: string;
  returnsHeading: string;
  returnsGap: string;
  returnsLast: string;
  yearsCount: (count: number) => string;
  medalsTitle: string;
  medalsLead: string;
  smallTitle: string;
  smallLead: string;
  winRate: string;
  podiumRate: string;
  veteransTitle: string;
  veteransLead: string;
  veteransCount: string;
  veteransExamples: string;
  veteransAll: string;
  jubileesTitle: string;
  jubileeNth: (n: number) => string;
  counters: { value: string; label: string; sub?: string }[];
  t: CopyFn;
};

const TOP = 12;

export function McvvClubsHub({
  brand,
  nav,
  data,
  copy,
}: {
  brand: McvvHomepageContent["brand"];
  nav: McvvHomepageContent["nav"];
  data: ClubInsights;
  copy: McvvClubsHubCopy;
}) {
  const views = [
    { slug: "", label: copy.t("viewOverview"), href: "/kluby" as const },
    { slug: "snury", label: copy.t("viewStreaks") },
    { slug: "vernost", label: copy.t("viewLoyal") },
    { slug: "vypravy", label: copy.t("viewExpeditions") },
    { slug: "novacci", label: copy.t("viewNewcomers") },
    { slug: "medaile", label: copy.t("viewMedals") },
    { slug: "male-kluby", label: copy.t("viewSmall") },
    { slug: "veterani", label: copy.t("viewVeterans") },
    { slug: "seznam", label: copy.t("viewList"), href: "/kluby/seznam" as const },
  ];

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvPublicNavbar content={{ brand, nav }} variant="solid" />
      <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center gap-3">
            <span className="h-0.5 w-7 bg-race-accent" />
            <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent">
              {copy.eyebrow}
            </p>
          </div>
          <h1 className="mt-5 font-display text-4xl font-bold text-foreground dark:text-white sm:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-4 max-w-3xl text-race-muted">{copy.intro}</p>
          <p className="mt-2 max-w-3xl text-sm text-race-muted">{copy.lead}</p>
          {data.unlinkedStarts > 0 ? (
            <p className="mt-2 text-sm text-race-dim">{copy.unlinkedNote}</p>
          ) : null}

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {copy.counters.map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-race-line/70 bg-race-surface/60 px-4 py-4"
              >
                <p className="font-display text-3xl font-bold text-foreground dark:text-white">
                  {item.value}
                </p>
                <p className="mt-1 text-sm font-semibold text-race-muted">{item.label}</p>
                {item.sub ? <p className="mt-1 text-xs text-race-dim">{item.sub}</p> : null}
              </div>
            ))}
          </div>

          <ClubsViewsNav items={views} ariaLabel={copy.navLabel} />

          <p className="mt-6">
            <Link
              href="/kluby/seznam"
              className="inline-flex h-10 items-center rounded-full bg-race-accent-solid px-5 font-display text-sm font-semibold text-white"
            >
              {copy.toList}
            </Link>
          </p>

          <Section id="snury" title={copy.streaksTitle} lead={copy.streaksLead}>
            <Table>
              <thead>
                <tr className={headRow}>
                  <Th>#</Th>
                  <Th>{copy.t("club")}</Th>
                  <Th right>{copy.streaksCol}</Th>
                  <Th right>{copy.years}</Th>
                  <Th right>{copy.editions}</Th>
                  <Th right>{copy.starts}</Th>
                </tr>
              </thead>
              <tbody>
                {data.streaks.slice(0, TOP).map((row, index) => (
                  <tr key={row.id} className={bodyRow}>
                    <Td>{index + 1}</Td>
                    <Td>
                      <ClubName slug={row.slug} name={row.name} />
                    </Td>
                    <Td right>
                      <strong>{row.length}</strong>
                    </Td>
                    <Td right muted>
                      {row.from}–{row.to}
                    </Td>
                    <Td right>{row.editions}</Td>
                    <Td right>{row.starts}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>

          <Section id="vernost" title={copy.loyalTitle} lead={copy.loyalLead}>
            <Table>
              <thead>
                <tr className={headRow}>
                  <Th>#</Th>
                  <Th>{copy.t("club")}</Th>
                  <Th right>{copy.editions}</Th>
                  <Th right>{copy.years}</Th>
                  <Th right>{copy.streaksCol}</Th>
                  <Th right>{copy.loyalMissed}</Th>
                  <Th right>{copy.starts}</Th>
                </tr>
              </thead>
              <tbody>
                {data.loyal.slice(0, TOP).map((row, index) => (
                  <tr key={row.id} className={bodyRow}>
                    <Td>{index + 1}</Td>
                    <Td>
                      <ClubName slug={row.slug} name={row.name} />
                    </Td>
                    <Td right>
                      <strong>{row.editions}</strong>
                    </Td>
                    <Td right muted>
                      {row.firstYear}–{row.lastYear}
                    </Td>
                    <Td right>{row.streak}</Td>
                    <Td right>{row.missed}</Td>
                    <Td right>{row.starts}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>

          <Section id="vypravy" title={copy.expeditionsTitle} lead={copy.expeditionsLead}>
            <p className="mb-4 text-sm text-race-dim">{copy.startListNote}</p>
            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-race-accent">
                  {copy.expeditionsMax}
                </h3>
                <Table>
                  <thead>
                    <tr className={headRow}>
                      <Th>{copy.t("club")}</Th>
                      <Th right>{copy.colSize}</Th>
                      <Th right>{copy.colYear}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expeditionMax.slice(0, TOP).map((row) => (
                      <tr key={row.id} className={bodyRow}>
                        <Td>
                          <ClubName slug={row.slug} name={row.name} />
                        </Td>
                        <Td right>
                          <strong>{row.size}</strong>
                        </Td>
                        <Td right muted>
                          {row.year}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              <div>
                <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-race-accent">
                  {copy.expeditionsAll}
                </h3>
                <Table>
                  <thead>
                    <tr className={headRow}>
                      <Th>{copy.t("club")}</Th>
                      <Th right>{copy.colSize}</Th>
                      <Th right>{copy.colYear}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expeditions.slice(0, TOP).map((row) => (
                      <tr key={`${row.id}-${row.year}`} className={bodyRow}>
                        <Td>
                          <ClubName slug={row.slug} name={row.name} />
                        </Td>
                        <Td right>
                          <strong>{row.size}</strong>
                        </Td>
                        <Td right muted>
                          {row.year}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </div>
          </Section>

          <Section id="novacci" title={copy.newcomersTitle} lead={copy.newcomersLead}>
            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-race-accent">
                  {copy.newcomersHeading}
                </h3>
                {data.newcomers.length === 0 ? (
                  <p className="text-sm text-race-muted">{copy.empty}</p>
                ) : (
                  <Table>
                    <thead>
                      <tr className={headRow}>
                        <Th>{copy.t("club")}</Th>
                        <Th right>{copy.starts}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.newcomers.slice(0, TOP).map((row) => (
                        <tr key={row.id} className={bodyRow}>
                          <Td>
                            <ClubName slug={row.slug} name={row.name} />
                          </Td>
                          <Td right>{row.starts}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </div>
              <div>
                <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-race-accent">
                  {copy.returnsHeading}
                </h3>
                {data.returns.length === 0 ? (
                  <p className="text-sm text-race-muted">{copy.empty}</p>
                ) : (
                  <Table>
                    <thead>
                      <tr className={headRow}>
                        <Th>{copy.t("club")}</Th>
                        <Th right>{copy.returnsLast}</Th>
                        <Th right>{copy.returnsGap}</Th>
                        <Th right>{copy.colSize}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.returns.slice(0, TOP).map((row) => (
                        <tr key={row.id} className={bodyRow}>
                          <Td>
                            <ClubName slug={row.slug} name={row.name} />
                          </Td>
                          <Td right muted>
                            {row.lastBefore}
                          </Td>
                          <Td right>{copy.yearsCount(row.gap)}</Td>
                          <Td right>{row.starts}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </div>
            </div>
          </Section>

          <Section id="medaile" title={copy.medalsTitle} lead={copy.medalsLead}>
            <p className="mb-4 text-sm text-race-dim">{copy.medalsNote}</p>
            <div className="grid gap-8 lg:grid-cols-2">
              <MedalTable
                title={copy.men}
                rows={data.medals
                  .map((row) => ({ ...row, wins: row.winsM, podiums: row.podiumsM }))
                  .filter((row) => row.wins > 0 || row.podiums > 0)
                  .sort((a, b) => b.wins - a.wins || b.podiums - a.podiums)
                  .slice(0, TOP)}
                copy={copy}
              />
              <MedalTable
                title={copy.women}
                rows={data.medals
                  .map((row) => ({ ...row, wins: row.winsF, podiums: row.podiumsF }))
                  .filter((row) => row.wins > 0 || row.podiums > 0)
                  .sort((a, b) => b.wins - a.wins || b.podiums - a.podiums)
                  .slice(0, TOP)}
                copy={copy}
              />
            </div>
          </Section>

          <Section id="male-kluby" title={copy.smallTitle} lead={copy.smallLead}>
            <Table>
              <thead>
                <tr className={headRow}>
                  <Th>{copy.t("club")}</Th>
                  <Th right>{copy.wins}</Th>
                  <Th right>{copy.podiums}</Th>
                  <Th right>{copy.starts}</Th>
                  <Th right>{copy.winRate}</Th>
                  <Th right>{copy.podiumRate}</Th>
                </tr>
              </thead>
              <tbody>
                {data.efficiency.slice(0, TOP).map((row) => (
                  <tr key={row.id} className={bodyRow}>
                    <Td>
                      <ClubName slug={row.slug} name={row.name} />
                    </Td>
                    <Td right>
                      <strong>{row.wins}</strong>
                    </Td>
                    <Td right>{row.podiums}</Td>
                    <Td right>{row.starts}</Td>
                    <Td right>{pct(row.wins / row.starts)}</Td>
                    <Td right>{pct(row.podiums / row.starts)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>

          <Section id="veterani" title={copy.veteransTitle} lead={copy.veteransLead}>
            <Table>
              <thead>
                <tr className={headRow}>
                  <Th>{copy.t("club")}</Th>
                  <Th right>{copy.veteransCount}</Th>
                  <Th>{copy.veteransExamples}</Th>
                </tr>
              </thead>
              <tbody>
                {data.veterans.slice(0, TOP).map((row) => (
                  <tr key={row.id} className={bodyRow}>
                    <Td>
                      <ClubName slug={row.slug} name={row.name} />
                    </Td>
                    <Td right>
                      <strong>{row.count}</strong>
                    </Td>
                    <Td muted>
                      {row.examples
                        .map((person) => `${person.name} (${person.career})`)
                        .join(" · ")}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <p className="mt-4">
              <Link
                href={{ pathname: "/statistiky/[slug]", params: { slug: "veterani" } }}
                className="font-semibold text-race-accent hover:underline"
              >
                {copy.veteransAll}
              </Link>
            </p>
          </Section>

          {data.jubilees.length > 0 ? (
            <Section id="jubilea" title={copy.jubileesTitle} lead={undefined}>
              <div className="grid gap-6 sm:grid-cols-2">
                {data.jubilees.map((group) => (
                  <div key={group.nth}>
                    <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-race-accent">
                      {copy.jubileeNth(group.nth)}
                    </h3>
                    <ul className="space-y-1 text-sm">
                      {group.clubs.map((row) => (
                        <li key={row.id}>
                          <ClubName slug={row.slug} name={row.name} />
                          <span className="text-race-muted">
                            {" "}
                            ({row.firstYear}–{row.lastYear})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function ClubsViewsNav({
  items,
  ariaLabel,
}: {
  items: { slug: string; label: string; href?: "/kluby" | "/kluby/seznam" }[];
  ariaLabel: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="-mx-4 mt-8 sticky top-[83px] z-40 border-b border-race-line/60 bg-race-deep/90 pt-3 backdrop-blur supports-[backdrop-filter]:bg-race-deep/75 sm:mx-0 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
    >
      <ul className="flex snap-x gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
        {items.map((item) => {
          const href = item.href ?? (item.slug ? `#${item.slug}` : "/kluby");
          const active = item.slug === "";
          const className = active
            ? "inline-flex h-9 items-center whitespace-nowrap rounded-full border border-race-accent bg-race-accent-solid px-4 font-display text-sm font-semibold text-white"
            : "inline-flex h-9 items-center whitespace-nowrap rounded-full border border-race-line/70 bg-race-surface/60 px-4 font-display text-sm font-semibold text-race-muted transition hover:border-race-accent hover:text-race-accent";
          return (
            <li key={item.slug || "overview"} className="shrink-0 snap-start">
              {item.href ? (
                <Link
                  href={item.href}
                  className={className}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              ) : (
                <a href={href} className={className}>
                  {item.label}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function MedalTable({
  title,
  rows,
  copy,
}: {
  title: string;
  rows: { id: string; slug: string; name: string; wins: number; podiums: number }[];
  copy: McvvClubsHubCopy;
}) {
  return (
    <div>
      <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-race-accent">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-race-muted">{copy.empty}</p>
      ) : (
        <Table>
          <thead>
            <tr className={headRow}>
              <Th>{copy.t("club")}</Th>
              <Th right>{copy.wins}</Th>
              <Th right>{copy.podiums}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={bodyRow}>
                <Td>
                  <ClubName slug={row.slug} name={row.name} />
                </Td>
                <Td right>
                  <strong>{row.wins}</strong>
                </Td>
                <Td right>{row.podiums}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mt-16 scroll-mt-32">
      <div className="flex items-center gap-3">
        <span className="h-0.5 w-7 bg-race-accent" />
        <h2 className="font-display text-2xl font-semibold text-foreground dark:text-white">
          {title}
        </h2>
      </div>
      {lead ? <p className="mt-3 max-w-3xl text-sm leading-6 text-race-muted">{lead}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

const headRow =
  "border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim";
const bodyRow = "border-b border-race-line/40";

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return <th className={cn("py-2 pr-4", right && "text-right")}>{children}</th>;
}

function Td({ children, right, muted }: { children: ReactNode; right?: boolean; muted?: boolean }) {
  return (
    <td className={cn("py-2 pr-4", right && "text-right tabular-nums", muted && "text-race-muted")}>
      {children}
    </td>
  );
}

function ClubName({ slug, name }: { slug: string; name: string }) {
  return (
    <ClubLink
      slug={slug}
      name={name}
      className="font-semibold text-race-accent underline-offset-2 hover:underline"
    />
  );
}

function pct(value: number): string {
  return `${Math.round(value * 1000) / 10}\u00a0%`;
}
