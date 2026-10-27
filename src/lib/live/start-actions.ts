"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/routing";
import { requireAdmin } from "@/lib/admin/staff";
import { isoWithOffset } from "@/lib/ofeed/iof-xml";

import { clearBlocked, confirmationMatches } from "./clear-core";
import { isValidBib, normalizeReason } from "./manual-core";
import { getRaceContext } from "./race-context";
import { clearStarts, deleteManualStart, setManualStart } from "./start-check";
import { parseExpectedStart } from "./start-check-core";
import { parseStartClock } from "./start-clock";

/**
 * Server actions evidence startu (#203). Zápis, opravu i mazání smí jen admin (stejně jako
 * u mezičasů, Q31); hromadné vyčištění je zakázané od skutečné nuly ročníku (Q32).
 */

const PAGE = "/admin/den-zavodu/start" as const;

async function back(query: Record<string, string>): Promise<never> {
  const locale = await getLocale();
  revalidatePath("/[locale]/admin/den-zavodu/start", "page");
  redirect({ href: { pathname: PAGE, query }, locale });
  throw new Error("unreachable");
}

async function startForm(formData: FormData) {
  const session = await requireAdmin();
  const ctx = await getRaceContext();
  const bib = Number(formData.get("bib"));
  const edit = Number.isInteger(bib) ? String(bib) : "";
  if (!isValidBib(bib)) await back({ error: "bib" });
  if (String(formData.get("year") ?? "") !== String(ctx.year)) await back({ edit, error: "year" });
  const expected = parseExpectedStart(String(formData.get("expected") ?? ""));
  if (expected === undefined) await back({ edit, error: "changed" });
  const reason = normalizeReason(String(formData.get("reason") ?? ""));
  return { session, ctx, bib, edit, expected: expected!, reason };
}

/** Ruční zápis / oprava času startu jednoho čísla (denní čas hh:mm:ss v den závodu). */
export async function setStartAction(formData: FormData): Promise<void> {
  const { session, ctx, bib, edit, expected, reason } = await startForm(formData);
  const day = isoWithOffset(ctx.zero).slice(0, 10);
  const startedAt = parseStartClock(String(formData.get("value") ?? ""), day);
  if (!startedAt) await back({ edit, error: "time" });
  const result = await setManualStart({
    ctx,
    bib,
    startedAt: startedAt!,
    expected,
    reason,
    actor: session,
  });
  if (!result.ok) await back({ edit, error: result.reason });
  await back({ edit, saved: result.ok ? result.action : "" });
}

/** Ruční smazání záznamu startu (důvod povinný). */
export async function deleteStartAction(formData: FormData): Promise<void> {
  const { session, ctx, bib, edit, expected, reason } = await startForm(formData);
  const result = await deleteManualStart({ ctx, bib, expected, reason, actor: session });
  if (!result.ok) await back({ edit, error: result.reason });
  await back({ saved: "delete" });
}

/** Hromadné vyčištění evidence startu ročníku (jen admin, jen před nulou, opsaný ročník). */
export async function clearStartsAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const ctx = await getRaceContext();
  if (clearBlocked(new Date(), ctx.officialZero)) await back({ error: "blocked" });
  if (String(formData.get("year") ?? "") !== String(ctx.year)) await back({ error: "year" });
  if (!confirmationMatches(String(formData.get("confirmYear") ?? ""), ctx.year)) {
    await back({ error: "confirm" });
  }
  const result = await clearStarts(ctx.year, session);
  await back({ cleared: String(result.records), entries: String(result.entries) });
}
