import type { Slot } from "@/lib/slots/core";

const CS_ON_WEEKDAY = [
  "v neděli",
  "v pondělí",
  "v úterý",
  "ve středu",
  "ve čtvrtek",
  "v pátek",
  "v sobotu",
];
/** Hodiny, před kterými se v češtině píše „ve“ (ve dvě, ve tři, ve dvanáct, ve 23:59…). */
const CS_VE_HOURS = new Set([2, 3, 4, 12, 13, 14, 20, 21, 22, 23]);

/**
 * Konec termínu pro text „… skončily ve středu 2. 12. ve 23:59“ (`to` je výlučný → o minutu
 * dřív), v pražském čase.
 */
export function termEndLabel(slot: Pick<Slot, "to"> | undefined, locale: string): string | null {
  if (!slot) return null;
  const end = new Date(slot.to.getTime() - 60_000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Europe/Prague",
    })
      .formatToParts(end)
      .map((part) => [part.type, part.value]),
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const hour = Number(parts.hour);
  const time = `${hour}:${parts.minute}`;
  if (locale === "cs") {
    const at = CS_VE_HOURS.has(hour) ? "ve" : "v";
    return `${CS_ON_WEEKDAY[weekday]} ${Number(parts.day)}. ${Number(parts.month)}. ${at} ${time}`;
  }
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `on ${names[weekday]} ${Number(parts.day)}/${Number(parts.month)} at ${time}`;
}
