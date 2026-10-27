import { prisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import type { MailPolicy } from "@/lib/mail/queue-core";

import {
  MAIL_DAILY_CAP_KEY,
  MAIL_PRIORITY_RESERVE_KEY,
  MAIL_SETTING_KEYS,
  MAIL_UNLIMITED_KEY,
  mailSettingsFromRows,
  resolveMailPolicy,
  type MailSettings,
} from "./mail-core";

export * from "./mail-core";

export async function getMailSettings(): Promise<MailSettings> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [...MAIL_SETTING_KEYS] } },
    select: { key: true, text: true },
  });
  return mailSettingsFromRows(rows);
}

/**
 * Politika denního limitu pro frontu a newsletter. Když DB nastavení nejde přečíst,
 * platí env (stejně jako před #190), aby e-maily dál odcházely.
 */
export async function getMailPolicy(): Promise<MailPolicy> {
  const settings = await getMailSettings().catch(() => null);
  return resolveMailPolicy(settings, env);
}

export async function saveMailSettings(settings: MailSettings): Promise<void> {
  const entries: [string, string][] = [
    [MAIL_DAILY_CAP_KEY, settings.dailyCap === null ? "" : String(settings.dailyCap)],
    [
      MAIL_PRIORITY_RESERVE_KEY,
      settings.priorityReserve === null ? "" : String(settings.priorityReserve),
    ],
    [MAIL_UNLIMITED_KEY, settings.unlimited ? "1" : "0"],
  ];
  await prisma.$transaction(
    entries.map(([key, text]) =>
      prisma.setting.upsert({ where: { key }, update: { text }, create: { key, text } }),
    ),
  );
}
