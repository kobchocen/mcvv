import { McvvPublicNavbar } from "@/components/organisms";
import { RunnerNameLink } from "@/components/molecules";
import { Link } from "@/i18n/routing";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

export type StatsCell = {
  text: string;
  runnerId?: string;
};

export type StatsTable = {
  title?: string;
  columns: string[];
  rows: StatsCell[][];
};

export type AttendanceBar = {
  year: number;
  men: number;
  women: number;
};

export type McvvStatsPageProps = {
  brand: McvvHomepageContent["brand"];
  nav: McvvHomepageContent["nav"];
  eyebrow: string;
  title: string;
  intro: string;
  tables: StatsTable[];
  chart?: AttendanceBar[];
  chartCaption?: string;
  chartMenLabel?: string;
  chartWomenLabel?: string;
  empty: string;
  back: string;
};

export function McvvStatsPage({
  brand,
  nav,
  eyebrow,
  title,
  intro,
  tables,
  chart,
  chartCaption,
  chartMenLabel = "M",
  chartWomenLabel = "Ž",
  empty,
  back,
}: McvvStatsPageProps) {
  const maxBar = chart?.reduce((max, bar) => Math.max(max, bar.men + bar.women), 0) ?? 0;

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvPublicNavbar content={{ brand, nav }} variant="solid" />
      <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center gap-3">
            <span className="h-0.5 w-7 bg-race-accent" />
            <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent">
              {eyebrow}
            </p>
          </div>
          <h1 className="mt-5 font-display text-4xl font-bold text-white sm:text-5xl">{title}</h1>
          {intro ? (
            <p className="mt-4 max-w-2xl text-base leading-7 text-race-muted">{intro}</p>
          ) : null}

          {chart && chart.length > 0 ? (
            <div className="mt-10">
              {chartCaption ? (
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-race-dim">
                  {chartCaption}
                </p>
              ) : null}
              <div className="flex h-48 items-end gap-px border-b border-race-line/60">
                {chart.map((bar) => {
                  const total = bar.men + bar.women;
                  return (
                    <div
                      key={bar.year}
                      className="flex h-full min-w-0 flex-1 flex-col justify-end"
                      title={`${bar.year}: ${chartMenLabel} ${bar.men} / ${chartWomenLabel} ${bar.women}`}
                    >
                      <div
                        className="w-full bg-race-muted/70"
                        style={{ height: maxBar ? `${(bar.women / maxBar) * 100}%` : 0 }}
                      />
                      <div
                        className="w-full bg-race-accent"
                        style={{ height: maxBar ? `${(bar.men / maxBar) * 100}%` : 0 }}
                      />
                      <span className="sr-only">
                        {bar.year}: {total}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {tables.length === 0 ? (
            <p className="mt-10 text-sm text-race-muted">{empty}</p>
          ) : (
            tables.map((table) => (
              <div key={table.title ?? table.columns.join("-")} className="mt-10">
                {table.title ? (
                  <h2 className="mb-4 font-display text-2xl font-semibold text-white">
                    {table.title}
                  </h2>
                ) : null}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                        {table.columns.map((column) => (
                          <th key={column} className="py-2 pr-4">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row, index) => (
                        <tr key={index} className="border-b border-race-line/40">
                          {row.map((cell, cellIndex) => (
                            <td key={cellIndex} className="py-2.5 pr-4 text-race-muted">
                              {cell.runnerId ? (
                                <RunnerNameLink id={cell.runnerId} name={cell.text} />
                              ) : (
                                cell.text
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}

          <p className="mt-10">
            <Link
              href="/"
              className="font-medium text-race-accent underline-offset-2 hover:underline"
            >
              {back}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
