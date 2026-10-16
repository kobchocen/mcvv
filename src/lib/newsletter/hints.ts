import { NEWSLETTER_YEAR_OPTIONS } from "@/components/organisms/mcvv-admin-newsletter-form";

import { loadAudience } from "./store";

export async function audienceHints(): Promise<{ users: number; years: Record<number, number> }> {
  const users = await loadAudience({ users: true, years: 0 });
  const years: Record<number, number> = {};
  for (const option of NEWSLETTER_YEAR_OPTIONS.filter((y) => y > 0)) {
    years[option] = (await loadAudience({ users: false, years: option })).legacy;
  }
  return { users: users.users, years };
}
