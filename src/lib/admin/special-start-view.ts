import { getTranslations } from "next-intl/server";

import type {
  McvvAdminSpecialStartCopy,
  McvvAdminSpecialStartValue,
} from "@/components/organisms/mcvv-admin-special-start";
import {
  checkSpecialStarts,
  formatOffset,
  SPECIAL_START_KINDS,
  specialRangeText,
  type SpecialCheck,
  type SpecialStartKind,
} from "@/lib/race/special-start";
import { prisma } from "@/lib/db/client";
import { ENTRY_STATUS } from "@/lib/entries/status";
import type { PartnerOption } from "@/lib/race/special-start-input";
import type { StartModel } from "@/lib/race/start-time";
import type { AdminStartRow, SpecialStartRow } from "@/lib/race/startlist-load";

type Translate = Awaited<ReturnType<typeof getTranslations<"SpecialStart">>>;

/** Šablona s `{proměnnými}` nevyplněná – doplní ji až klientská komponenta. */
function template(t: Translate, key: Parameters<Translate["raw"]>[0]): string {
  return String(t.raw(key));
}

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
    partner: {
      label: t("partner"),
      hint: t("partnerHint"),
      minChars: t("partnerMinChars"),
      noResults: t("partnerNoResults"),
      bib: template(t, "partnerBib"),
    },
    offset: t("offset"),
    offsetHint: template(t, "offsetHint"),
    offsetEarlier: template(t, "offsetEarlier"),
    offsetLater: template(t, "offsetLater"),
    offsetSteps: template(t, "offsetSteps"),
    offsetSame: t("offsetSame"),
    offsetErrFormat: t("err_offset"),
    offsetErrStep: template(t, "err_offsetStep"),
    offsetErrRange: t("err_offsetRange"),
    note: t("note"),
    noteHint: t("noteHint"),
    save: t("save"),
    clear: t("clear"),
    cancel: t("cancel"),
  };
}

function byName(a: PartnerOption, b: PartnerOption) {
  return a.name.localeCompare(b.name, "cs") || a.runnerId.localeCompare(b.runnerId);
}

/** Nabídka našeptávače „spolu s“: přihlášení běžci ročníku (bez zrušených), podle jména. */
export function partnerOptions(rows: AdminStartRow[]): PartnerOption[] {
  return rows
    .filter((row) => !row.cancelled)
    .map((row) => ({
      runnerId: row.runnerId,
      name: row.name,
      birthYear: row.birthYear,
      clubName: row.clubName,
      bib: row.bib,
    }))
    .sort(byName);
}

/** Hodnota pro dialog z uloženého spec. startu. */
export function specialStartValue(
  special: SpecialStartRow | null,
): McvvAdminSpecialStartValue | null {
  if (!special) {
    return null;
  }
  return {
    kind: special.kind,
    partnerId: special.kind === "with" ? special.partnerId : null,
    offset: special.kind === "with" ? formatOffset(special.offsetSeconds) : "0",
    note: special.note ?? "",
  };
}

/** Splněno / porušeno pro aktuální čísla ročníku (startovka, přehled spec. startů). */
export function specialStartChecks(
  model: StartModel,
  rows: AdminStartRow[],
): Map<string, SpecialCheck> {
  return checkSpecialStarts(
    model,
    rows.map((row) => ({
      runnerId: row.runnerId,
      bib: row.bib,
      active: row.valid && !row.cancelled,
      special: row.special,
    })),
  );
}

/** Text tooltipu ke stavu (✓ / ✗). */
export function specialCheckText(
  t: Translate,
  model: StartModel,
  check: SpecialCheck,
  special: SpecialStartRow,
): string {
  if (check.ok) {
    return t("check_ok");
  }
  if (check.reason === "range" && special.kind !== "with") {
    return t("check_range", { range: specialRangeText(model, special.kind) });
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
    where: {
      year,
      registration: { OR: [{ status: { not: ENTRY_STATUS.cancelled } }, { status: null }] },
    },
    select: {
      runnerId: true,
      bib: true,
      runner: { select: { name: true } },
      club: { select: { name: true } },
    },
  });
  return lines
    .map((line) => ({
      runnerId: line.runnerId,
      name: line.runner.name,
      birthYear: line.runnerId.slice(0, 4),
      clubName: line.club.name,
      bib: line.bib,
    }))
    .sort(byName);
}

/** Hláška po uložení dialogu (`?spec=ulozeno|zruseno|chyba&duvod=…`). */
export function specialStartFlash(
  t: Translate,
  spec: string | undefined,
  reason: string | undefined,
  intervalSeconds = 15,
): { ok: boolean; text: string } | null {
  if (spec === "ulozeno") {
    return { ok: true, text: t("saved") };
  }
  if (spec === "zruseno") {
    return { ok: true, text: t("cleared") };
  }
  if (spec === "chyba") {
    const known = [
      "kind",
      "partner",
      "self",
      "offset",
      "offsetStep",
      "offsetRange",
      "note",
      "line",
    ] as const;
    const key = known.find((item) => item === reason) ?? "kind";
    return {
      ok: false,
      text:
        key === "offsetStep" ? t("err_offsetStep", { interval: intervalSeconds }) : t(`err_${key}`),
    };
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
