"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { RegistrationTimelineData } from "@/lib/admin/registration-timeline-data";
import {
  chartRows,
  chartStartDay,
  dateBeforeRace,
  formatYearRanges,
  type ChartRow,
  type TimelineMetric,
  type YearSeries,
} from "@/lib/admin/registration-timeline";
import { cn } from "@/lib/utils";

const OLDER_COLORS = [
  "#5b8fbf",
  "#7fa35a",
  "#b5895a",
  "#9a77b5",
  "#4fa3a0",
  "#b56f8a",
  "#a3a04f",
  "#6f7fb5",
  "#8c8c8c",
];

function yearColor(year: number, currentYear: number): string {
  if (year === currentYear) return "var(--race-accent)";
  if (year === currentYear - 1) return "var(--race-muted)";
  return OLDER_COLORS[(currentYear - year) % OLDER_COLORS.length];
}

function defaultSelection(data: RegistrationTimelineData, count = 5): number[] {
  const previous = data.series
    .map((row) => row.year)
    .filter((year) => year < data.currentYear && !data.anomalousYears.includes(year))
    .sort((a, b) => b - a)
    .slice(0, count);
  return [data.currentYear, ...previous];
}

function formatDate(key: string, locale: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function McvvAdminRegistrationTimeline({ data }: { data: RegistrationTimelineData }) {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const [metric, setMetric] = useState<TimelineMetric>("runners");
  const [selected, setSelected] = useState<number[]>(() => defaultSelection(data));

  const allYears = useMemo(
    () => data.series.map((row) => row.year).sort((a, b) => b - a),
    [data.series],
  );
  const visible = useMemo(
    () => data.series.filter((row) => selected.includes(row.year)).sort((a, b) => a.year - b.year),
    [data.series, selected],
  );
  const current = data.series.find((row) => row.year === data.currentYear);
  const summary = data.metrics[metric];
  const startDay = chartStartDay(visible);
  const rows = useMemo(
    () =>
      chartRows(
        visible,
        metric,
        startDay,
        { year: data.currentYear, day: data.currentDay },
        selected.includes(data.currentYear) ? summary.projection : [],
      ),
    [visible, metric, startDay, data.currentYear, data.currentDay, selected, summary.projection],
  );

  const config: ChartConfig = Object.fromEntries(
    visible.map((row) => [
      `y${row.year}`,
      { label: String(row.year), color: yearColor(row.year, data.currentYear) },
    ]),
  );
  const unit = metric === "runners" ? t("timelineUnitRunners") : t("timelineUnitRegs");
  const toggle = (year: number) =>
    setSelected((list) =>
      list.includes(year) ? list.filter((item) => item !== year) : [...list, year],
    );
  const quick = (count: number | null) =>
    setSelected(count === null ? [...allYears] : defaultSelection(data, count));

  const afterRace = data.series.filter((row) => row.afterRace > 0);
  const missingCreated = data.series.filter((row) => row.missingCreated > 0);
  const deadlineDay = current?.deadlineDay ?? null;
  const prediction = summary.prediction;
  const comparison = summary.comparison;

  return (
    <details open className="mt-6 min-w-0 border border-race-line bg-race-surface">
      <summary className="cursor-pointer px-4 py-3 font-display text-lg font-semibold">
        {t("timelineTitle")}
      </summary>
      <div className="grid min-w-0 gap-4 px-4 pb-4 [&>*]:min-w-0">
        {comparison ? (
          <p className="text-sm">
            <strong>
              {t("timelineToday", {
                days: comparison.day,
                count: comparison.current,
                unit,
              })}
            </strong>
            {comparison.lastYear
              ? ` ${t("timelineLastYear", {
                  value: comparison.lastYear.value,
                  diff:
                    comparison.lastYear.diffPct === null
                      ? "–"
                      : `${comparison.lastYear.diffPct > 0 ? "+" : ""}${comparison.lastYear.diffPct} %`,
                })}`
              : null}
            {comparison.average !== null
              ? ` ${t("timelineAverage", {
                  count: data.referenceYears.length,
                  value: comparison.average,
                })}`
              : null}
          </p>
        ) : null}
        {prediction ? (
          <p className="text-sm">
            {t("timelinePrediction", {
              point: prediction.point,
              min: prediction.min,
              max: prediction.max,
              unit,
            })}
            {!prediction.reliable ? (
              <span className="ml-2 rounded-full border border-amber-600/40 bg-amber-600/10 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-300">
                {t("timelineUnreliable")}
              </span>
            ) : null}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-sm" role="group">
          {(["runners", "registrations"] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={metric === key}
              onClick={() => setMetric(key)}
              className={cn(
                "h-8 border px-3",
                metric === key
                  ? "border-race-accent bg-race-accent text-white"
                  : "border-race-line hover:bg-race-forest",
              )}
            >
              {key === "runners" ? t("timelineMetricRunners") : t("timelineMetricRegs")}
            </button>
          ))}
        </div>

        <ChartContainer
          config={config}
          className="aspect-auto h-64 w-full min-w-0 sm:h-80"
          aria-label={t("timelineTitle")}
        >
          <ComposedChart data={rows} margin={{ top: 16, right: 12, bottom: 4, left: -12 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="day"
              type="number"
              domain={[-startDay, 0]}
              ticks={Array.from({ length: startDay / 10 + 1 }, (_, i) => -startDay + i * 10)}
              tickFormatter={(value: number) => (value === 0 ? "0" : `−${-value}`)}
              tickLine={false}
              axisLine={false}
            />
            <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={false} />
            <ChartTooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={(props) => {
                const activeRow = props.active
                  ? rows.find((row) => row.day === Number(props.label))
                  : undefined;
                return activeRow ? (
                  <TimelineTooltip
                    row={activeRow}
                    series={visible}
                    currentYear={data.currentYear}
                    locale={locale}
                    dayLabel={t("timelineTooltipDay", { days: -activeRow.day })}
                    forecastLabel={t("timelineForecast")}
                  />
                ) : null;
              }}
            />
            {deadlineDay !== null && deadlineDay <= startDay ? (
              <ReferenceLine
                x={-deadlineDay}
                stroke="var(--race-dim)"
                strokeDasharray="2 4"
                label={{
                  value: t("timelineDeadline"),
                  position: "insideTopRight",
                  fontSize: 11,
                  fill: "var(--race-dim)",
                }}
              />
            ) : null}
            {data.currentDay !== null && data.currentDay <= startDay ? (
              <ReferenceLine
                x={-data.currentDay}
                stroke="var(--race-accent)"
                strokeOpacity={0.6}
                label={{
                  value: t("timelineTodayMark"),
                  position: "insideTopLeft",
                  fontSize: 11,
                  fill: "var(--race-accent)",
                }}
              />
            ) : null}
            <Area
              dataKey="forecastRange"
              stroke="none"
              fill="var(--race-accent)"
              fillOpacity={0.12}
              isAnimationActive={false}
              connectNulls={false}
            />
            {visible.map((row) => (
              <Line
                key={row.year}
                dataKey={`y${row.year}`}
                type="monotone"
                stroke={yearColor(row.year, data.currentYear)}
                strokeWidth={
                  row.year === data.currentYear ? 3 : row.year === data.currentYear - 1 ? 2 : 1.5
                }
                strokeOpacity={row.year >= data.currentYear - 1 ? 1 : 0.75}
                dot={false}
                activeDot={{ r: row.year === data.currentYear ? 4 : 3 }}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
            <Line
              dataKey="forecast"
              type="monotone"
              stroke="var(--race-accent)"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartContainer>

        <div>
          <div className="flex gap-2 overflow-x-auto pb-1 text-sm">
            {allYears.map((year) => {
              const on = selected.includes(year);
              return (
                <button
                  key={year}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(year)}
                  className={cn(
                    "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3",
                    on ? "border-race-line bg-race-forest" : "border-race-line/50 text-race-dim",
                  )}
                >
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{
                      background: on ? yearColor(year, data.currentYear) : "transparent",
                      border: `1px solid ${yearColor(year, data.currentYear)}`,
                    }}
                  />
                  {year}
                  {data.anomalousYears.includes(year) ? ` (${t("timelineCovid")})` : ""}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-race-muted">
            <button type="button" className="hover:text-foreground" onClick={() => quick(5)}>
              {t("timelineLast", { count: 5 })}
            </button>
            <button type="button" className="hover:text-foreground" onClick={() => quick(10)}>
              {t("timelineLast", { count: 10 })}
            </button>
            <button type="button" className="hover:text-foreground" onClick={() => quick(null)}>
              {t("timelineAll")}
            </button>
            {summary.projection.length > 0 ? (
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block w-5 border-t-2 border-dashed border-race-accent"
                />
                {t("timelineForecastLegend")}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-1 text-xs text-race-muted">
          <p>{t("timelineMethod", { years: data.referenceYears.join(", ") || "–" })}</p>
          <p>{t("timelineDataNote")}</p>
          {data.missingYears.length > 0 ? (
            <p>{t("timelineMissing", { years: formatYearRanges(data.missingYears) })}</p>
          ) : null}
          {afterRace.map((row) => (
            <p key={`a${row.year}`}>
              {t("timelineAfterRace", { year: row.year, count: row.afterRace })}
            </p>
          ))}
          {missingCreated.map((row) => (
            <p key={`m${row.year}`}>
              {t("timelineNoCreated", { year: row.year, count: row.missingCreated })}
            </p>
          ))}
        </div>
      </div>
    </details>
  );
}

function TimelineTooltip({
  row,
  series,
  currentYear,
  locale,
  dayLabel,
  forecastLabel,
}: {
  row: ChartRow;
  series: readonly YearSeries[];
  currentYear: number;
  locale: string;
  dayLabel: string;
  forecastLabel: string;
}) {
  const days = -row.day;
  const items = [...series].sort((a, b) => b.year - a.year);
  return (
    <div className="grid min-w-[11rem] gap-1 rounded-lg border border-race-line bg-race-surface px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{dayLabel}</div>
      {row.forecast !== undefined ? (
        <div className="flex justify-between gap-3 text-race-accent">
          <span>{forecastLabel}</span>
          <span className="font-mono">
            {row.forecast}
            {row.forecastRange ? ` (${row.forecastRange[0]}–${row.forecastRange[1]})` : ""}
          </span>
        </div>
      ) : null}
      {items.map((item) => {
        const value = row[`y${item.year}`];
        if (value === null || value === undefined) return null;
        return (
          <div key={item.year} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: yearColor(item.year, currentYear) }}
              />
              <span className={item.year === currentYear ? "font-semibold" : undefined}>
                {item.year}
              </span>
              <span className="text-race-dim">
                {formatDate(dateBeforeRace(item.raceDate, days), locale)}
              </span>
            </span>
            <span className="font-mono font-medium">{value}</span>
          </div>
        );
      })}
    </div>
  );
}
