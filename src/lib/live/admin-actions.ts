"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/routing";
import { requireAdmin } from "@/lib/admin/staff";
import { prisma } from "@/lib/db/client";
import { runOfeedPublish } from "@/lib/ofeed/publisher";
import {
  getOfeedSettings,
  parseEventId,
  parsePassword,
  parseProfile,
  saveOfeedSettings,
  switchOfeedProfile,
  type OfeedProfileInput,
} from "@/lib/ofeed/settings";

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
  LIVE_START_OFFSET_LIMIT_KEY,
  LIVE_ZERO_OVERRIDE_KEY,
} from "./race-context";
import { parseStartOffsetLimit } from "./splits-screen-core";
import {
  formatStations,
  LIVE_STATIONS_KEY,
  LIVE_STATIONS_MAX,
  parseStations,
  withStart,
} from "./stations";
import { getActiveTestRun, registerTestToken } from "./test-run";
import { createDeviceToken, revokeDeviceToken } from "./tokens";
import { normalizeAuthor, normalizeTokenSplits } from "./tokens-core";

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

/** Pole jednoho profilu z formuláře (`prefix` = "" pro ostrou akci, "test" pro testovací). */
async function ofeedProfileFromForm(
  formData: FormData,
  prefix: "" | "test",
): Promise<OfeedProfileInput> {
  const field = (name: string) =>
    prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name;
  const eventIdRaw = String(formData.get(field("eventId")) ?? "").trim();
  const eventId = eventIdRaw ? parseEventId(eventIdRaw) : null;
  if (eventIdRaw && !eventId) await back({ error: field("eventId") });
  const passwordRaw = String(formData.get(field("password")) ?? "");
  let password: string | null | undefined = undefined;
  if (formData.get(field("clearPassword")) === "on") password = null;
  else if (passwordRaw.trim()) {
    password = parsePassword(passwordRaw);
    if (!password) await back({ error: field("password") });
  }
  return { eventId, password };
}

export async function saveOfeedAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const live = await ofeedProfileFromForm(formData, "");
  const test = await ofeedProfileFromForm(formData, "test");
  await saveOfeedSettings({ enabled: formData.get("enabled") === "on", live, test });
  revalidatePath("/[locale]", "page");
  await back({ saved: "ofeed" });
}

/** Přepnutí testovací ↔ ostrá akce OFeed (Q33). Do testu jen s vyplněným ID testovací akce. */
export async function switchOfeedProfileAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const profile = parseProfile(String(formData.get("profile") ?? ""));
  if (!profile) await back({ error: "ofeedProfile" });
  if (profile === "test" && !(await getOfeedSettings()).profiles.test.eventId) {
    await back({ error: "ofeedTestMissing" });
  }
  // Pojistka testovacího běhu (#186): během testu nejde přepnout na ostrou akci.
  if (profile === "live" && (await getActiveTestRun())) await back({ error: "ofeedTestRun" });
  await switchOfeedProfile(profile!, user);
  revalidatePath("/[locale]", "page");
  await back({ saved: "ofeedProfile" });
}

export async function publishNowAction(): Promise<void> {
  await requireAdmin();
  const result = await runOfeedPublish("manual");
  await back({ published: result.status });
}

export async function saveRaceSetupAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const stationsRaw = String(formData.get("stations") ?? "").slice(0, LIVE_STATIONS_MAX);
  await put(LIVE_STATIONS_KEY, formatStations(parseStations(stationsRaw)));
  // Práh odchylky na Startu (#187, Q80): prázdné = výchozí 2 min (klíč se smaže).
  const startLimitRaw = String(formData.get("startLimit") ?? "")
    .slice(0, 32)
    .trim();
  if (startLimitRaw) {
    const startLimit = parseStartOffsetLimit(startLimitRaw);
    if (startLimit === null) await back({ error: "startLimit" });
    await put(LIVE_START_OFFSET_LIMIT_KEY, String(startLimit));
  } else {
    await prisma.setting.deleteMany({ where: { key: LIVE_START_OFFSET_LIMIT_KEY } });
  }
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
}

export type CreateTokenState = { token?: string; label?: string; error?: string; test?: boolean };

export async function createTokenAction(
  _previous: CreateTokenState,
  formData: FormData,
): Promise<CreateTokenState> {
  const session = await requireAdmin();
  const label = String(formData.get("label") ?? "")
    .trim()
    .slice(0, 64);
  const splits = normalizeTokenSplits(String(formData.get("splits") ?? "9"));
  const author = normalizeAuthor(String(formData.get("author") ?? "LuM"));
  const validFrom = parsePragueLocal(String(formData.get("validFrom") ?? ""));
  const validUntil = parsePragueLocal(String(formData.get("validUntil") ?? ""));
  if (!label) return { error: "label" };
  if (!splits) return { error: "splits" };
  if (!author) return { error: "author" };
  if (!validFrom || !validUntil || validUntil <= validFrom) return { error: "window" };
  if (validUntil.getTime() - validFrom.getTime() > 3 * 86_400_000) return { error: "window" };
  const ctx = await getRaceContext();
  const created = await createDeviceToken({
    label,
    year: ctx.year,
    splits,
    author,
    validFrom,
    validUntil,
    createdBy: session.id,
  });
  // Klíč vytvořený během testovacího běhu je testovací: při ukončení testu se zneplatní.
  const test = await registerTestToken(created.id);
  revalidatePath("/[locale]/admin/den-zavodu/zive", "page");
  return { token: created.token, label, test };
}

export async function revokeTokenAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (Number.isInteger(id) && id > 0) await revokeDeviceToken(id);
  await back({ saved: "token" });
}

export async function resolveConflictAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
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
  const session = await requireAdmin();
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
      revokeTokens: formData.get("revokeTokens") === "on",
      clearZeroOverride: formData.get("clearZeroOverride") === "on",
    },
    session,
  );
  await back(
    {
      cleared: String(result.splitsTotal),
      entries: String(result.entries),
      tokens: String(result.tokensRevoked),
    },
    SPLITS_PAGE,
  );
}

/** Společné načtení formuláře ruční editace (číslo, split, očekávaná hodnota, důvod). */
async function manualForm(formData: FormData) {
  const session = await requireAdmin();
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
      ? clockToRaceTime(raw, ctx.zero, bib, ctx.intervalS)
      : parseRaceTime(raw);
  if (time === null) await back({ edit, error: "time" }, SPLITS_PAGE);
  const known = await prisma.startEntry.findFirst({
    where: { year: ctx.year, bib },
    select: { bib: true },
  });
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
  const session = await requireAdmin();
  const userId = Number(formData.get("userId"));
  if (!Number.isInteger(userId) || userId < 1) await back({ error: "assignment" });
  const stations = withStart(await getStations());
  const value = assignmentFromForm(formData.getAll("stations").map(String), stations);
  const result = await saveAssignment(session, userId, value);
  if (result === "not_found") await back({ error: "assignment" });
  await back({ saved: "assignment" });
}
