"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/routing";
import { requireAdmin } from "@/lib/admin/staff";
import { prisma } from "@/lib/db/client";
import { runOfeedPublish } from "@/lib/ofeed/publisher";
import { parseEventId, parsePassword, saveOfeedSettings } from "@/lib/ofeed/settings";

import { parsePragueLocal } from "./admin-core";
import { dismissConflict, resolveConflict } from "./ingest";
import { getRaceContext, LIVE_ZERO_OVERRIDE_KEY } from "./race-context";
import { formatStations, LIVE_STATIONS_KEY, LIVE_STATIONS_MAX, parseStations } from "./stations";
import { createDeviceToken, revokeDeviceToken } from "./tokens";
import { normalizeAuthor, normalizeTokenSplits } from "./tokens-core";

const PAGE = "/admin/den-zavodu/zive";

async function back(query: Record<string, string>): Promise<never> {
  const locale = await getLocale();
  revalidatePath("/[locale]/admin/den-zavodu/zive", "page");
  redirect({ href: { pathname: PAGE, query }, locale });
  throw new Error("unreachable");
}

async function put(key: string, text: string) {
  await prisma.setting.upsert({ where: { key }, update: { text }, create: { key, text } });
}

export async function saveOfeedAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const eventIdRaw = String(formData.get("eventId") ?? "").trim();
  const eventId = eventIdRaw ? parseEventId(eventIdRaw) : null;
  if (eventIdRaw && !eventId) await back({ error: "eventId" });
  const passwordRaw = String(formData.get("password") ?? "");
  const clearPassword = formData.get("clearPassword") === "on";
  let password: string | null | undefined = undefined;
  if (clearPassword) password = null;
  else if (passwordRaw.trim()) {
    password = parsePassword(passwordRaw);
    if (!password) await back({ error: "password" });
  }
  await saveOfeedSettings({ enabled: formData.get("enabled") === "on", eventId, password });
  revalidatePath("/[locale]", "page");
  await back({ saved: "ofeed" });
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

export type CreateTokenState = { token?: string; label?: string; error?: string };

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
  revalidatePath("/[locale]/admin/den-zavodu/zive", "page");
  return { token: created.token, label };
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
  if (Number.isInteger(id) && id > 0) {
    if (decision === "accept") await resolveConflict(id, session.id);
    else if (decision === "dismiss") await dismissConflict(id, session.id);
  }
  await back({ saved: "conflict" });
}
