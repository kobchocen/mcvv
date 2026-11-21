"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireSection } from "@/lib/admin/access";
import { withSettingsAudit } from "@/lib/audit/settings-audit";
import { redirect } from "@/i18n/routing";
import { prisma } from "@/lib/db/client";
import { rosterHasBib } from "@/lib/race/roster";
import { parsePragueLocal } from "./admin-core";
import { saveAssignment } from "./assignment";
import { assignmentFromForm } from "./assignment-core";
import { clearSplits } from "./clear";
import { deleteManualSplit, setManualSplit } from "./manual";
import {
  clockToRaceTime,
  isManualSplit,
  isValidBib,
  parseExpected,
  parseRaceTime,
} from "./manual-core";
import {
  clearableSplits,
  clearBlocked,
  confirmationMatches,
  formatClearSource,
  parseClearFilter,
} from "./clear-core";
import { dismissConflict, resolveConflict } from "./ingest";
import {
  getRaceContext,
  getStations,
  LIVE_DNS_GRACE_FALLBACK_KEY,
  LIVE_DNS_GRACE_KEY,
  LIVE_START_OFFSET_LIMIT_KEY,
  LIVE_ZERO_OVERRIDE_KEY,
} from "./race-context";
import { parseStartOffsetLimit } from "./splits-screen-core";
import {
  RED_PHASE_MAX_S,
  STARTER_DNS_WINDOW_KEY,
  STARTER_RED_PHASE_KEY,
  STARTER_SOUND_KEY,
  STARTER_SOUND_MODES,
} from "./starter-core";
import {
  formatStations,
  LIVE_STATIONS_KEY,
  LIVE_STATIONS_MAX,
  parseStations,
  withStart,
} from "./stations";
import { getActiveTestRun } from "./test-run";

const PAGE = "/admin/den-zavodu/zive" as const;
const SPLITS_PAGE = "/admin/den-zavodu/zive/casy" as const;

async function back(
  query: Record<string, string | string[]>,
  pathname: typeof PAGE | typeof SPLITS_PAGE = PAGE,
): Promise<never> {
  const locale = await getLocale();
  revalidatePath("/[locale]/admin/den-zavodu/zive", "page");
  revalidatePath("/[locale]/admin/den-zavodu/zive/casy", "page");
  redirect({ href: { pathname, query }, locale });
  throw new Error("unreachable");
}

async function put(key: string, text: string) {
  await prisma.setting.upsert({ where: { key }, update: { text }, create: { key, text } });
}

/** Doba z formuláře (90, 2 min, 1:30 …) → sekundy do nastavení; prázdné pole klíč smaže. */
async function saveDuration(formData: FormData, field: string, key: string): Promise<void> {
  const raw = String(formData.get(field) ?? "")
    .slice(0, 32)
    .trim();
  if (!raw) {
    await prisma.setting.deleteMany({ where: { key } });
    return;
  }
  const seconds = parseStartOffsetLimit(raw);
  if (seconds === null) await back({ error: field });
  await put(key, String(seconds));
}

const RACE_SETUP_KEYS = [
  LIVE_STATIONS_KEY,
  LIVE_START_OFFSET_LIMIT_KEY,
  LIVE_DNS_GRACE_KEY,
  LIVE_DNS_GRACE_FALLBACK_KEY,
  LIVE_ZERO_OVERRIDE_KEY,
];

export async function saveRaceSetupAction(formData: FormData): Promise<void> {
  const session = await requireSection("raceControl.live", "write");
  // P7: audit změn (stanoviště, nula, prahy a lhůty DNS) i při návratu přesměrováním.
  await withSettingsAudit(session, "raceday.setup_changed", RACE_SETUP_KEYS, async () => {
    const stationsRaw = String(formData.get("stations") ?? "").slice(0, LIVE_STATIONS_MAX);
    await put(LIVE_STATIONS_KEY, formatStations(parseStations(stationsRaw)));
    // Práh odchylky na Startu (#187, Q80) a lhůty DNS online výsledků (Q113, Q114):
    // prázdné = výchozí hodnota (klíč se smaže).
    await saveDuration(formData, "startLimit", LIVE_START_OFFSET_LIMIT_KEY);
    await saveDuration(formData, "dnsGrace", LIVE_DNS_GRACE_KEY);
    await saveDuration(formData, "dnsGraceFallback", LIVE_DNS_GRACE_FALLBACK_KEY);
    // Během testovacího běhu (#186) drží zkušební nulu test – formulář ji nemění.
    if (await getActiveTestRun()) await back({ saved: "setup" });
    const zeroRaw = String(formData.get("zeroOverride") ?? "").trim();
    if (zeroRaw) {
      const zero = parsePragueLocal(zeroRaw);
      if (!zero) await back({ error: "zero" });
      await put(LIVE_ZERO_OVERRIDE_KEY, zero!.toISOString());
    } else {
      await prisma.setting.deleteMany({ where: { key: LIVE_ZERO_OVERRIDE_KEY } });
    }
    await back({ saved: "setup" });
  });
}

