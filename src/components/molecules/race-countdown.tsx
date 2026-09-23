"use client";

import { useSyncExternalStore } from "react";

import { remainingParts, resolveRaceCountdown } from "@/lib/date/race-schedule";

export type RaceCountdownUnits = {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
};

export type RaceCountdownProps = {
  label: string;
  units: RaceCountdownUnits;
  inProgressLabel: string;
};

function formatUnit(value: number | null, pad: boolean): string {
  if (value === null) {
    return "—";
  }
  return pad ? String(value).padStart(2, "0") : String(value);
}

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

export function RaceCountdown({ label, units, inProgressLabel }: RaceCountdownProps) {
  const epochSec = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot);
  const now = epochSec > 0 ? new Date(epochSec * 1000) : null;

  const resolved = now ? resolveRaceCountdown(now) : null;
  const parts =
    now && resolved?.phase === "upcoming" && resolved.target
      ? remainingParts(resolved.target, now)
      : null;

  return (
    <div className="mt-8">
      <p className="font-display text-sm font-semibold uppercase text-race-muted">{label}</p>
      {resolved?.phase === "in-progress" ? (
        <p className="mt-3 font-display text-3xl font-bold text-race-accent">{inProgressLabel}</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              { value: parts?.days ?? null, unit: units.days, pad: false },
              { value: parts?.hours ?? null, unit: units.hours, pad: true },
              { value: parts?.minutes ?? null, unit: units.minutes, pad: true },
              { value: parts?.seconds ?? null, unit: units.seconds, pad: true },
            ] as const
          ).map((item) => (
            <div key={item.unit} className="border border-race-line/55 bg-race-surface p-4">
              <p className="font-display text-3xl font-bold text-foreground dark:text-white">
                {formatUnit(item.value, item.pad)}
              </p>
              <p className="mt-1 text-xs font-semibold uppercase text-race-dim">{item.unit}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
