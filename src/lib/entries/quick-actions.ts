"use server";

import { revalidatePath } from "next/cache";

import { writeAudit } from "@/lib/audit/log";
import { getSession, type SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { QUICK_RUNNER_ID } from "@/lib/entries/quick";
import { runnerInOwnEntries } from "@/lib/entries/quick-hidden";

/** Výsledek akce rychlé nabídky pro klienta (chyba = vrátit optimistickou změnu). */
export type QuickHiddenResult = { ok: boolean };

async function audit(
  actor: SessionUser,
  action: "account.quick_hidden" | "account.quick_restored",
  runnerIds: string[],
): Promise<void> {
  try {
    const runners = await prisma.runner.findMany({
      where: { id: { in: runnerIds } },
      select: { id: true, name: true },
    });
    const names = new Map(runners.map((runner) => [runner.id, runner.name]));
    await writeAudit({
      actor,
      action,
      target: `user:${actor.id}`,
      detail: {
        runners: runnerIds.map((id) => ({ runnerId: id, runnerName: names.get(id) ?? null })),
      },
      meta: { entity: "account" },
    });
  } catch (error) {
    // Audit nesmí shodit akci přihlašujícího.
    console.error("[entries] quick hidden audit failed", action, error);
  }
}

/** „Už nenabízet“: skryje běžce z rychlé nabídky účtu. Nic nemaže. */
export async function hideQuickRunner(runnerId: string): Promise<QuickHiddenResult> {
  const session = await getSession();
  if (!session || typeof runnerId !== "string" || !QUICK_RUNNER_ID.test(runnerId)) {
    return { ok: false };
  }
  if (!(await runnerInOwnEntries(session.email, runnerId))) {
    return { ok: false };
  }
  const { count } = await prisma.userQuickHidden.createMany({
    data: [{ userId: session.id, runnerId }],
    skipDuplicates: true,
  });
  if (count > 0) {
    await audit(session, "account.quick_hidden", [runnerId]);
  }
  revalidatePath("/[locale]/prihlasky", "page");
  return { ok: true };
}

/** Vrátí skryté běžce do nabídky: vybraná id, nebo `"all"` = všechny skryté účtu. */
export async function restoreQuickRunners(runnerIds: string[] | "all"): Promise<QuickHiddenResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false };
  }
  const ids =
    runnerIds === "all"
      ? null
      : Array.isArray(runnerIds)
        ? runnerIds.filter((id) => typeof id === "string" && QUICK_RUNNER_ID.test(id)).slice(0, 500)
        : [];
  if (ids !== null && ids.length === 0) {
    return { ok: false };
  }
  // Jen vlastní řádky účtu – cizí skrytí nejde vrátit ani zjistit.
  const where = { userId: session.id, ...(ids ? { runnerId: { in: ids } } : {}) };
  const rows = await prisma.userQuickHidden.findMany({ where, select: { runnerId: true } });
  if (rows.length > 0) {
    await prisma.userQuickHidden.deleteMany({
      where: { userId: session.id, runnerId: { in: rows.map((row) => row.runnerId) } },
    });
    await audit(
      session,
      "account.quick_restored",
      rows.map((row) => row.runnerId),
    );
  }
  revalidatePath("/[locale]/prihlasky", "page");
  return { ok: true };
}
