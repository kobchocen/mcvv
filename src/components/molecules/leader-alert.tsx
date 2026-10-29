"use client";

import { useTranslations } from "next-intl";

import type { LeaderAlert } from "@/lib/live/leader-core";
import { formatMinutes, type PointKey } from "@/lib/live/speaker-core";

import s from "./leader-alert.module.css";

export const leaderStyles = s;

/** Třídy boxu kategorie: zlatý rámeček + pulz (A/B podle `seq` = restart animace). */
export function leaderBoxClass(alert: LeaderAlert | undefined, nowMs: number): string {
  if (!alert) return "";
  if (nowMs >= alert.pulseUntil) return s.lead;
  const ab = alert.seq % 2 ? "A" : "B";
  return `${s.lead} ${alert.point === "fin" ? s[`fin${ab}`] : s[`split${ab}`]}`;
}

function usePointName() {
  const t = useTranslations("Leader");
  return (k: PointKey) => (k === "m1" ? t("m1") : k === "m2" ? t("m2") : t("fin"));
}

/** Štítek v nadpisu kategorie: „★ NOVÝ LÍDR“ (cíl) / „★ LÍDR M1“. */
export function LeaderChip({ alert }: Readonly<{ alert: LeaderAlert }>) {
  const t = useTranslations("Leader");
  const point = usePointName();
  return (
    <span className={s.chip}>
      ★ {alert.point === "fin" ? t("chipFin") : t("chipSplit", { point: point(alert.point) })}
    </span>
  );
}

/** Banner dole v boxu kategorie: kdo, čas, a koho předstihl (nejvýš 2 řádky). */
export function LeaderBanner({ alert }: Readonly<{ alert: LeaderAlert }>) {
  const t = useTranslations("Leader");
  const point = usePointName();
  return (
    <div className={s.banner} role="status" aria-live="polite">
      {alert.lines.map((l) => {
        const fin = l.point === "fin";
        const where = fin ? t("atFin") : t("atSplit", { point: point(l.point) });
        return (
          <div key={`${l.point}-${l.leader.bib}`} className={`${s.line} ${fin ? "" : s.split}`}>
            <span className={s.lchip}>
              ★ {l.previous ? t("newLeader", { where }) : t("first", { where })}
            </span>
            <span className={s.bib}>{l.leader.bib}</span>
            <span className={s.name}>{l.leader.name}</span>
            <span className={s.time}>{formatMinutes(l.leader.time)}</span>
            <div className={s.sub}>
              {l.late ? <span className={s.late}>{t("late")} · </span> : null}
              {l.previous ? (
                <>
                  {t("before")} <b>{l.previous.bib}</b> {l.previous.name}{" "}
                  <b>{formatMinutes(l.previous.time)}</b> ·{" "}
                  {t.rich("faster", {
                    diff: formatMinutes(l.previous.time - l.leader.time),
                    b: (chunks) => <b>{chunks}</b>,
                  })}
                </>
              ) : (
                t("onlyTime", { where: fin ? t("finLoc") : point(l.point) })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
