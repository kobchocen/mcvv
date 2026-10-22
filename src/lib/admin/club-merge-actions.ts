"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireStaff } from "@/lib/admin/staff";
import { formString } from "@/lib/admin/parse";
import { writeAudit } from "@/lib/audit/log";
import { clubKey, clubPair, planClubMerge } from "@/lib/clubs";
import { prisma } from "@/lib/db/client";
import { STATS_CACHE_TAG } from "@/lib/stats/overview-query";
import { redirect } from "@/i18n/routing";

/**
 * Ruční sloučení id klubů (#104, Q34). Identita klubu je cis_klub.id; slučují se jen různá id,
 * která jsou fakticky jeden klub, a vždy s výslovně zvoleným hlavním id. Jde jen o mapování
 * (mcvv_klub_slouceni) – legacy tabulky se nemění a každé sloučení jde vrátit.
 */

function revalidateClubs() {
  revalidatePath("/[locale]/admin/ciselniky", "layout");
  revalidatePath("/[locale]/kluby/[slug]", "page");
  revalidatePath("/[locale]/results", "layout");
  revalidatePath("/[locale]/bezec/[id]", "page");
  revalidatePath("/[locale]/statistiky", "layout");
  revalidateTag(STATS_CACHE_TAG, "max");
}

async function back(query: Record<string, string> = {}): Promise<never> {
  const locale = await getLocale();
  redirect({ href: { pathname: "/admin/ciselniky/kluby/slouceni", query }, locale });
  throw new Error("unreachable");
}

/**
 * Sloučí dvě id. `main` = "a" | "b" je povinná volba hlavního id (bez výchozí hodnoty):
 * hlavní id zůstává, druhé se počítá pod ním.
 */
export async function confirmClubMerge(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const idA = clubKey(formString(formData, "idA"));
  const idB = clubKey(formString(formData, "idB"));
  const side = formString(formData, "main");
  if (!idA || !idB || idA === idB) {
    return back({ chyba: "ids" });
  }
  if (side !== "a" && side !== "b") {
    return back({ chyba: "hlavni" });
  }
  const main = side === "a" ? idA : idB;
  const other = main === idA ? idB : idA;

  const result = await prisma.$transaction(async (tx) => {
    const known = await tx.club.findMany({
      where: { id: { in: [idA, idB] } },
      select: { id: true },
      distinct: ["id"],
    });
    if (known.length < 2) return { ok: false as const, error: "nezname" };
    const merges = await tx.clubMerge.findMany({ select: { clubId: true, mainClubId: true } });
    const plan = planClubMerge(main, other, merges);
    if (!plan.ok) return { ok: false as const, error: plan.error };
    for (const row of plan.rows) {
      await tx.clubMerge.upsert({
        where: { clubId: row.clubId },
        update: { mainClubId: row.mainClubId, author: session.email },
        create: { ...row, author: session.email },
      });
    }
    await writeAudit(
      {
        actor: session,
        action: "club.merge",
        target: `club:${plan.mainId}`,
        detail: { main: plan.mainId, merged: plan.rows.map((row) => row.clubId) },
      },
      tx,
    );
    return { ok: true as const, main: plan.mainId };
  });

  if (!result.ok) {
    return back({ chyba: result.error });
  }
  revalidateClubs();
  return back({ ok: `merge-${result.main}` });
}

/** Zamítne návrh: dvojice id se už nebude nabízet. */
export async function rejectClubMerge(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const [clubIdA, clubIdB] = clubPair(formString(formData, "idA"), formString(formData, "idB"));
  if (!clubIdA || !clubIdB || clubIdA === clubIdB) {
    return back({ chyba: "ids" });
  }
  await prisma.$transaction(async (tx) => {
    await tx.clubMergeRejection.upsert({
      where: { clubIdA_clubIdB: { clubIdA, clubIdB } },
      update: {},
      create: { clubIdA, clubIdB, author: session.email },
    });
    await writeAudit(
      { actor: session, action: "club.merge_rejected", target: `pair:${clubIdA}|${clubIdB}` },
      tx,
    );
  });
  revalidatePath("/[locale]/admin/ciselniky", "layout");
  return back({ ok: "reject" });
}

/** Vrátí zamítnutý návrh zpět mezi návrhy. */
export async function restoreClubMerge(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const [clubIdA, clubIdB] = clubPair(formString(formData, "idA"), formString(formData, "idB"));
  await prisma.$transaction(async (tx) => {
    await tx.clubMergeRejection.deleteMany({ where: { clubIdA, clubIdB } });
    await writeAudit(
      { actor: session, action: "club.merge_restored", target: `pair:${clubIdA}|${clubIdB}` },
      tx,
    );
  });
  revalidatePath("/[locale]/admin/ciselniky", "layout");
  return back({ ok: "restore" });
}

/** Zruší sloučení jednoho id: zobrazuje se zase jako samostatný klub. */
export async function unmergeClub(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const clubId = clubKey(formString(formData, "id"));
  await prisma.$transaction(async (tx) => {
    const merge = await tx.clubMerge.findUnique({ where: { clubId } });
    if (!merge) return;
    await tx.clubMerge.delete({ where: { clubId } });
    await writeAudit(
      {
        actor: session,
        action: "club.unmerged",
        target: `club:${merge.mainClubId}`,
        detail: { main: merge.mainClubId, unmerged: clubId },
      },
      tx,
    );
  });
  revalidateClubs();
  return back({ ok: "unmerge" });
}
