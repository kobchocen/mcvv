"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireSection } from "@/lib/admin/access";
import { redirect } from "@/i18n/routing";

import { toPragueLocalInput } from "./admin-core";
import { correctFinish, type FinishCorrection } from "./finish";
import { FINISH_BIB_MAX, parseFinishClock } from "./finish-core";
import { enterLiveTestContext, getLiveRaceContext } from "@/lib/testmode/run";

const PAGE = "/admin/den-zavodu/zive/cil" as const;

async function back(query: Record<string, string>): Promise<never> {
  const locale = await getLocale();
  revalidatePath("/[locale]/admin/den-zavodu/zive/cil", "page");
  redirect({ href: { pathname: PAGE, query }, locale });
  throw new Error("unreachable");
}

function int(formData: FormData, name: string): number | null {
  const raw = String(formData.get(name) ?? "").trim();
  if (!/^\d{1,9}$/.test(raw)) return null;
  return Number(raw);
}

function bibOf(formData: FormData, name = "bib"): number | null {
  const value = int(formData, name);
  return value !== null && value >= 1 && value <= FINISH_BIB_MAX ? value : null;
}

/**
 * Oprava párování cíle (#252): smazání / obnovení kliku nebo čísla, prohození dvou čísel,
 * přečíslování, vložení chybějícího čísla nebo kliku. Oprávnění `raceControl.finish` (úpravy).
 */
export async function finishCorrectionAction(formData: FormData): Promise<void> {
  const session = await requireSection("raceControl.finish", "write");
  const ctx = await getLiveRaceContext();
  enterLiveTestContext(ctx);
  const op = String(formData.get("op") ?? "");
  const id = int(formData, "id");
  let correction: FinishCorrection | null = null;
  switch (op) {
    case "delete-punch":
    case "restore-punch":
      if (id) correction = { kind: "delete-punch", id, deleted: op === "delete-punch" };
      break;
    case "delete-bib":
    case "restore-bib":
      if (id) correction = { kind: "delete-bib", id, deleted: op === "delete-bib" };
      break;
    case "swap-bibs": {
      const other = int(formData, "otherId");
      if (id && other) correction = { kind: "swap-bibs", id, otherId: other };
      break;
    }
    case "change-bib": {
      const bib = bibOf(formData);
      if (id && bib) correction = { kind: "change-bib", id, bib };
      break;
    }
    case "insert-bib": {
      const bib = bibOf(formData);
      if (bib) correction = { kind: "insert-bib", bib, beforeId: id };
      break;
    }
    case "insert-punch": {
      const day = toPragueLocalInput(ctx.zero).slice(0, 10);
      const at = parseFinishClock(String(formData.get("clock") ?? ""), day);
      if (at !== null) correction = { kind: "insert-punch", at: new Date(at) };
      break;
    }
  }
  if (!correction) return back({ error: "invalid" });
  const result = await correctFinish(ctx, correction, session);
  return back(result === "ok" ? { saved: op } : { error: "missing" });
}
