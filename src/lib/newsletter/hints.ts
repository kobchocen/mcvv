import { NEWSLETTER_YEAR_OPTIONS } from "@/components/organisms/mcvv-admin-newsletter-form";

import { loadAudience, loadCurrentEntrants } from "./store";

export type AudienceHints = {
  users: number;
  years: Record<number, number>;
  /** Current edition year and number of unique emails registered for it. */
  currentEntrants: { year: number; count: number };
};

export async function audienceHints(): Promise<AudienceHints> {
  const users = await loadAudience({ users: true, years: 0 });
  const years: Record<number, number> = {};
  for (const option of NEWSLETTER_YEAR_OPTIONS.filter((y) => y > 0)) {
    years[option] = (await loadAudience({ users: false, years: option })).legacy;
  }
  const entrants = await loadCurrentEntrants();
  return {
    users: users.users,
    years,
    currentEntrants: { year: entrants.year, count: entrants.emails.size },
  };
}
