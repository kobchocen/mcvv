import type { Locale } from "@/i18n/routing";
import { currentRaceYear } from "@/lib/entries/year";
import { loadStartSettings } from "@/lib/race/startlist-load";
import { startTimeForBib } from "@/lib/race/start-time";
import { getSiteSettings } from "@/lib/settings/site";

import { onsiteWindow } from "./defaults";
import { isPaidStatus } from "./late-core";
import { pragueClock, pragueDayLabel } from "./standard-pay-core";
import { dayLabel } from "./term-end";

export type LateBibCard = {
  runnerId: string;
  name: string;
  category: string;
  bib: number;
  start: string;
};

export type LateBibView = {
  cards: LateBibCard[];
  /** „v neděli 6. 12.“ / „on Sunday 6 December“ – výdej čísel v závodní kanceláři. */
  day: string;
  /** „9:00“ nebo null, když není nastaveno otevření kanceláře. */
  from: string | null;
};

/**
 * Moje přihláška (mockup d, varianta 1): zaplacená pozdní přihláška se zveřejněnou startovkou
 * → karty s číslem a časem startu. Jinak null (zůstává text „přidělíme při losování“).
 */
export async function loadLateBibView(
  entry: {
    year: number;
    status: number | null;
    lines: {
      runnerId: string;
      bib?: number | null;
      runner: { name: string };
      category: { name: string };
    }[];
  },
  locale: Locale,
): Promise<LateBibView | null> {
  if (!isPaidStatus(entry.status)) return null;
  const withBib = entry.lines.filter((line) => line.bib != null && line.bib > 0);
  if (withBib.length === 0 || withBib.length !== entry.lines.length) return null;
  const site = await getSiteSettings();
  if (!site.startlistPublished) return null;
  const [settings, race] = await Promise.all([loadStartSettings(entry.year), currentRaceYear()]);
  const cards = withBib.map((line) => ({
    runnerId: line.runnerId,
    name: line.runner.name,
    category: line.category.name,
    bib: line.bib as number,
    start: startTimeForBib(settings.model, line.bib as number),
  }));
  const office =
    race && race.raceDate
      ? onsiteWindow(race.raceDate, race.slotSettings.officeOpensS, race.slotSettings.onsiteUntilS)
      : null;
  const raceDate = race?.raceDate ?? null;
  if (!raceDate) return { cards, day: "", from: null };
  const day =
    locale !== "cs" && locale !== "en"
      ? dayLabel(raceDate, locale)
      : locale === "en"
        ? `on ${new Intl.DateTimeFormat("en-GB", {
            timeZone: "Europe/Prague",
            weekday: "long",
            day: "numeric",
            month: "long",
          }).format(raceDate)}`
        : pragueDayLabel(raceDate);
  return { cards, day, from: office ? pragueClock(office.from) : null };
}
