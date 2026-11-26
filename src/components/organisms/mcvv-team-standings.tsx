import { Link } from "@/i18n/routing";

import { formatCountedList, isHistoricalTeamYear, leadMargin } from "@/lib/teams/format";
import type { TeamCompetition } from "@/lib/teams/scoring";

export type McvvTeamStandingsCopy = {
  title: string;
  provisionalChip: string;
  liveChip: string;
  officialChip: string;
  colRank: string;
  colTeam: string;
  colPoints: string;
  colFinishers: string;
  colCounted: string;
  pointsAbbr: (points: number) => string;
  finishersAbbr: (count: number) => string;
  marginPoints: (lead: number) => string;
  marginPlaces: (team: string) => string;
  unclassified: string;
  historicalNote: string;
  rulesLink: string;
  winnersLink: string;
};

export type McvvTeamStandingsProps = {
  year: number;
  competition: TeamCompetition;
  copy: McvvTeamStandingsCopy;
  /** When true, the table is a live (provisional) ranking. */
  live?: boolean;
  /** Show the historical back-calculation note (years before 2026). */
  historical?: boolean;
  id?: string;
};

export function McvvTeamStandings({
  year,
  competition,
  copy,
  live = false,
  historical = isHistoricalTeamYear(year),
  id = "soutez-tymu",
}: McvvTeamStandingsProps) {
  const leader = competition.official[0];
  const margin = leadMargin(competition.official);
  const chip = live ? copy.liveChip : historical ? copy.provisionalChip : copy.officialChip;
  const marginText =
    margin?.kind === "points"
      ? copy.marginPoints(margin.lead)
      : margin?.kind === "places"
        ? copy.marginPlaces(margin.second)
        : null;

  return (
    <section id={id} className="mt-12 scroll-mt-28" aria-labelledby={`${id}-title`}>
      <h2
        id={`${id}-title`}
        className="font-display text-3xl font-bold text-foreground dark:text-white"
      >
        {copy.title}
      </h2>

      {leader ? (
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-race-line/55 border-l-4 border-l-race-accent bg-race-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <span className="inline-flex items-center bg-race-accent/15 px-2 py-0.5 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-race-accent">
              {chip}
            </span>
            <p className="mt-2 font-display text-xl font-bold text-foreground dark:text-white sm:text-2xl">
              {leader.rank}. {leader.team}
            </p>
          </div>
          <div className="text-sm leading-6 text-race-muted sm:text-right">
            <p>
              {copy.pointsAbbr(leader.points)} · {copy.finishersAbbr(leader.finishers)}
            </p>
            {marginText ? <p>{marginText}</p> : null}
          </div>
        </div>
      ) : null}

      {competition.official.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-race-line/50 bg-race-surface">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-race-forest/80 text-xs font-semibold uppercase tracking-wide text-race-dim">
              <tr>
                <th className="px-3 py-2 text-right">{copy.colRank}</th>
                <th className="px-3 py-2">{copy.colTeam}</th>
                <th className="px-3 py-2 text-right">{copy.colPoints}</th>
                <th className="px-3 py-2 text-right">{copy.colFinishers}</th>
                <th className="px-3 py-2">{copy.colCounted}</th>
              </tr>
            </thead>
            <tbody>
              {competition.official.map((row, index) => (
                <tr key={`${row.team}-${index}`} className="border-t border-race-line/40 align-top">
                  <td className="px-3 py-2 text-right font-display font-semibold tabular-nums">
                    {row.rank}
                  </td>
                  <td className="px-3 py-2 font-semibold text-foreground dark:text-white">
                    {row.team}
                  </td>
                  <td className="px-3 py-2 text-right font-display font-semibold tabular-nums">
                    {row.points}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-race-muted">
                    {row.finishers}
                  </td>
                  <td className="px-3 py-2 text-race-muted">{formatCountedList(row.counted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {competition.unclassified.length > 0 ? (
        <details className="mt-4 text-sm text-race-muted">
          <summary className="cursor-pointer font-medium text-foreground dark:text-white">
            {copy.unclassified} ({competition.unclassified.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {competition.unclassified.map((row) => (
              <li key={row.team}>
                {row.team} — {copy.pointsAbbr(row.points)} · {copy.finishersAbbr(row.finishers)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {historical ? (
        <p className="mt-4 border-l-4 border-race-accent bg-race-surface px-4 py-3 text-sm leading-6 text-race-muted">
          {copy.historicalNote}
        </p>
      ) : null}

      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-race-accent">
        <Link href="/souteze-tymu" className="hover:underline">
          {copy.rulesLink}
        </Link>
        <Link
          href={{ pathname: "/statistiky/[slug]", params: { slug: "tymy" } }}
          className="hover:underline"
        >
          {copy.winnersLink}
        </Link>
      </p>
    </section>
  );
}
