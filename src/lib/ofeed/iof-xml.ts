/**
 * IOF XML 3.0 ResultList z našich dat (#122) – čistá funkce bez DB.
 *
 * - třída = kategorie (`Class/Id` = id kategorie, `Name` = název);
 * - závodník: `Person/Id[@type=MCVV]` = `cis_bezec.id` (OFeed podle něj páruje závodníky mezi uploady),
 *   `Name` z „Příjmení Jméno“, `BibNumber` = startovní číslo, `StartTime` = individuální start;
 * - mezičasy `SplitTime/ControlCode` = kód splitu (1 = 1,3 km, 3 = 2,7 km), `Time` v sekundách;
 * - cíl (split 9): `FinishTime`, `Time`, `Status=OK`; jinak `Active` po startu, `Inactive` před ním.
 *
 * OFeed při každém uploadu nahradí mezičasy závodníka celé, proto ResultList obsahuje vždy
 * kompletní stav a posílá ho jen server webu (jeden zapisovatel).
 */

export const IOF_NAMESPACE = "http://www.orienteering.org/datastandard/3.0";

export type IofCompetitor = {
  runnerId: string;
  /** „Příjmení Jméno“ (legacy pořadí). */
  name: string;
  clubId: string | null;
  clubName: string | null;
  bib: number;
  startTime: Date;
  /** kód splitu → sekundy od startu (bez cíle). */
  splits: Record<string, number>;
  /** Cílový čas v sekundách od startu (split 9), nebo null. */
  finishS: number | null;
};

export type IofClass = {
  id: string;
  name: string;
  sex?: "M" | "F";
  competitors: IofCompetitor[];
};

export type ResultListInput = {
  eventId: string;
  eventName: string;
  /** Nula závodu (datum a čas akce). */
  eventStart: Date;
  classes: IofClass[];
  /** Pořadí kontrol (mezičasů) na trati. */
  splitCodes: string[];
  createTime: Date;
  /** „Teď“ pro odvození stavu Active / Inactive. */
  now: Date;
  timeZone?: string;
  creator?: string;
};

export function escapeXml(value: string): string {
  return (
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
      // znaky, které XML 1.0 nepovoluje
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  );
}

/** `YYYY-MM-DDTHH:mm:ss+01:00` v dané zóně (OFeed vyžaduje offset, ofeed#116). */
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

/** „Příjmení Jméno Druhé“ → Family „Příjmení“, Given „Jméno Druhé“. */
export function splitName(name: string): { family: string; given: string } {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const space = trimmed.indexOf(" ");
  if (space === -1) return { family: trimmed || "?", given: "-" };
  return { family: trimmed.slice(0, space), given: trimmed.slice(space + 1) };
}

/** 5. znak `cis_bezec.id`: 0–4 muž, 5–9 žena. */
export function sexFromRunnerId(runnerId: string): "M" | "F" | undefined {
  const digit = Number(runnerId.charAt(4));
  if (!/^\d{8}$/.test(runnerId) || Number.isNaN(digit)) return undefined;
  return digit > 4 ? "F" : "M";
}

export type IofStatus = "OK" | "Active" | "Inactive";

export function competitorStatus(competitor: IofCompetitor, now: Date): IofStatus {
  if (competitor.finishS !== null) return "OK";
  if (Object.keys(competitor.splits).length > 0) return "Active";
  return now.getTime() >= competitor.startTime.getTime() ? "Active" : "Inactive";
}

function el(name: string, value: string | number, attrs = ""): string {
  return `<${name}${attrs}>${escapeXml(String(value))}</${name}>`;
}

function personResult(
  competitor: IofCompetitor,
  input: ResultListInput,
  year: number,
  indent: string,
): string {
  const tz = input.timeZone ?? "Europe/Prague";
  const { family, given } = splitName(competitor.name);
  const sex = sexFromRunnerId(competitor.runnerId);
  const status = competitorStatus(competitor, input.now);
  const lines: string[] = [];
  const i2 = `${indent}  `;
  const i3 = `${indent}    `;
  lines.push(`${indent}<PersonResult>`);
  lines.push(`${i2}${el("EntryId", `${year}-${competitor.bib}`)}`);
  lines.push(`${i2}<Person${sex ? ` sex="${sex}"` : ""}>`);
  lines.push(`${i3}${el("Id", competitor.runnerId, ' type="MCVV"')}`);
  lines.push(`${i3}<Name>${el("Family", family)}${el("Given", given)}</Name>`);
  lines.push(`${i2}</Person>`);
  if (competitor.clubId && competitor.clubId !== "000") {
    lines.push(
      `${i2}<Organisation>${el("Id", competitor.clubId)}${el("Name", competitor.clubName || competitor.clubId)}${el("ShortName", competitor.clubId)}</Organisation>`,
    );
  }
  lines.push(`${i2}<Result>`);
  lines.push(`${i3}${el("BibNumber", competitor.bib)}`);
  lines.push(`${i3}${el("StartTime", isoWithOffset(competitor.startTime, tz))}`);
  if (competitor.finishS !== null) {
    const finish = new Date(competitor.startTime.getTime() + competitor.finishS * 1000);
    lines.push(`${i3}${el("FinishTime", isoWithOffset(finish, tz))}`);
    lines.push(`${i3}${el("Time", competitor.finishS)}`);
  }
  lines.push(`${i3}${el("Status", status)}`);
  for (const code of input.splitCodes) {
    const time = competitor.splits[code];
    if (time === undefined) continue;
    lines.push(`${i3}<SplitTime>${el("ControlCode", code)}${el("Time", time)}</SplitTime>`);
  }
  lines.push(`${i3}${el("ControlCard", competitor.bib)}`);
  lines.push(`${i2}</Result>`);
  lines.push(`${indent}</PersonResult>`);
  return lines.join("\n");
}

export function buildResultListXml(input: ResultListInput): string {
  const tz = input.timeZone ?? "Europe/Prague";
  const year = Number(isoWithOffset(input.eventStart, tz).slice(0, 4));
  const eventStartIso = isoWithOffset(input.eventStart, tz);
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(
    `<ResultList xmlns="${IOF_NAMESPACE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" iofVersion="3.0" createTime="${isoWithOffset(input.createTime, tz)}" creator="${escapeXml(input.creator ?? "mcvv.org")}" status="Snapshot">`,
  );
  out.push("  <Event>");
  out.push(`    ${el("Id", input.eventId)}`);
  out.push(`    ${el("Name", input.eventName)}`);
  out.push(
    `    <StartTime>${el("Date", eventStartIso.slice(0, 10))}${el("Time", eventStartIso.slice(11))}</StartTime>`,
  );
  out.push("  </Event>");
  for (const cls of input.classes) {
    if (cls.competitors.length === 0) continue;
    out.push("  <ClassResult>");
    out.push(
      `    <Class${cls.sex ? ` sex="${cls.sex}"` : ""}>${el("Id", cls.id)}${el("Name", cls.name)}</Class>`,
    );
    const sorted = [...cls.competitors].sort((a, b) => a.bib - b.bib);
    for (const competitor of sorted) {
      out.push(personResult(competitor, input, year, "    "));
    }
    out.push("  </ClassResult>");
  }
  out.push("</ResultList>");
  return out.join("\n") + "\n";
}

/** Otisk obsahu bez `createTime` – mění se jen při změně dat nebo stavu závodníků. */
export function contentFingerprintSource(xml: string): string {
  return xml.replace(/ createTime="[^"]*"/, "");
}
