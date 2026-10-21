import { cache } from "react";

import { prisma } from "@/lib/db/client";
import { env } from "@/lib/env";

import {
  ENTRY_CHANGES_NOTIFY_KEY,
  MESSAGE_SETTING_KEYS,
  MESSAGES_ENABLED_KEY,
  MESSAGES_NOTIFY_ORGANIZER_KEY,
  MESSAGES_NOTIFY_USER_KEY,
  messageSettingsFromRows,
  ORGANIZER_EMAIL_KEY,
  resolveOrganizerEmail,
  type MessageSettings,
} from "./messages-core";

export * from "./messages-core";

/** Nastavení zpráv (1× za request). */
export const getMessageSettings = cache(async (): Promise<MessageSettings> => {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [...MESSAGE_SETTING_KEYS] } },
    select: { key: true, text: true },
  });
  return messageSettingsFromRows(rows);
});

/**
 * Jediné místo, odkud se bere adresa pořadatele (kontaktní formulář, souhrn zpráv):
 * nastavení „Pořadatelský e-mail“ → env CONTACT_TO → mcvv@mcvv.org.
 */
export async function getOrganizerEmail(): Promise<string> {
  const settings = await getMessageSettings().catch(() => null);
  return resolveOrganizerEmail(settings?.organizerEmail, env.CONTACT_TO);
}

export async function saveMessageSettings(settings: MessageSettings): Promise<void> {
  const entries: [string, string][] = [
    [MESSAGES_ENABLED_KEY, settings.enabled ? "1" : "0"],
    [MESSAGES_NOTIFY_ORGANIZER_KEY, settings.notifyOrganizer ? "1" : "0"],
    [MESSAGES_NOTIFY_USER_KEY, settings.notifyUser ? "1" : "0"],
    [ORGANIZER_EMAIL_KEY, settings.organizerEmail],
    [ENTRY_CHANGES_NOTIFY_KEY, settings.notifyChanges ? "1" : "0"],
  ];
  await prisma.$transaction(
    entries.map(([key, text]) =>
      prisma.setting.upsert({ where: { key }, update: { text }, create: { key, text } }),
    ),
  );
}
