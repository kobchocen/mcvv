"use client";

import { useSyncExternalStore } from "react";

import { remainingParts } from "@/lib/date/race-schedule";

export type DeadlineCountdownUnits = {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
};

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

function formatUnit(value: number | null, pad: boolean): string {
  if (value === null) {
    return "—";
  }
  return pad ? String(value).padStart(2, "0") : String(value);
}

export function McvvDeadlineCountdown({
  targetMs,
  units,
}: {
  targetMs: number;
  units: DeadlineCountdownUnits;
}) {
  const epochSec = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot);
  const nowMs = epochSec > 0 ? epochSec * 1000 : null;
  if (nowMs !== null && nowMs >= targetMs) {
    return null;
  }
  const parts = nowMs !== null ? remainingParts(new Date(targetMs), new Date(nowMs)) : null;
  return (
    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {(
        [
          { value: parts?.days ?? null, unit: units.days, pad: false },
          { value: parts?.hours ?? null, unit: units.hours, pad: true },
          { value: parts?.minutes ?? null, unit: units.minutes, pad: true },
          { value: parts?.seconds ?? null, unit: units.seconds, pad: true },
        ] as const
      ).map((item) => (
        <div key={item.unit} className="border border-white/20 bg-black/20 px-3 py-2">
          <p className="font-display text-2xl font-bold text-white">
            {formatUnit(item.value, item.pad)}
          </p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
            {item.unit}
          </p>
        </div>
      ))}
    </div>
  );
}
