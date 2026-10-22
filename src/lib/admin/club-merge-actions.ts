"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireStaff } from "@/lib/admin/staff";
import { formInt, formString } from "@/lib/admin/parse";
import { writeAudit } from "@/lib/audit/log";
import { isNoClub, normalizeClubName, pairKey, planClubMerge, uniqueClubSlug } from "@/lib/clubs";
import { prisma } from "@/lib/db/client";
import { STATS_CACHE_TAG } from "@/lib/stats/overview-query";
import { redirect } from "@/i18n/routing";

/**
 * Ruční sjednocení názvů klubů (#104). Každá změna je výslovné rozhodnutí v administraci
 * (potvrzení / zamítnutí návrhu, odebrání aliasu); nic se neslučuje automaticky.
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

/** Potvrdí sloučení dvou zapsaných názvů pod jeden kanonický klub. */
export async function confirmClubMerge(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const nameA = formString(formData, "nameA").slice(0, 80);
  const nameB = formString(formData, "nameB").slice(0, 80);
  const canonicalName = (formString(formData, "canonical") || nameA).slice(0, 80);
  const keyA = normalizeClubName(nameA).slice(0, 80);
  const keyB = normalizeClubName(nameB).slice(0, 80);
  if (!keyA || !keyB || keyA === keyB || isNoClub(nameA) || isNoClub(nameB)) {
    return back({ chyba: "nazvy" });
  }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.clubAlias.findMany({
      where: { key: { in: [keyA, keyB] } },
      select: { key: true, clubId: true },
    });
    const clubOf = (key: string) => existing.find((row) => row.key === key)?.clubId ?? null;
    const plan = planClubMerge(clubOf(keyA), clubOf(keyB));
    const author = session.email;
    let clubId: number;
    if (plan.kind === "create") {
      const taken = new Set(
        (await tx.canonicalClub.findMany({ select: { slug: true } })).map((row) => row.slug),
      );
      const club = await tx.canonicalClub.create({
        data: { name: canonicalName, slug: uniqueClubSlug(canonicalName, taken) },
      });
      clubId = club.id;
      await tx.clubAlias.createMany({
        data: [
          { key: keyA, name: nameA, clubId, author },
          { key: keyB, name: nameB, clubId, author },
        ],
      });
    } else if (plan.kind === "attach") {
      clubId = plan.clubId;
      const missing = clubOf(keyA) ? { key: keyB, name: nameB } : { key: keyA, name: nameA };
      await tx.clubAlias.create({ data: { ...missing, clubId, author } });
    } else if (plan.kind === "join") {
      clubId = plan.into;
      await tx.clubAlias.updateMany({ where: { clubId: plan.from }, data: { clubId } });
      await tx.canonicalClub.delete({ where: { id: plan.from } });
    } else {
      clubId = plan.clubId;
    }
    await writeAudit(
      {
        actor: session,
        action: "club.merge",
        target: `club:${clubId}`,
        detail: { plan: plan.kind, names: [nameA, nameB], keys: [keyA, keyB] },
      },
      tx,
    );
    return { clubId, plan: plan.kind };
  });

  revalidateClubs();
  return back({ ok: `merge-${result.clubId}` });
}

/** Zamítne návrh: dvojice se už nebude nabízet. */
export async function rejectClubMerge(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const [keyA, keyB] = pairKey(
    normalizeClubName(formString(formData, "nameA")).slice(0, 80),
    normalizeClubName(formString(formData, "nameB")).slice(0, 80),
  );
  if (!keyA || !keyB || keyA === keyB) {
    return back({ chyba: "nazvy" });
  }
  await prisma.$transaction(async (tx) => {
    await tx.clubMergeRejection.upsert({
      where: { keyA_keyB: { keyA, keyB } },
      update: {},
      create: { keyA, keyB, author: session.email },
    });
    await writeAudit(
      {
        actor: session,
        action: "club.merge_rejected",
        target: `pair:${keyA}|${keyB}`.slice(0, 128),
      },
      tx,
    );
  });
  revalidatePath("/[locale]/admin/ciselniky", "layout");
  return back({ ok: "reject" });
}

/** Vrátí zamítnutý návrh zpět mezi návrhy. */
export async function restoreClubMerge(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const keyA = formString(formData, "keyA");
  const keyB = formString(formData, "keyB");
  await prisma.$transaction(async (tx) => {
    await tx.clubMergeRejection.deleteMany({ where: { keyA, keyB } });
    await writeAudit(
      {
        actor: session,
        action: "club.merge_restored",
        target: `pair:${keyA}|${keyB}`.slice(0, 128),
      },
      tx,
    );
  });
  revalidatePath("/[locale]/admin/ciselniky", "layout");
  return back({ ok: "restore" });
}

/** Odebere zapsaný název z kanonického klubu (zobrazí se zase pod sebou). */
export async function removeClubAlias(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const key = formString(formData, "key");
  await prisma.$transaction(async (tx) => {
    const alias = await tx.clubAlias.findUnique({ where: { key } });
    if (!alias) return;
    await tx.clubAlias.delete({ where: { key } });
    const left = await tx.clubAlias.count({ where: { clubId: alias.clubId } });
    // A club with a single remaining name is no merge any more: dissolve it.
    if (left <= 1) {
      await tx.canonicalClub.delete({ where: { id: alias.clubId } });
    }
    await writeAudit(
      {
        actor: session,
        action: "club.alias_removed",
        target: `club:${alias.clubId}`,
        detail: { key, name: alias.name, dissolved: left <= 1 },
      },
      tx,
    );
  });
  revalidateClubs();
  return back({ ok: "alias" });
}

/** Přejmenuje kanonický klub (adresa profilu zůstává). */
export async function renameCanonicalClub(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = formInt(formData, "id");
  const name = formString(formData, "name").slice(0, 80);
  if (!id || !name) {
    return back({ chyba: "nazvy" });
  }
  await prisma.$transaction(async (tx) => {
    const before = await tx.canonicalClub.findUnique({ where: { id }, select: { name: true } });
    if (!before) return;
    await tx.canonicalClub.update({ where: { id }, data: { name } });
    await writeAudit(
      {
        actor: session,
        action: "club.renamed",
        target: `club:${id}`,
        detail: { from: before.name, to: name },
      },
      tx,
    );
  });
  revalidateClubs();
  return back({ ok: "rename" });
}
