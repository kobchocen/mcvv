import { ClubLink, RunnerNameLink } from "@/components/molecules";
import { shortBirthYear } from "@/lib/format/birth-year";
import { splitsLine, type SplitTimes } from "@/lib/results/table";
import { formatRaceTime } from "@/lib/utils";

export type McvvResultsTableRow = SplitTimes & {
  key: string;
  runnerId: string;
  runnerName: string | null;
  /** Státní příslušnost (#200, ISO kód); vlaječka jen u jiného než domácího státu. */
  nationality?: string | null;
  rank: number | undefined;
  /** Four-digit birth year (or "—"). */
  birthYear: string;
  club: string;
  /** Club profile slug (/kluby/[slug]); canonical club once merged in the admin. */
  clubSlug?: string | null;
  /** Overall view only: category with rank, e.g. "M40 (3.)". */
  category?: string;
  time: number;
  /** Traťový rekord v tomto ročníku (Q165): popisek odznaku TR, jinak bez odznaku. */
  record?: string | null;
};

export type McvvResultsTableLabels = {
  name: string;
  birth: string;
  birthShort: string;
  club: string;
  category: string;
  split1: string;
  split2: string;
  split1Short: string;
  split2Short: string;
  time: string;
  empty: string;
};

/**
 * Desktop (sm+, ≥ 640px) keeps every column with px-4 py-2. On phones the club, category and
 * split columns are hidden: the club (and category) become a 2nd line under the name, splits a
 * 3rd line for runners who have them; cells get 6px padding (10px at the outer edges) and #,
 * birth year and time shrink to their content (width 1%, nowrap).
 */
const cx = {
  rank: "w-[1%] whitespace-nowrap py-1.5 pl-2.5 pr-1.5 sm:w-auto sm:whitespace-normal sm:px-4 sm:py-2",
  name: "px-1.5 py-1.5 leading-tight [overflow-wrap:anywhere] sm:px-4 sm:py-2 sm:[overflow-wrap:normal]",
  birth: "w-[1%] whitespace-nowrap px-1.5 py-1.5 sm:w-auto sm:whitespace-normal sm:px-4 sm:py-2",
  desktop: "hidden px-4 py-2 sm:table-cell",
  time: "w-[1%] whitespace-nowrap py-1.5 pl-1.5 pr-2.5 sm:w-auto sm:whitespace-normal sm:px-4 sm:py-2",
} as const;

const barClass =
  "mt-4 first:mt-0 bg-race-accent/10 px-4 py-1.5 text-base font-display font-bold text-race-accent tracking-tight border-l-4 border-race-accent";

/**
 * One results group (category or sex): the coloured bar stays outside the horizontal scroll
 * area, so it never scrolls away with a wide table.
 */
export function McvvResultsGroup({
  id,
  title,
  rows,
  labels,
  showCategory = false,
  showSplits = false,
  anchorRows = false,
  desktopLeading = "inherit",
  className = "mb-4 last:mb-0",
}: {
  id?: string;
  title: string;
  rows: McvvResultsTableRow[];
  labels: McvvResultsTableLabels;
  showCategory?: boolean;
  showSplits?: boolean;
  /** Give rows an id (runner id) so /results/[year]#id can highlight a runner. */
  anchorRows?: boolean;
  /** Line height of the name cell on sm+: archive inherits text-sm, /results/[year] uses 1.5. */
  desktopLeading?: "inherit" | "normal";
  className?: string;
}) {
  const nameClass = `${cx.name} ${desktopLeading === "normal" ? "sm:leading-normal" : "sm:leading-[inherit]"}`;
  const columns = 5 + (showCategory ? 1 : 0) + (showSplits ? 2 : 0);
  const splitLabels = { split1: labels.split1Short, split2: labels.split2Short };
  return (
    <div id={id} className={className}>
      <div className={barClass}>{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-race-line/40 bg-race-forest/50 text-xs font-semibold uppercase tracking-wider text-race-dim">
              <th className={cx.rank}>#</th>
              <th className={nameClass}>{labels.name}</th>
              <th className={cx.birth}>
                <span className="hidden sm:inline">{labels.birth}</span>
                <span className="sm:hidden">{labels.birthShort}</span>
              </th>
              <th className={cx.desktop}>{labels.club}</th>
              {showCategory ? <th className={cx.desktop}>{labels.category}</th> : null}
              {showSplits ? (
                <>
                  <th className={`${cx.desktop} text-xs`}>{labels.split1}</th>
                  <th className={`${cx.desktop} text-xs`}>{labels.split2}</th>
                </>
              ) : null}
              <th className={`${cx.time} text-right`}>{labels.time}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-race-line/30">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns} className="px-4 py-2 text-xs text-race-muted">
                  {labels.empty}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const splits = showSplits ? splitsLine(r, splitLabels) : "";
                return (
                  <tr
                    key={r.key}
                    id={anchorRows ? r.runnerId : undefined}
                    className={
                      anchorRows
                        ? "scroll-mt-28 hover:bg-race-forest/30 target:bg-race-accent/10"
                        : "hover:bg-race-forest/30"
                    }
                  >
                    <td className={`${cx.rank} font-mono text-xs text-race-dim`}>{r.rank}</td>
                    <td className={`${nameClass} font-semibold`}>
                      <RunnerNameLink
                        id={r.runnerId}
                        name={r.runnerName}
                        nationality={r.nationality}
                      />
                      {r.record ? (
                        <span
                          title={r.record}
                          className="ml-1.5 inline-block rounded bg-amber-300 px-1 align-[1px] font-display text-[10px] leading-[1.4] font-bold tracking-wide text-amber-950"
                          data-testid="results-record"
                        >
                          TR
                        </span>
                      ) : null}
                      <span className="mt-px block text-xs leading-[1.3] font-normal text-race-muted sm:hidden">
                        <ClubLink slug={r.clubSlug} name={r.club} />
                        {showCategory && r.category ? ` · ${r.category}` : null}
                      </span>
                      {splits ? (
                        <span className="block text-xs leading-[1.3] font-normal tabular-nums text-race-muted sm:hidden">
                          {splits}
                        </span>
                      ) : null}
                    </td>
                    <td className={`${cx.birth} text-xs text-race-muted`}>
                      <span className="hidden sm:inline">{r.birthYear}</span>
                      <span className="sm:hidden">{shortBirthYear(r.birthYear)}</span>
                    </td>
                    <td className={`${cx.desktop} text-race-muted`}>
                      <ClubLink slug={r.clubSlug} name={r.club} />
                    </td>
                    {showCategory ? (
                      <td className={`${cx.desktop} text-race-muted text-xs`}>{r.category}</td>
                    ) : null}
                    {showSplits ? (
                      <>
                        <td className={`${cx.desktop} text-xs text-race-muted`}>
                          {r.split1 != null ? formatRaceTime(r.split1) : "—"}
                        </td>
                        <td className={`${cx.desktop} text-xs text-race-muted`}>
                          {r.split2 != null ? formatRaceTime(r.split2) : "—"}
                        </td>
                      </>
                    ) : null}
                    <td
                      className={`${cx.time} text-right font-display text-base font-semibold text-race-accent`}
                    >
                      {formatRaceTime(r.time)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
