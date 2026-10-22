"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireStaff } from "@/lib/admin/staff";
import { formString } from "@/lib/admin/parse";
import { writeAudit } from "@/lib/audit/log";
import { clubKey, clubPair } from "@/lib/clubs";
import { applyClubMerge } from "@/lib/clubs/merge-apply";
import { prisma } from "@/lib/db/client";
import { STATS_CACHE_TAG } from "@/lib/stats/overview-query";
import { redirect } from "@/i18n/routing";

/**
 * Ruční sloučení id klubů (#104, Q34, Q45). Identita klubu je cis_klub.id; slučují se jen různá
 * id, která jsou fakticky jeden klub, a vždy s výslovně zvoleným hlavním id. Sloučení PŘEPISUJE
 * data: řádky sloučeného id dostanou hlavní id a sloučené id zmizí (viz `planClubMerge`).
 * Nevratné – audit (`club.merge`) drží úplný stav před sloučením pro ruční opravu.
 *
 * Postup: volba dvojice a hlavního id → náhled s počty dotčených řádků (`?hlavni=&sloucit=`)
 * → výslovné potvrzení nevratnosti → sloučení v jedné transakci.
 */

function revalidateClubs() {
  revalidatePath("/[locale]/admin/ciselniky", "layout");
  revalidatePath("/[locale]/kluby", "layout");
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
 * Krok 1: dvojice id a povinná volba hlavního id (`main` = "a" | "b", bez výchozí hodnoty)
 * → náhled sloučení s počty dotčených řádků. Nic nemění.
 */
export async function previewClubMergeAction(formData: FormData): Promise<void> {
  await requireStaff();
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
  return back({ hlavni: main, sloucit: other });
}

/**
 * Krok 2: sloučí `sloucit` pod `hlavni` – nevratně přepíše data v jedné transakci a zapíše
 * audit s úplným stavem před sloučením. Vyžaduje zaškrtnuté potvrzení nevratnosti.
 */
export async function confirmClubMerge(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const main = clubKey(formString(formData, "hlavni"));
  const other = clubKey(formString(formData, "sloucit"));
  if (!main || !other || main === other) {
    return back({ chyba: "ids" });
  }
  if (formString(formData, "nevratne") !== "ano") {
    return back({ hlavni: main, sloucit: other, chyba: "potvrzeni" });
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const applied = await applyClubMerge(tx, {
        mainId: main,
        otherId: other,
        author: session.email,
      });
      if (!applied.ok) return applied;
      await writeAudit(
        {
          actor: session,
          action: "club.merge",
          target: `club:${applied.detail.main}`,
          detail: applied.detail,
        },
        tx,
      );
      return { ok: true as const, main: applied.detail.main, merged: applied.detail.merged };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  if (!result.ok) {
    return back({ chyba: result.error });
  }
  revalidateClubs();
  return back({ ok: "merge", hlavni_hotovo: result.main, sloucene: result.merged });
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
