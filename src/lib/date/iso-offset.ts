/** `YYYY-MM-DDTHH:mm:ss+01:00` v dané zóně (civilní čas s offsetem, výchozí Europe/Prague). */
export function isoWithOffset(date: Date, timeZone = "Europe/Prague"): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const zone = get("timeZoneName").replace("GMT", "");
  const offset = zone === "" ? "+00:00" : zone.length === 3 ? `${zone}:00` : zone;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}${offset}`;
}
