import type { Slot } from "@/lib/slots/core";
import { formatWeekdayDate, formatWeekdayDateTime } from "@/lib/format/date";

const CS_ON_WEEKDAY = [
  "v neděli",
  "v pondělí",
  "v úterý",
  "ve středu",
  "ve čtvrtek",
  "v pátek",
  "v sobotu",
];
/** "am Sonntag" / "w niedzielę" / "у неділю" – weekday phrases for de, pl and uk (#273). */
const ON_WEEKDAY: Record<string, { on: string[]; at: string }> = {
  de: {
    on: [
      "am Sonntag,",
      "am Montag,",
      "am Dienstag,",
      "am Mittwoch,",
      "am Donnerstag,",
      "am Freitag,",
      "am Samstag,",
    ],
    at: "um",
  },
  pl: {
    on: [
      "w niedzielę",
      "w poniedziałek",
      "we wtorek",
      "w środę",
      "w czwartek",
      "w piątek",
      "w sobotę",
    ],
    at: "o",
  },
  uk: {
    on: ["у неділю", "у понеділок", "у вівторок", "у середу", "у четвер", "у п’ятницю", "у суботу"],
    at: "о",
  },
};

/** Hodiny, před kterými se v češtině píše „ve“ (ve dvě, ve tři, ve dvanáct, ve 23:59…). */
const CS_VE_HOURS = new Set([2, 3, 4, 12, 13, 14, 20, 21, 22, 23]);

/**
 * Konec termínu pro text „… skončily ve středu 2. 12. ve 23:59“ (`to` je výlučný → o minutu
 * dřív), v pražském čase. `exact` = bez posunu („končí v sobotu 5. 12. v 18:00“).
 */
export function termEndLabel(
  slot: Pick<Slot, "to"> | undefined,
  locale: string,
  exact = false,
): string | null {
  if (!slot) return null;
  return dateTimeLabel(exact ? slot.to : new Date(slot.to.getTime() - 60_000), locale);
}

/**
 * „v sobotu 5. 12. v 18:00“ / „on Saturday 5/12 at 18:00“ / „am Samstag, 5.12. um 18:00“ /
 * „w sobotę 5.12. o 18:00“ / „у суботу 5.12. о 18:00“ v pražském čase.
 */
export function dateTimeLabel(d: Date, locale: string): string {
  const { weekday, day, month, hour, time } = pragueParts(d);
  if (locale === "cs") {
    const at = CS_VE_HOURS.has(hour) ? "ve" : "v";
    return `${CS_ON_WEEKDAY[weekday]} ${day}. ${month}. ${at} ${time}`;
  }
  const phrase = ON_WEEKDAY[locale];
  if (phrase) return `${phrase.on[weekday]} ${day}.${month}. ${phrase.at} ${time}`;
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `on ${names[weekday]} ${day}/${month} at ${time}`;
}

/** „v neděli 6. 12.“ / „on Sunday 6/12“ / „am Sonntag, 6.12.“ v pražském čase. */
export function dayLabel(d: Date, locale: string): string {
  const { weekday, day, month } = pragueParts(d);
  if (locale === "cs") return `${CS_ON_WEEKDAY[weekday]} ${day}. ${month}.`;
  const phrase = ON_WEEKDAY[locale];
  if (phrase) return `${phrase.on[weekday]} ${day}.${month}.`;
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `on ${names[weekday]} ${day}/${month}`;
}

/** „14:32“ v pražském čase. */
export function clockLabel(d: Date): string {
  return pragueParts(d).time;
}

/** Stejný pražský kalendářní den? */
export function samePragueDay(a: Date, b: Date): boolean {
  const x = pragueParts(a);
  const y = pragueParts(b);
  return x.year === y.year && x.month === y.month && x.day === y.day;
}

function pragueParts(d: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      year: "numeric",
      day: "numeric",
      month: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Europe/Prague",
    })
      .formatToParts(d)
      .map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  return {
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday),
    year: Number(parts.year),
    day: Number(parts.day),
    month: Number(parts.month),
    hour,
    time: `${hour}:${parts.minute}`,
  };
}

/**
 * Uzávěrka u přihlášky (Q396): pozdní přihláška ukazuje konec pozdního termínu z nastavení
 * termínů („sobota 5. 12. 2026 18:00“), ostatní běžnou uzávěrku online přihlášek (den v týdnu
 * a datum, Q406).
 */
export function entryDeadlineLabel(
  entry: { slot: string | null | undefined; deadline: Date | null | undefined },
  slots: Pick<Slot, "type" | "to">[],
  locale: string,
): string | null {
  if (entry.slot === "late") {
    const late = slots.find((slot) => slot.type === "late");
    if (late) return formatWeekdayDateTime(late.to, locale);
  }
  return entry.deadline ? formatWeekdayDate(entry.deadline, locale) : null;
}
