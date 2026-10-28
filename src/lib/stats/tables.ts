import {
  getAbsoluteWinners,
  getAgeRecords,
  getAttendance,
  getNationalityStats,
  getRecordEvolution,
  getTopTimesBySex,
  getVeteranClub,
  type StatSlug,
} from "./queries";
import { countryName } from "@/lib/runner/nationality";
import { formatRaceTime } from "@/lib/utils";

/** Data jedné statistické stránky – sdílí je web (`/statistiky/[slug]`) i tiskové PDF. */
export type StatsCellData = {
  text: string;
  runnerId?: string;
  /** Club profile slug (#196): the web shows the club as a link, the PDF as text. */
  clubSlug?: string;
  /** ISO kód státu (#200): web před text přidá vlaječku, PDF jen text. */
  flag?: string;
};

export type StatsTableData = {
  title?: string;
  columns: string[];
  rows: StatsCellData[][];
};

export type StatsChartBar = { year: number; men: number; women: number };

export type StatsSlugData = {
  tables: StatsTableData[];
  chart?: StatsChartBar[];
  chartCaption?: string;
};

/** Překladač sekce „Stats“ (next-intl `t` na webu, prostý překladač v PDF). */
export type StatsT = (key: string) => string;

function cell(text: string, runnerId?: string): StatsCellData {
  return runnerId ? { text, runnerId } : { text };
}

function clubCell(text: string, clubSlug: string | null): StatsCellData {
  return clubSlug ? { text, clubSlug } : { text };
}

export async function loadStatsSlug(
  slug: StatSlug,
  t: StatsT,
  locale = "cs",
): Promise<StatsSlugData> {
  switch (slug) {
    case "rekordy": {
      const groups = await getRecordEvolution();
      return {
        tables: groups.map((group) => ({
          title: group.category,
          columns: [t("colYear"), t("colName"), t("colBirth"), t("colClub"), t("colTime")],
          rows: group.rows.map((row) => [
            cell(String(row.year)),
            cell(row.name, row.runnerId),
            cell(row.birthYear),
            clubCell(row.club, row.clubSlug),
            cell(row.time),
          ]),
        })),
      };
    }
    case "vitezove": {
      const rows = await getAbsoluteWinners();
      return {
        tables: [
          {
            columns: [t("colYear"), t("men"), t("menTime"), t("women"), t("womenTime")],
            rows: rows.map((row) => [
              cell(String(row.year)),
              cell(row.menName, row.menId),
              cell(row.menTime),
              cell(row.womenName, row.womenId),
              cell(row.womenTime),
            ]),
          },
        ],
      };
    }
    case "casy": {
      const { men, women } = await getTopTimesBySex();
      const columns = [
        t("colRank"),
        t("colYear"),
        t("colName"),
        t("colBirth"),
        t("colClub"),
        t("colTime"),
      ];
      const toRows = (list: typeof men) =>
        list.map((row) => [
          cell(String(row.rank)),
          cell(String(row.year)),
          cell(row.name, row.runnerId),
          cell(row.birthYear),
          clubCell(row.club, row.clubSlug),
          cell(row.time),
        ]);
      return {
        tables: [
          { title: t("men"), columns, rows: toRows(men) },
          { title: t("women"), columns, rows: toRows(women) },
        ],
      };
    }
    case "vek": {
      const rows = await getAgeRecords();
      return {
        tables: [
          {
            columns: [
              t("colAge"),
              t("menYear"),
              t("men"),
              t("menTime"),
              t("womenYear"),
              t("women"),
              t("womenTime"),
            ],
            rows: rows.map((row) => [
              cell(String(row.age)),
              cell(row.menYear ? String(row.menYear) : ""),
              cell(row.menName ?? "", row.menId),
              cell(row.menTime ?? ""),
              cell(row.womenYear ? String(row.womenYear) : ""),
              cell(row.womenName ?? "", row.womenId),
              cell(row.womenTime ?? ""),
            ]),
          },
        ],
      };
    }
    case "veterani": {
      const { men, women } = await getVeteranClub();
      const columns = [
        t("colRank"),
        t("colName"),
        t("colBirth"),
        t("colStarts"),
        t("colRecord"),
        t("colAverage"),
      ];
      const toRows = (list: typeof men) =>
        list.map((row) => [
          cell(String(row.rank)),
          cell(row.name, row.runnerId),
          cell(row.birthYear),
          cell(String(row.starts)),
          cell(row.record),
          cell(row.average),
        ]);
      return {
        tables: [
          { title: t("men"), columns, rows: toRows(men) },
          { title: t("women"), columns, rows: toRows(women) },
        ],
      };
    }
    case "staty": {
      const stats = await getNationalityStats();
      if (stats.countries.length === 0) {
        return { tables: [] };
      }
      const countryRows: StatsCellData[][] = stats.countries.map((row) => [
        { text: `${countryName(row.code, locale)} (${row.code})`, flag: row.code },
        cell(String(row.runners)),
        cell(String(row.starts)),
        cell(
          row.firstYear === row.lastYear
            ? String(row.firstYear)
            : `${row.firstYear}–${row.lastYear}`,
        ),
        cell(row.best.time > 0 ? formatRaceTime(row.best.time) : ""),
        cell(stats.names.get(row.best.runnerId) ?? row.best.runnerId, row.best.runnerId),
      ]);
      if (stats.unknownRunners > 0) {
        countryRows.push([cell(t("staty.unknown")), cell(String(stats.unknownRunners))]);
      }
      return {
        tables: [
          {
            title: t("staty.byCountry"),
            columns: [
              t("staty.colCountry"),
              t("staty.colRunners"),
              t("colStarts"),
              t("staty.colYears"),
              t("colBest"),
              t("colName"),
            ],
            rows: countryRows,
          },
          {
            title: t("staty.byYear"),
            columns: [
              t("colYear"),
              t("staty.colCountries"),
              t("staty.colForeign"),
              t("staty.colUnknown"),
            ],
            rows: stats.years
              .filter((row) => row.countries > 0)
              .map((row) => [
                cell(String(row.year)),
                cell(String(row.countries)),
                cell(String(row.foreign)),
                cell(String(row.unknown)),
              ]),
          },
        ],
      };
    }
    case "ucast": {
      const rows = await getAttendance();
      const tableRows = [...rows].sort((a, b) => b.year - a.year);
      return {
        chart: rows.map((row) => ({ year: row.year, men: row.men, women: row.women })),
        chartCaption: t("chartCaption"),
        tables: [
          {
            columns: [
              t("colYear"),
              t("colCount"),
              t("colNewcomers"),
              t("colPrs"),
              t("colBest"),
              t("colAverage"),
            ],
            rows: tableRows.map((row) => [
              cell(String(row.year)),
              cell(String(row.count)),
              cell(String(row.newcomers)),
              cell(String(row.personalRecords)),
              cell(row.best),
              cell(row.average),
            ]),
          },
        ],
      };
    }
  }
}
