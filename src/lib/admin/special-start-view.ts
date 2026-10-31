import { getTranslations } from "next-intl/server";

import type {
  McvvAdminSpecialStartCopy,
  McvvAdminSpecialStartValue,
} from "@/components/organisms/mcvv-admin-special-start";
import {
  checkSpecialStarts,
  formatOffset,
  SPECIAL_START_KINDS,
  type SpecialCheck,
  type SpecialStartKind,
} from "@/lib/race/special-start";
import { prisma } from "@/lib/db/client";
import { partnerOptionValue } from "@/lib/race/special-start-input";
import type { BibRange, ChampionBibs } from "@/lib/race/start-settings";
import type { StartModel } from "@/lib/race/start-time";
import type { AdminStartRow, SpecialStartRow } from "@/lib/race/startlist-load";

type Translate = Awaited<ReturnType<typeof getTranslations<"SpecialStart">>>;

/** Texty dialogu spec. startu (předávají se do klientské komponenty). */
export function specialStartCopy(t: Translate): McvvAdminSpecialStartCopy {
  const kinds = {} as Record<SpecialStartKind, string>;
  const kindHints = {} as Record<SpecialStartKind, string>;
  for (const kind of SPECIAL_START_KINDS) {
    kinds[kind] = t(`kind_${kind}`);
    kindHints[kind] = t(`hint_${kind}`);
  }
  return {
    add: t("add"),
    edit: t("edit"),
    title: t("title"),
    description: t("description"),
    kinds,
    kindHints,
    partner: t("partner"),
    partnerHint: t("partnerHint"),
    offset: t("offset"),
    offsetHint: t("offsetHint"),
    note: t("note"),
    noteHint: t("noteHint"),
    save: t("save"),
    clear: t("clear"),
    cancel: t("cancel"),
  };
}

export type PartnerOption = { runnerId: string; value: string };

/** Nabídka našeptávače „spolu s“: všichni přihlášení běžci ročníku (bez zrušených), podle jména. */
export function partnerOptions(rows: AdminStartRow[]): PartnerOption[] {
  return rows
    .filter((row) => !row.cancelled)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "cs"))
    .map((row) => ({ runnerId: row.runnerId, value: partnerOptionValue(row) }));
}

/** Hodnota pro dialog z uloženého spec. startu. */
export function specialStartValue(
  special: SpecialStartRow | null,
  optionById: Map<string, string>,
): McvvAdminSpecialStartValue | null {
  if (!special) {
    return null;
  }
  return {
    kind: special.kind,
    partnerLabel: special.partnerId
      ? (optionById.get(special.partnerId) ?? `[${special.partnerId}]`)
      : "",
    offset: special.kind === "with" ? formatOffset(special.offsetSeconds) : "0",
    note: special.note ?? "",
  };
}

/** Splněno / porušeno pro aktuální čísla ročníku (startovka, přehled spec. startů). */
export function specialStartChecks(
  model: StartModel,
  ranges: BibRange[],
  champions: ChampionBibs,
  rows: AdminStartRow[],
): Map<string, SpecialCheck> {
  const championBibs = new Set([champions.men, champions.women].filter((bib) => bib != null));
  return checkSpecialStarts(
    model,
    ranges,
    rows.map((row) => ({
      runnerId: row.runnerId,
      bib: row.bib,
      active: row.valid && !row.cancelled,
      exempt: row.organizer || (row.bib != null && championBibs.has(row.bib)),
      special: row.special,
    })),
  );
}

/** Text tooltipu ke stavu (✓ / ✗). */
export function specialCheckText(
  t: Translate,
  check: SpecialCheck,
  special: SpecialStartRow,
): string {
  if (check.ok) {
    return t("check_ok");
  }
  if (check.reason === "offset") {
    return t("check_offset", {
      actual: formatOffset(check.actualSeconds ?? 0),
      expected: formatOffset(special.offsetSeconds),
    });
  }
  return t(`check_${check.reason}`);
}

/** Partner a posun u „spolu s“: „s Novák Jan (+2:00)“; u ostatních typů null. */
export function specialStartPartnerText(
  t: Translate,
  special: SpecialStartRow,
  nameOf: (runnerId: string) => string | null,
): string | null {
  if (special.kind !== "with") {
    return null;
  }
  const partner = special.partnerId ? nameOf(special.partnerId) : null;
  return partner
    ? t("withPartner", { name: partner, offset: formatOffset(special.offsetSeconds) })
    : t("withMissing");
}

/** Nabídka našeptávače bez celé startovky (detail přihlášky): přihlášení běžci ročníku. */
export async function loadPartnerOptions(year: number): Promise<PartnerOption[]> {
  const lines = await prisma.registrationLine.findMany({
    where: { year },
    select: {
      runnerId: true,
      runner: { select: { name: true } },
      club: { select: { name: true } },
    },
  });
  return lines
    .map((line) => ({ runnerId: line.runnerId, name: line.runner.name, clubName: line.club.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"))
    .map((row) => ({ runnerId: row.runnerId, value: partnerOptionValue(row) }));
}

/** Hláška po uložení dialogu (`?spec=ulozeno|zruseno|chyba&duvod=…`). */
export function specialStartFlash(
  t: Translate,
  spec: string | undefined,
  reason: string | undefined,
): { ok: boolean; text: string } | null {
  if (spec === "ulozeno") {
    return { ok: true, text: t("saved") };
  }
  if (spec === "zruseno") {
    return { ok: true, text: t("cleared") };
  }
  if (spec === "chyba") {
    const known = ["kind", "partner", "self", "offset", "note", "line"] as const;
    const key = known.find((item) => item === reason) ?? "kind";
    return { ok: false, text: t(`err_${key}`) };
  }
  return null;
}

/** Stav odznaku: bez čísla je „čeká“ (šedá), jinak splněno / porušeno. */
export function specialCheckState(check: SpecialCheck): "ok" | "violated" | "pending" {
  if (check.ok) {
    return "ok";
  }
  return check.reason === "noBib" ? "pending" : "violated";
}