export async function resolveConflictAction(formData: FormData): Promise<void> {
  const session = await requireSection("raceControl.live", "write");
  const id = Number(formData.get("id"));
  const decision = String(formData.get("decision") ?? "");
  let result: string = "missing";
  if (Number.isInteger(id) && id > 0) {
    if (decision === "accept") result = await resolveConflict(id, session);
    else if (decision === "dismiss") result = await dismissConflict(id, session);
  }
  if (result === "stale") await back({ error: "conflictStale" });
  await back({ saved: "conflict" });
}

/**
 * Hromadné vyčištění mezičasů aktuálního ročníku (Q31: jen admin; Q32: zakázané od skutečné
 * nuly ročníku). Potvrzení = opsaný ročník. Maže mcvv_split i deník včetně konfliktů.
 */
export async function clearSplitsAction(formData: FormData): Promise<void> {
  const session = await requireSection("raceControl.live", "write");
  const [ctx, stations] = await Promise.all([getRaceContext(), getStations()]);
  const filter = parseClearFilter(
    {
      splits: formData.getAll("splits").map(String),
      source: String(formData.get("source") ?? "all"),
    },
    clearableSplits(stations),
  );
  if (!filter) await back({ error: "filter" }, SPLITS_PAGE);
  if (clearBlocked(new Date(), ctx.officialZero)) await back({ error: "blocked" }, SPLITS_PAGE);
  const query = { splits: filter!.splits, source: formatClearSource(filter!.source) };
  if (String(formData.get("year") ?? "") !== String(ctx.year)) {
    await back({ ...query, error: "year" }, SPLITS_PAGE);
  }
  if (!confirmationMatches(String(formData.get("confirmYear") ?? ""), ctx.year)) {
    await back({ ...query, preview: "1", error: "confirm" }, SPLITS_PAGE);
  }
  const result = await clearSplits(
    ctx.year,
    filter!,
    {
      clearZeroOverride: formData.get("clearZeroOverride") === "on",
    },
    session,
  );
  await back(
    {
      cleared: String(result.splitsTotal),
      entries: String(result.entries),
    },
    SPLITS_PAGE,
  );
}

/** Společné načtení formuláře ruční editace (číslo, split, očekávaná hodnota, důvod). */
async function manualForm(formData: FormData) {
  const session = await requireSection("raceControl.manual", "write");
  const [ctx, stations] = await Promise.all([getRaceContext(), getStations()]);
  const bib = Number(formData.get("bib"));
  const split = String(formData.get("split") ?? "");
  const expected = parseExpected(String(formData.get("expected") ?? ""));
  const reason = String(formData.get("reason") ?? "");
  const edit = Number.isInteger(bib) ? String(bib) : "";
  if (!isValidBib(bib)) await back({ error: "bib" }, SPLITS_PAGE);
  if (
    !isManualSplit(
      split,
      stations.map((s) => s.code),
    )
  ) {
    await back({ edit, error: "split" }, SPLITS_PAGE);
  }
  if (expected === undefined) await back({ edit, error: "changed" }, SPLITS_PAGE);
  if (String(formData.get("year") ?? "") !== String(ctx.year)) {
    await back({ edit, error: "year" }, SPLITS_PAGE);
  }
  return { session, ctx, bib, split, expected: expected!, reason, edit };
}

/**
 * Ruční zápis / přepis jednoho mezičasu (Q31: jen admin). Jde vždy, i v den závodu (Q32).
 * Čas od startu (`m:ss`, `h:mm:ss`) nebo denní čas průchodu (`hh:mm:ss`, režim `clock`).
 */
