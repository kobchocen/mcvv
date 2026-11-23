import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { ClubLink, ClubsExpandableTable } from "@/components/molecules";
import { McvvPublicNavbar } from "@/components/organisms";
import { Link } from "@/i18n/routing";
import {
  clubHubHref,
  type ClubHubView,
  type ClubInsights,
  type ClubRef,
} from "@/lib/clubs/insights";
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
  expeditionsUnit: string;
  expeditionsChart: string;
  colYear: string;
  colSize: string;
  newcomersTitle: string;
  newcomersLead: string;
  newcomersHeading: string;
  returnsHeading: string;
  returnsGap: string;
  returnsLast: string;
  yearsCount: (count: number) => string;
  cardReturn: (club: string, gap: number) => string;
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
  veteransUnit: string;
  jubileesTitle: string;
  jubileeNth: (n: number) => string;
  moreView: string;
  moreList: string;
  showMoreCount: (count: number) => string;
  counters: { value: string; label: string; sub?: string }[];
  t: CopyFn;
};

const TABLE_INITIAL = 15;
const TABLE_CAP = 40;

type ViewItem = { slug: ClubHubView | "seznam"; label: string };

export function McvvClubsHub({
  brand,
  nav,
  data,
  copy,
  view,
  suggestNames,
  listAction,
}: {
  brand: McvvHomepageContent["brand"];
  nav: McvvHomepageContent["nav"];
  data: ClubInsights;
  copy: McvvClubsHubCopy;
  view: ClubHubView;
  suggestNames: string[];
  listAction: string;
}) {
  const views: ViewItem[] = [
    { slug: "", label: copy.t("viewOverview") },
    { slug: "snury", label: copy.t("viewStreaks") },
    { slug: "vernost", label: copy.t("viewLoyal") },
    { slug: "vypravy", label: copy.t("viewExpeditions") },
    { slug: "novacci", label: copy.t("viewNewcomers") },
    { slug: "medaile", label: copy.t("viewMedals") },
    { slug: "male-kluby", label: copy.t("viewSmall") },
    { slug: "veterani", label: copy.t("viewVeterans") },
    { slug: "jubilea", label: copy.t("viewJubilees") },
    { slug: "seznam", label: copy.t("viewList") },
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

          <ClubsViewsNav items={views} current={view} ariaLabel={copy.navLabel} />

          {view === "" ? (
            <OverviewGrid
              data={data}
              copy={copy}
              suggestNames={suggestNames}
              listAction={listAction}
            />
          ) : (
            <ViewTables view={view} data={data} copy={copy} />
          )}
        </div>
      </section>
    </main>
  );
}

const bigClass = "font-display text-3xl font-bold leading-none text-foreground dark:text-white";
const metaClass = "text-[13px] leading-5 text-race-muted";

