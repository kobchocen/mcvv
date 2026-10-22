import { audienceFromData, type AudienceData } from "./core";
import { NEWSLETTER_YEAR_OPTIONS } from "./form-state";
import { loadAudienceData } from "./store";

export type AudienceHints = {
  users: number;
  years: Record<number, number>;
  /** Current edition year and number of unique emails registered for it. */
  currentEntrants: { year: number; count: number };
};

/** Nejdelší období, které nápovědy formuláře počítají. */
export const HINT_MAX_YEARS = Math.max(...NEWSLETTER_YEAR_OPTIONS);

/** Nápovědy počtů ve formuláři z jednou načtených dat (bez dalších dotazů). */
export function audienceHintsFromData(data: AudienceData, now = new Date()): AudienceHints {
  const users = audienceFromData(data, { users: true, years: 0 }, now);
  const years: Record<number, number> = {};
  for (const option of NEWSLETTER_YEAR_OPTIONS.filter((y) => y > 0)) {
    years[option] = audienceFromData(data, { users: false, years: option }, now).legacy;
  }
  const entrants = new Set(data.currentEntrants.emails);
  return {
    users: users.users,
    years,
    currentEntrants: { year: data.currentEntrants.year, count: entrants.size },
  };
}

export async function audienceHints(data?: AudienceData): Promise<AudienceHints> {
  return audienceHintsFromData(data ?? (await loadAudienceData(HINT_MAX_YEARS)));
}
