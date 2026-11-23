"use client";

import { useTranslations } from "next-intl";

import { formatCountedList, leadMargin } from "@/lib/teams/format";
import type { TeamCompetition } from "@/lib/teams/scoring";
import type { TeamLeaderAlert } from "@/lib/teams/live-alerts";
import { Link } from "@/i18n/routing";

export function teamAlertText(
  t: (key: string, values?: Record<string, string | number>) => string,
  alert: TeamLeaderAlert,
): string {
  const margin =
    alert.margin?.kind === "points"
      ? t("marginPoints", { lead: alert.margin.lead })
      : alert.margin?.kind === "places"
        ? t("marginPlaces", { team: alert.margin.second })
        : t("marginPoints", { lead: 0 });
  if (alert.kind === "new") {
    return t("alertNew", { name: alert.runnerName, team: alert.team, margin });
  }
  if (alert.kind === "held") {
    return t("alertHeld", { name: alert.runnerName, team: alert.team, margin });
  }
  return t("alertMoved", { name: alert.runnerName, team: alert.team, rank: alert.rank });
}

export type McvvLiveTeamBlockProps = {
  competition: TeamCompetition;
  alert?: TeamLeaderAlert | null;
  /** Compact top-3 for the resultboard / speaker. */
  compact?: boolean;
  showPrize?: boolean;
  className?: string;
};

export function McvvLiveTeamBlock({
  competition,
  alert = null,
  compact = false,
  showPrize = false,
  className,
}: McvvLiveTeamBlockProps) {
  const t = useTranslations("Teams");
  const leader = competition.official[0];
  const margin = leadMargin(competition.official);
  const marginText =
    margin?.kind === "points"
      ? t("marginPoints", { lead: margin.lead })
      : margin?.kind === "places"
        ? t("marginPlaces", { team: margin.second })
        : null;
  const rows = compact ? competition.official.slice(0, 3) : competition.official;

  return (
    <section className={className} data-testid="live-teams" aria-labelledby="live-teams-title">
      <h2
        id="live-teams-title"
        style={{ margin: "0 0 0.5rem", fontSize: compact ? "1.1rem" : "1.4rem" }}
      >
        {t("title")}{" "}
        <small
          style={{
            marginLeft: "0.5rem",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {t("liveChip")}
        </small>
      </h2>
      {alert ? (
        <p
          data-testid="live-teams-alert"
          style={{
            margin: "0 0 0.6rem",
            padding: "0.45rem 0.7rem",
            borderLeft: "4px solid var(--race-accent, #e4572e)",
            fontWeight: 600,
          }}
        >
          {teamAlertText(t, alert)}
        </p>
      ) : null}
      {leader ? (
        <p style={{ margin: "0 0 0.6rem" }}>
          <strong>
            {leader.rank}. {leader.team}
          </strong>
          {" · "}
          {t("pointsAbbr", { points: leader.points })} ·{" "}
          {t("finishersAbbr", { count: leader.finishers })}
          {marginText ? ` · ${marginText}` : null}
        </p>
      ) : (
        <p style={{ margin: "0 0 0.6rem", opacity: 0.75 }}>—</p>
      )}
      {rows.length > 0 ? (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: compact ? "0.85rem" : "0.95rem",
          }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: "right", padding: "0.2rem 0.5rem" }}>{t("colRank")}</th>
              <th style={{ textAlign: "left", padding: "0.2rem 0.5rem" }}>{t("colTeam")}</th>
              <th style={{ textAlign: "right", padding: "0.2rem 0.5rem" }}>{t("colPoints")}</th>
              <th style={{ textAlign: "right", padding: "0.2rem 0.5rem" }}>{t("colFinishers")}</th>
              {compact ? null : (
                <th style={{ textAlign: "left", padding: "0.2rem 0.5rem" }}>{t("colCounted")}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.team}-${index}`}>
                <td style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>{row.rank}</td>
                <td style={{ padding: "0.25rem 0.5rem", fontWeight: 600 }}>{row.team}</td>
                <td style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>{row.points}</td>
                <td style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>{row.finishers}</td>
                {compact ? null : (
                  <td style={{ padding: "0.25rem 0.5rem", opacity: 0.85 }}>
                    {formatCountedList(row.counted)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {showPrize ? (
        <p style={{ margin: "0.8rem 0 0", fontSize: "0.85rem" }}>
          {t("prizeLive")}{" "}
          <Link href="/souteze-tymu" style={{ fontWeight: 600 }}>
            {t("rulesLink")}
          </Link>
        </p>
      ) : null}
    </section>
  );
}