function OverviewGrid({
  data,
  copy,
  suggestNames,
  listAction,
}: {
  data: ClubInsights;
  copy: McvvClubsHubCopy;
  suggestNames: string[];
  listAction: string;
}) {
  const record = data.expeditions[0] ?? data.expeditionMax[0];
  const maxBar = data.expeditionsByYear.reduce((max, row) => Math.max(max, row.size), 0);
  const topReturn = data.returns[0];
  const medalsM = [...data.medals].filter((row) => row.winsM > 0).sort((a, b) => b.winsM - a.winsM);
  const medalsF = [...data.medals].filter((row) => row.winsF > 0).sort((a, b) => b.winsF - a.winsF);
  const small = data.efficiency[0];
  const vet = data.veterans[0];

  return (
    <section className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      <Tile title={copy.streaksTitle} more={<MoreLink view="snury" label={copy.moreView} />}>
        <Ranked clubs={data.streaks.slice(0, 3)} value={(row) => String(row.length)} />
      </Tile>

      <Tile title={copy.loyalTitle} more={<MoreLink view="vernost" label={copy.moreView} />}>
        <Ranked clubs={data.loyal.slice(0, 3)} value={(row) => String(row.editions)} />
      </Tile>

      <Tile
        title={copy.expeditionsTitle}
        className="md:col-span-2 xl:col-span-3"
        more={<MoreLink view="vypravy" label={copy.moreView} />}
      >
        {record ? (
          <>
            <div className={bigClass}>
              {record.size}{" "}
              <small className="font-sans text-sm font-medium normal-case text-race-muted">
                {copy.expeditionsUnit}
              </small>
            </div>
            <p className={metaClass}>
              <ClubName slug={record.slug} name={record.name} /> · {record.year}
            </p>
          </>
        ) : (
          <p className={metaClass}>{copy.empty}</p>
        )}
        {data.expeditionsByYear.length > 0 ? (
          <>
            <div
              className="flex h-[70px] items-end gap-[2px]"
              role="img"
              aria-label={copy.expeditionsChart}
            >
              {data.expeditionsByYear.map((bar) => (
                <div
                  key={bar.year}
                  title={`${bar.year}: ${bar.name} ${bar.size}`}
                  className={cn(
                    "min-w-0 flex-1 rounded-t-[2px]",
                    record && bar.year === record.year && bar.size === record.size
                      ? "bg-race-accent"
                      : "bg-race-line dark:bg-race-forest-2",
                  )}
                  style={{ height: `${Math.max(8, maxBar ? (bar.size / maxBar) * 100 : 8)}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between gap-2 text-[11px] text-race-dim">
              <span>{copy.expeditionsChart}</span>
              <span>
                {data.firstYear}–{data.lastYear}
              </span>
            </div>
          </>
        ) : null}
        <p className="text-xs text-race-dim">{copy.startListNote}</p>
      </Tile>

      <Tile title={copy.newcomersTitle} more={<MoreLink view="novacci" label={copy.moreView} />}>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="min-w-0 rounded-xl bg-race-forest p-3 dark:bg-race-deep/70">
            <div className={bigClass}>{data.newcomersLatestCount}</div>
            <p className={cn(metaClass, "mt-1")}>{copy.newcomersHeading}</p>
          </div>
          <div className="min-w-0 rounded-xl bg-race-forest p-3 dark:bg-race-deep/70">
            <div className={bigClass}>{data.returns.length}</div>
            <p className={cn(metaClass, "mt-1")}>{copy.returnsHeading}</p>
          </div>
        </div>
        {topReturn ? (
          <p className={metaClass}>{copy.cardReturn(topReturn.name, topReturn.gap)}</p>
        ) : null}
      </Tile>

      <Tile
        title={copy.medalsTitle}
        className="md:col-span-2"
        more={<MoreLink view="medaile" label={copy.moreView} />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <MedalPreview title={copy.men} rows={medalsM.slice(0, 3)} wins={(row) => row.winsM} />
          <MedalPreview title={copy.women} rows={medalsF.slice(0, 3)} wins={(row) => row.winsF} />
        </div>
      </Tile>

      <Tile title={copy.smallTitle} more={<MoreLink view="male-kluby" label={copy.moreView} />}>
        {small ? (
          <>
            <div className={bigClass}>{pct(small.wins / small.starts)}</div>
            <p className={metaClass}>
              <ClubName slug={small.slug} name={small.name} /> · {small.wins}/{small.starts}
            </p>
          </>
        ) : (
          <p className={metaClass}>{copy.empty}</p>
        )}
      </Tile>

      <Tile title={copy.veteransTitle} more={<MoreLink view="veterani" label={copy.moreView} />}>
        <div className={bigClass}>
          {data.veteranCount}{" "}
          <small className="font-sans text-sm font-medium normal-case text-race-muted">
            {copy.veteransUnit}
          </small>
        </div>
        {vet ? (
          <p className={metaClass}>
            <ClubName slug={vet.slug} name={vet.name} /> · {vet.count}
          </p>
        ) : null}
      </Tile>

      {data.jubilees.length > 0 ? (
        <Tile title={copy.jubileesTitle} more={<MoreLink view="jubilea" label={copy.moreView} />}>
          <ul className="space-y-2 text-sm">
            {data.jubilees.map((group) => (
              <li key={group.nth}>
                <p className="font-display text-xs font-semibold uppercase tracking-wide text-race-accent">
                  {copy.jubileeNth(group.nth)}
                </p>
                <p className="text-foreground">{group.clubs.map((row) => row.name).join(" · ")}</p>
              </li>
            ))}
          </ul>
        </Tile>
      ) : null}

      <Tile
        title={copy.t("listTitle")}
        more={<MoreLink href="/kluby/seznam" label={copy.moreList} />}
      >
        <form method="get" action={listAction} role="search" className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-foreground">
            {copy.t("searchLabel")}
            <input
              type="search"
              name="q"
              placeholder={copy.t("searchPlaceholder")}
              maxLength={80}
              list="kluby-hub-naseptavac"
              autoComplete="off"
              aria-describedby="kluby-hub-naseptavac-hint"
              className="mt-1 h-10 w-full rounded-md border border-race-line bg-race-surface px-3 font-normal font-sans text-foreground"
            />
          </label>
          <datalist id="kluby-hub-naseptavac">
            {suggestNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <p id="kluby-hub-naseptavac-hint" className="text-xs text-race-dim">
            <span className="font-semibold">{copy.t("suggestLabel")}. </span>
            {copy.t("suggestHint")}
          </p>
          <button
            type="submit"
            className="mt-1 inline-flex h-10 w-fit items-center rounded-full bg-race-accent-solid px-5 font-display text-sm font-semibold text-white"
          >
            {copy.t("search")}
          </button>
        </form>
      </Tile>
    </section>
  );
}

function ViewTables({
  view,
  data,
  copy,
}: {
  view: Exclude<ClubHubView, "">;
  data: ClubInsights;
  copy: McvvClubsHubCopy;
}) {
  const more = (total: number) =>
    total > TABLE_INITIAL ? copy.showMoreCount(Math.min(total, TABLE_CAP) - TABLE_INITIAL) : "";
  const take = <T,>(rows: T[]) => rows.slice(0, TABLE_CAP);
  const medalsM = take(
    [...data.medals]
      .filter((row) => row.winsM > 0)
      .sort((a, b) => b.winsM - a.winsM || b.podiumsM - a.podiumsM),
  );
  const medalsF = take(
    [...data.medals]
      .filter((row) => row.winsF > 0)
      .sort((a, b) => b.winsF - a.winsF || b.podiumsF - a.podiumsF),
  );

  if (view === "snury") {
    const rows = take(data.streaks);
    return (
      <Section title={copy.streaksTitle} lead={copy.streaksLead}>
        <Expandable
          moreLabel={more(data.streaks.length)}
          header={
            <tr className={headRow}>
              <Th>#</Th>
              <Th>{copy.t("club")}</Th>
              <Th right>{copy.streaksCol}</Th>
              <Th right hide="sm">
                {copy.years}
              </Th>
              <Th right hide="sm">
                {copy.editions}
              </Th>
              <Th right hide="sm">
                {copy.starts}
              </Th>
            </tr>
          }
          rows={rows.map((row, index) => (
            <tr key={row.id} className={bodyRow}>
              <Td>{index + 1}</Td>
              <Td>
                <ClubName slug={row.slug} name={row.name} />
              </Td>
              <Td right>
                <strong>{row.length}</strong>
              </Td>
              <Td right muted hide="sm">
                {row.from}–{row.to}
              </Td>
              <Td right hide="sm">
                {row.editions}
              </Td>
              <Td right hide="sm">
                {row.starts}
              </Td>
            </tr>
          ))}
        />
      </Section>
    );
  }

  if (view === "vernost") {
    const rows = take(data.loyal);
    return (
      <Section title={copy.loyalTitle} lead={copy.loyalLead}>
        <Expandable
          moreLabel={more(data.loyal.length)}
          header={
            <tr className={headRow}>
              <Th>#</Th>
              <Th>{copy.t("club")}</Th>
              <Th right>{copy.editions}</Th>
              <Th right hide="sm">
                {copy.years}
              </Th>
              <Th right hide="md">
                {copy.streaksCol}
              </Th>
              <Th right>{copy.loyalMissed}</Th>
              <Th right hide="sm">
                {copy.starts}
              </Th>
            </tr>
          }
          rows={rows.map((row, index) => (
            <tr key={row.id} className={bodyRow}>
              <Td>{index + 1}</Td>
              <Td>
                <ClubName slug={row.slug} name={row.name} />
              </Td>
              <Td right>
                <strong>{row.editions}</strong>
              </Td>
              <Td right muted hide="sm">
                {row.firstYear}–{row.lastYear}
              </Td>
              <Td right hide="md">
                {row.streak}
              </Td>
              <Td right>{row.missed}</Td>
              <Td right hide="sm">
                {row.starts}
              </Td>
            </tr>
          ))}
        />
      </Section>
    );
  }

  if (view === "vypravy") {
    const maxRows = take(data.expeditionMax);
    const allRows = take(data.expeditions);
    return (
      <Section title={copy.expeditionsTitle} lead={copy.expeditionsLead}>
        <p className="mb-6 text-sm text-race-dim">{copy.startListNote}</p>
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-race-accent">
              {copy.expeditionsMax}
            </h3>
            <Expandable
              moreLabel={more(data.expeditionMax.length)}
              header={
                <tr className={headRow}>
                  <Th>{copy.t("club")}</Th>
                  <Th right>{copy.colSize}</Th>
                  <Th right>{copy.colYear}</Th>
                </tr>
              }
              rows={maxRows.map((row) => (
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
            />
          </div>
          <div>
            <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-race-accent">
              {copy.expeditionsAll}
            </h3>
            <Expandable
              moreLabel={more(data.expeditions.length)}
              header={
                <tr className={headRow}>
                  <Th>{copy.t("club")}</Th>
                  <Th right>{copy.colSize}</Th>
                  <Th right>{copy.colYear}</Th>
                </tr>
              }
              rows={allRows.map((row) => (
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
            />
          </div>
        </div>
      </Section>
    );
  }

  if (view === "novacci") {
    const newcomers = take(data.newcomers);
    const returns = take(data.returns);
    return (
      <Section title={copy.newcomersTitle} lead={copy.newcomersLead}>
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-race-accent">
              {copy.newcomersHeading}
            </h3>
            <Expandable
              moreLabel={more(data.newcomers.length)}
              header={
                <tr className={headRow}>
                  <Th>{copy.t("club")}</Th>
                  <Th right>{copy.starts}</Th>
                </tr>
              }
              rows={newcomers.map((row) => (
                <tr key={row.id} className={bodyRow}>
                  <Td>
                    <ClubName slug={row.slug} name={row.name} />
                  </Td>
                  <Td right>{row.starts}</Td>
                </tr>
              ))}
            />
          </div>
          <div>
            <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-race-accent">
              {copy.returnsHeading}
            </h3>
            <Expandable
              moreLabel={more(data.returns.length)}
              header={
                <tr className={headRow}>
                  <Th>{copy.t("club")}</Th>
                  <Th right>{copy.returnsGap}</Th>
                  <Th right hide="sm">
                    {copy.returnsLast}
                  </Th>
                  <Th right hide="sm">
                    {copy.starts}
                  </Th>
                </tr>
              }
              rows={returns.map((row) => (
                <tr key={row.id} className={bodyRow}>
                  <Td>
                    <ClubName slug={row.slug} name={row.name} />
                  </Td>
                  <Td right>{copy.yearsCount(row.gap)}</Td>
                  <Td right muted hide="sm">
                    {row.lastBefore}
                  </Td>
                  <Td right hide="sm">
                    {row.starts}
                  </Td>
                </tr>
              ))}
            />
          </div>
        </div>
      </Section>
    );
  }

  if (view === "medaile") {
    return (
      <Section title={copy.medalsTitle} lead={copy.medalsLead}>
        <p className="mb-6 text-sm text-race-dim">{copy.medalsNote}</p>
        <div className="grid gap-8 lg:grid-cols-2">
          <MedalTable
            title={copy.men}
            rows={medalsM}
            moreLabel={more(medalsM.length)}
            wins="winsM"
            podiums="podiumsM"
            copy={copy}
          />
          <MedalTable
            title={copy.women}
            rows={medalsF}
            moreLabel={more(medalsF.length)}
            wins="winsF"
            podiums="podiumsF"
            copy={copy}
          />
        </div>
      </Section>
    );
  }

  if (view === "male-kluby") {
    const rows = take(data.efficiency);
    return (
      <Section title={copy.smallTitle} lead={copy.smallLead}>
        <Expandable
          moreLabel={more(data.efficiency.length)}
          header={
            <tr className={headRow}>
              <Th>{copy.t("club")}</Th>
              <Th right hide="sm">
                {copy.wins}
              </Th>
              <Th right hide="md">
                {copy.podiums}
              </Th>
              <Th right hide="sm">
                {copy.starts}
              </Th>
              <Th right>{copy.winRate}</Th>
              <Th right hide="sm">
                {copy.podiumRate}
              </Th>
            </tr>
          }
          rows={rows.map((row) => (
            <tr key={row.id} className={bodyRow}>
              <Td>
                <ClubName slug={row.slug} name={row.name} />
              </Td>
              <Td right hide="sm">
                <strong>{row.wins}</strong>
              </Td>
              <Td right hide="md">
                {row.podiums}
              </Td>
              <Td right hide="sm">
                {row.starts}
              </Td>
              <Td right>
                <strong>{pct(row.wins / row.starts)}</strong>
              </Td>
              <Td right hide="sm">
                {pct(row.podiums / row.starts)}
              </Td>
            </tr>
          ))}
        />
      </Section>
    );
  }

  if (view === "veterani") {
    const rows = take(data.veterans);
    return (
      <Section title={copy.veteransTitle} lead={copy.veteransLead}>
        <Expandable
          moreLabel={more(data.veterans.length)}
          header={
            <tr className={headRow}>
              <Th>{copy.t("club")}</Th>
              <Th right>{copy.veteransCount}</Th>
              <Th hide="sm">{copy.veteransExamples}</Th>
            </tr>
          }
          rows={rows.map((row) => (
            <tr key={row.id} className={bodyRow}>
              <Td>
                <ClubName slug={row.slug} name={row.name} />
              </Td>
              <Td right>
                <strong>{row.count}</strong>
              </Td>
              <Td muted hide="sm">
                {row.examples.map((ex) => `${ex.name} (${ex.career})`).join(" · ")}
              </Td>
            </tr>
          ))}
        />
        <p className="mt-4">
          <Link
            href={{ pathname: "/statistiky/[slug]", params: { slug: "veterani" } }}
            className="font-semibold text-race-accent hover:underline"
          >
            {copy.veteransAll}
          </Link>
        </p>
      </Section>
    );
  }

  return (
    <Section title={copy.jubileesTitle}>
      {data.jubilees.length === 0 ? (
        <p className="text-sm text-race-muted">{copy.empty}</p>
      ) : (
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
      )}
    </Section>
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
      <h2 className="font-display text-[15px] font-semibold uppercase tracking-[0.08em] text-race-accent">
        {title}
      </h2>
      {children}
      {more ? <div className="mt-auto pt-1">{more}</div> : null}
    </article>
  );
}

function MoreLink({
  view,
  href,
  label,
}: {
  view?: Exclude<ClubHubView, "">;
  href?: "/kluby/seznam";
  label: string;
}) {
  return (
    <Link
      href={href ?? clubHubHref(view ?? "")}
      className="inline-flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-[0.1em] text-race-accent hover:underline"
    >
      {label}
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}

function Ranked<T extends ClubRef & { length?: number; editions?: number }>({
  clubs,
  value,
}: {
  clubs: T[];
  value: (row: T) => string;
}) {
  if (clubs.length === 0) return null;
  return (
    <ol className="flex flex-col gap-1.5">
      {clubs.map((row, index) => (
        <li
          key={row.id}
          className="flex items-baseline justify-between gap-3 border-b border-dashed border-race-line/60 pb-1.5 text-sm"
        >
          <span className="min-w-0 truncate">
            <span className="inline-block w-5 text-race-dim">{index + 1}</span>
            <ClubName slug={row.slug} name={row.name} />
          </span>
          <b className="shrink-0 font-display text-base">{value(row)}</b>
        </li>
      ))}
    </ol>
  );
}

function MedalPreview({
  title,
  rows,
  wins,
}: {
  title: string;
  rows: (ClubRef & { winsM: number; winsF: number })[];
  wins: (row: ClubRef & { winsM: number; winsF: number }) => number;
}) {
  return (
    <div>
      <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-race-dim">
        {title}
      </h3>
      <Ranked clubs={rows} value={(row) => String(wins(row))} />
    </div>
  );
}

function MedalTable({
  title,
  rows,
  moreLabel,
  wins,
  podiums,
  copy,
}: {
  title: string;
  rows: (ClubRef & { winsM: number; winsF: number; podiumsM: number; podiumsF: number })[];
  moreLabel: string;
  wins: "winsM" | "winsF";
  podiums: "podiumsM" | "podiumsF";
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
        <Expandable
          moreLabel={moreLabel}
          header={
            <tr className={headRow}>
              <Th>{copy.t("club")}</Th>
              <Th right>{copy.wins}</Th>
              <Th right hide="sm">
                {copy.podiums}
              </Th>
            </tr>
          }
          rows={rows.map((row) => (
            <tr key={row.id} className={bodyRow}>
              <Td>
                <ClubName slug={row.slug} name={row.name} />
              </Td>
              <Td right>
                <strong>{row[wins]}</strong>
              </Td>
              <Td right hide="sm">
                {row[podiums]}
              </Td>
            </tr>
          ))}
        />
      )}
    </div>
  );
}

function Expandable({
  header,
  rows,
  moreLabel,
}: {
  header: ReactNode;
  rows: ReactNode[];
  moreLabel: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-race-muted">—</p>;
  return (
    <ClubsExpandableTable
      header={header}
      rows={rows}
      initial={TABLE_INITIAL}
      moreLabel={moreLabel}
    />
  );
}

function ClubsViewsNav({
  items,
  current,
  ariaLabel,
}: {
  items: ViewItem[];
  current: ClubHubView;
  ariaLabel: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="-mx-4 mt-8 sticky top-[83px] z-40 border-b border-race-line/60 bg-race-deep/90 pt-3 backdrop-blur supports-[backdrop-filter]:bg-race-deep/75 sm:mx-0 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
    >
      <ul className="flex snap-x gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
        {items.map((item) => {
          const active = item.slug === current || (item.slug === "" && current === "");
          const href = item.slug === "seznam" ? ("/kluby/seznam" as const) : clubHubHref(item.slug);
          const className = active
            ? "inline-flex h-9 items-center whitespace-nowrap rounded-full border border-race-accent bg-race-accent-solid px-4 font-display text-sm font-semibold text-white"
            : "inline-flex h-9 items-center whitespace-nowrap rounded-full border border-race-line/70 bg-race-surface/60 px-4 font-display text-sm font-semibold text-race-muted transition hover:border-race-accent hover:text-race-accent";
          return (
            <li key={item.slug || "overview"} className="shrink-0 snap-start">
              <Link href={href} className={className} aria-current={active ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Section({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <section className="mt-10">
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

const headRow =
  "border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim";
const bodyRow = "border-b border-race-line/40";

function hideClass(hide?: "sm" | "md") {
  return hide === "sm"
    ? "hidden sm:table-cell"
    : hide === "md"
      ? "hidden md:table-cell"
      : undefined;
}

function Th({
  children,
  right,
  hide,
}: {
  children: ReactNode;
  right?: boolean;
  hide?: "sm" | "md";
}) {
  return <th className={cn("py-2 pr-4", right && "text-right", hideClass(hide))}>{children}</th>;
}

function Td({
  children,
  right,
  muted,
  hide,
}: {
  children: ReactNode;
  right?: boolean;
  muted?: boolean;
  hide?: "sm" | "md";
}) {
  return (
    <td
      className={cn(
        "py-2 pr-4",
        right && "text-right tabular-nums",
        muted && "text-race-muted",
        hideClass(hide),
      )}
    >
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