export async function setSplitAction(formData: FormData): Promise<void> {
  const { session, ctx, bib, split, expected, reason, edit } = await manualForm(formData);
  const raw = String(formData.get("value") ?? "");
  const time =
    formData.get("mode") === "clock"
      ? clockToRaceTime(raw, ctx.zero, bib, ctx.intervalS, ctx.secondStartFrom)
      : parseRaceTime(raw);
  if (time === null) await back({ edit, error: "time" }, SPLITS_PAGE);
  const known = await rosterHasBib(prisma, ctx.year, bib);
  if (!known && formData.get("force") !== "on") {
    await back({ edit, error: "unknownBib" }, SPLITS_PAGE);
  }
  const result = await setManualSplit({
    year: ctx.year,
    bib,
    split,
    time: time!,
    expected,
    reason,
    actor: session,
    plan: ctx,
  });
  if (!result.ok) await back({ edit, error: result.reason }, SPLITS_PAGE);
  await back({ edit, saved: result.ok ? result.action : "" }, SPLITS_PAGE);
}

/** Ruční smazání jednoho mezičasu (důvod povinný). */
export async function deleteSplitAction(formData: FormData): Promise<void> {
  const { session, ctx, bib, split, expected, reason, edit } = await manualForm(formData);
  const result = await deleteManualSplit({
    year: ctx.year,
    bib,
    split,
    expected,
    reason,
    actor: session,
  });
  if (!result.ok) await back({ edit, error: result.reason }, SPLITS_PAGE);
  await back({ edit, saved: "delete" }, SPLITS_PAGE);
}

/**
 * Přiřazení stanovišť splitmakerovi (jen admin), včetně stanoviště Start (#203).
 * Prázdný výběr = splitmaker nezapisuje nic.
 */
export async function saveSplitmakerStationsAction(formData: FormData): Promise<void> {
  const session = await requireSection("raceControl.live", "write");
  const userId = Number(formData.get("userId"));
  if (!Number.isInteger(userId) || userId < 1) await back({ error: "assignment" });
  const stations = withStart(await getStations());
  const value = assignmentFromForm(formData.getAll("stations").map(String), stations);
  const result = await saveAssignment(session, userId, value);
  if (result === "not_found") await back({ error: "assignment" });
  await back({ saved: "assignment" });
}

/**
 * Nastavení obrazovky startéra (jen admin): režim zvuku pro všechna zařízení, délka červené
 * fáze neoznačeného (0–120 s) a okno pruhu Nevyběhli (1 s – 6 h). Prázdné pole = výchozí.
 */
export async function saveStarterSettingsAction(formData: FormData): Promise<void> {
  const session = await requireSection("raceControl.live", "write");
  await withSettingsAudit(
    session,
    "raceday.starter_settings_changed",
    [STARTER_SOUND_KEY, STARTER_RED_PHASE_KEY, STARTER_DNS_WINDOW_KEY],
    async () => {
      const sound = String(formData.get("starterSound") ?? "");
      if (!(STARTER_SOUND_MODES as readonly string[]).includes(sound)) {
        await back({ error: "starterSound" });
      }
      const redRaw = String(formData.get("starterRedPhase") ?? "").trim();
      const red = redRaw === "" ? null : Number(redRaw);
      if (red !== null && !(Number.isInteger(red) && red >= 0 && red <= RED_PHASE_MAX_S)) {
        await back({ error: "starterRedPhase" });
      }
      const windowRaw = String(formData.get("starterDnsWindow") ?? "")
        .slice(0, 32)
        .trim();
      const windowS = windowRaw === "" ? null : parseStartOffsetLimit(windowRaw);
      if (windowRaw !== "" && windowS === null) await back({ error: "starterDnsWindow" });

      await put(STARTER_SOUND_KEY, sound);
      if (red === null) await prisma.setting.deleteMany({ where: { key: STARTER_RED_PHASE_KEY } });
      else await put(STARTER_RED_PHASE_KEY, String(red));
      if (windowS === null) {
        await prisma.setting.deleteMany({ where: { key: STARTER_DNS_WINDOW_KEY } });
      } else await put(STARTER_DNS_WINDOW_KEY, String(windowS));
      await back({ saved: "starter" });
    },
  );
}
