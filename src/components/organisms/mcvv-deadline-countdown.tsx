"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { remainingParts } from "@/lib/date/race-schedule";

function subscribeToClock(onStoreChange: () => void) {
  const id = window.setInterval(onStoreChange, 1000);
  return () => window.clearInterval(id);
}

function getClockSnapshot() {
  return Math.floor(Date.now() / 1000);
}

function getServerClockSnapshot() {
  return 0;
}

export function McvvDeadlineCountdown({ targetMs }: { targetMs: number }) {
  const t = useTranslations("Home.hero");
  const epochSec = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot);
  const nowMs = epochSec > 0 ? epochSec * 1000 : null;
  if (nowMs !== null && nowMs >= targetMs) {
    return null;
  }
  const parts = nowMs !== null ? remainingParts(new Date(targetMs), new Date(nowMs)) : null;
  if (!parts) {
    return null;
  }
  const totalHours = parts.days * 24 + parts.hours;
  const label =
    totalHours < 48
      ? t("closesInHours", { hours: totalHours, minutes: parts.minutes })
      : t("closesInDays", { days: parts.days });
  return (
    <p className="mt-4 text-sm text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.65)]">{label}</p>
  );
}
