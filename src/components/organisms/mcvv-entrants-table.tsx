import { Fragment } from "react";

import { ClubLink, RunnerNameLink } from "@/components/molecules";
import { shortBirthYear } from "@/lib/format/birth-year";
import type { PublicEntrantCategory } from "@/lib/entries/club-entrants-core";
import { formatRaceTime } from "@/lib/utils";

/**
 * Desktop (sm+) keeps the original five columns (py-2 / py-2.5, pr-3). On phones Klub and
 * Starty are hidden (shown as a 2nd line under the name), the birth year shrinks to ’07 and
 * the OR column stays on the right.
 *
 * On the club page (`showClub=false`) the club column and the club name on the mobile 2nd
 * line are omitted – every runner already belongs to that club (#352).
 */
const cx = {
  name: "py-2 pr-3",
  birth: "w-[1%] whitespace-nowrap py-2 pr-3 sm:w-auto sm:whitespace-normal",
  desktop: "hidden py-2 pr-3 sm:table-cell",
  record: "w-[1%] whitespace-nowrap py-2 text-right sm:w-auto sm:whitespace-normal sm:text-left",
  nameCell:
    "py-2.5 pr-3 leading-tight [overflow-wrap:anywhere] sm:leading-[inherit] sm:[overflow-wrap:normal]",
  birthCell: "w-[1%] whitespace-nowrap py-2.5 pr-3 sm:w-auto sm:whitespace-normal",
  desktopCell: "hidden py-2.5 pr-3 sm:table-cell",
  recordCell:
    "w-[1%] whitespace-nowrap py-2.5 text-right sm:w-auto sm:whitespace-normal sm:text-left",
} as const;

export type McvvEntrantsTableCopy = {
  colName: string;
  colBirth: string;
  colClub: string;
  colStarts: string;
  colRecord: string;
  newbie: string;
  starts: (values: { count: number }) => string;
};

export function McvvEntrantsTable({
  categories,
  copy,
  showClub = true,
}: {
  categories: readonly PublicEntrantCategory[];
  copy: McvvEntrantsTableCopy;
  showClub?: boolean;
}) {
  const colSpan = showClub ? 5 : 4;
  return (
    <div className="overflow-x-auto">
      {/* Below sm the Klub and Starty columns become a 2nd line under the name. */}
      <table
        className={`w-full border-collapse text-left text-sm sm:table-fixed ${showClub ? "sm:min-w-[40rem]" : "sm:min-w-[32rem]"}`}
        data-testid="entrants-table"
      >
        <colgroup>
          <col className={showClub ? "sm:w-[28%]" : "sm:w-[40%]"} />
          <col className={showClub ? "sm:w-[12%]" : "sm:w-[16%]"} />
          {showClub ? <col className="sm:w-[28%]" /> : null}
          <col className={showClub ? "sm:w-[18%]" : "sm:w-[24%]"} />
          <col className={showClub ? "sm:w-[14%]" : "sm:w-[20%]"} />
        </colgroup>
        <thead>
          <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
            <th className={cx.name}>{copy.colName}</th>
            <th className={cx.birth}>{copy.colBirth}</th>
            {showClub ? <th className={cx.desktop}>{copy.colClub}</th> : null}
            <th className={cx.desktop}>{copy.colStarts}</th>
            <th className={cx.record}>{copy.colRecord}</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((group, index) => (
            <Fragment key={group.id}>
              <tr>
                <th
                  colSpan={colSpan}
                  className={`pb-2 font-display text-xl font-semibold text-foreground dark:text-white ${index === 0 ? "pt-4" : "pt-8"}`}
                >
                  {group.name} ({group.runners.length})
                </th>
              </tr>
              {group.runners.map((runner) => (
                <tr key={runner.id} className="border-b border-race-line/40">
                  <td className={`${cx.nameCell} font-medium`}>
                    <RunnerNameLink
                      id={runner.id}
                      name={runner.name}
                      nationality={runner.nationality}
                    />
                    <span className="mt-0.5 block text-xs leading-[1.3] font-normal text-race-muted sm:hidden">
                      {showClub && runner.club.trim() ? (
                        <>
                          <ClubLink id={runner.clubId} name={runner.club} to="entrants" />
                          {" · "}
                        </>
                      ) : null}
                      {runner.newbie ? (
                        <span className="rounded-full bg-race-accent/15 px-1.5 py-px text-[0.6875rem] font-semibold text-race-accent">
                          {copy.newbie}
                        </span>
                      ) : (
                        copy.starts({ count: runner.starts })
                      )}
                    </span>
                  </td>
                  <td className={`${cx.birthCell} text-race-muted`}>
                    <span className="hidden sm:inline">{runner.birth}</span>
                    <span className="sm:hidden">{shortBirthYear(runner.birth)}</span>
                  </td>
                  {showClub ? (
                    <td className={`${cx.desktopCell} text-race-muted`}>
                      <ClubLink id={runner.clubId} name={runner.club} to="entrants" />
                    </td>
                  ) : null}
                  <td className={`${cx.desktopCell} text-race-muted`}>
                    {runner.newbie ? copy.newbie : copy.starts({ count: runner.starts })}
                  </td>
                  <td className={`${cx.recordCell} tabular-nums text-race-muted`}>
                    {runner.record != null ? formatRaceTime(runner.record) : ""}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
