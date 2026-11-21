import type { AuditAction, AuditActor } from "@/lib/audit/log";
import { writeAudit } from "@/lib/audit/log";
import { diffFields } from "@/lib/audit/diff";
import { prisma } from "@/lib/db/client";

async function readSettings(keys: readonly string[]): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [...keys] } },
    select: { key: true, text: true },
  });
  return Object.fromEntries(
    keys.map((key) => [key, rows.find((row) => row.key === key)?.text ?? ""]),
  );
}

/**
 * Audit nastavení mimo stránku Nastavení (P7): přečte klíče před a po uložení a zapíše
 * jen změněné (`changes` jako `settings.changed`). Zapíše i když akce skončí přesměrováním
 * (redirect vyhazuje) – proto `finally`. Chyba auditu se jen zaloguje, uložení nevrací.
 */
export async function withSettingsAudit<T>(
  actor: AuditActor,
  action: AuditAction,
  keys: readonly string[],
  save: () => Promise<T>,
): Promise<T> {
  const before = await readSettings(keys);
  try {
    return await save();
  } finally {
    try {
      const changes = diffFields(before, await readSettings(keys));
      if (Object.keys(changes).length > 0) {
        await writeAudit({ actor, action, target: "settings", detail: { changes } });
      }
    } catch (error) {
      console.error("[audit] settings audit failed", error);
    }
  }
}
