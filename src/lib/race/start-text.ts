import { formatStartClock } from "@/lib/date/race-schedule";

import type { StartModel } from "./start-time";

/**
 * Parametry veřejných textů o startu: čas nuly a interval z modelu ročníku, otevření závodní
 * kanceláře a konec přihlášek na místě z nastavení ročníku (výchozí 9:00 / 9:45).
 */
export type StartTextParams = {
  startTime: string;
  interval: string;
  officeOpens: string;
  onsiteUntil: string;
};

export function startTextParams(
  model: Pick<StartModel, "zeroSeconds" | "intervalSeconds">,
  raceDay: { officeOpensS: number; onsiteUntilS: number } = {
    officeOpensS: 9 * 3600,
    onsiteUntilS: 9 * 3600 + 45 * 60,
  },
) {
  return {
    startTime: formatStartClock(model.zeroSeconds),
    interval: String(model.intervalSeconds),
    officeOpens: formatStartClock(raceDay.officeOpensS),
    onsiteUntil: formatStartClock(raceDay.onsiteUntilS),
  } satisfies StartTextParams;
}

/**
 * Doplní `{startTime}` / `{interval}` (a další zadané klíče) do obsahu z `t.raw()` – texty
 * úvodní stránky a Rozpisu nesmí mít natvrdo 10:15 a 15 s. Neznámé `{…}` zůstávají beze změny.
 */
export function fillPlaceholders<T>(value: T, params: Readonly<Record<string, string>>): T {
  if (typeof value === "string") {
    return value.replace(/\{(\w+)\}/g, (whole, key: string) =>
      Object.hasOwn(params, key) ? (params[key] as string) : whole,
    ) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => fillPlaceholders(item, params)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, fillPlaceholders(item, params)]),
    ) as T;
  }
  return value;
}
