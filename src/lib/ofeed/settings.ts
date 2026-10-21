import { env } from "@/lib/env";
import { prisma } from "@/lib/db/client";

import { openSecret, sealSecret } from "./secret-box";
import {
  OFEED_KEYS,
  OFEED_SECRET_PURPOSE,
  settingsFromRows,
  type OfeedSettings,
} from "./settings-core";

export * from "./settings-core";

const ALL_KEYS = Object.values(OFEED_KEYS);

export async function getOfeedSettings(): Promise<OfeedSettings> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ALL_KEYS } },
    select: { key: true, text: true },
  });
  return settingsFromRows(rows);
}

/** Jen pro server-side upload. Výsledek nikdy nelogovat ani nevracet klientovi. */
export async function readOfeedCredentials(): Promise<{
  eventId: string;
  password: string;
} | null> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [OFEED_KEYS.eventId, OFEED_KEYS.password] } },
    select: { key: true, text: true },
  });
  const map = new Map(rows.map((row) => [row.key, row.text]));
  const eventId = settingsFromRows(rows).eventId;
  const sealed = map.get(OFEED_KEYS.password);
  if (!eventId || !sealed || !env.SESSION_SECRET) return null;
  const password = openSecret(sealed, env.SESSION_SECRET, OFEED_SECRET_PURPOSE);
  return password ? { eventId, password } : null;
}

async function put(key: string, text: string) {
  await prisma.setting.upsert({ where: { key }, update: { text }, create: { key, text } });
}

export async function saveOfeedSettings(input: {
  enabled: boolean;
  eventId: string | null;
  /** undefined = nechat, null = smazat, string = nové heslo. */
  password: string | null | undefined;
}): Promise<void> {
  await put(OFEED_KEYS.enabled, input.enabled ? "1" : "0");
  await put(OFEED_KEYS.eventId, input.eventId ?? "");
  if (input.password === null) {
    await prisma.setting.deleteMany({
      where: { key: { in: [OFEED_KEYS.password, OFEED_KEYS.passwordSetAt] } },
    });
  } else if (typeof input.password === "string") {
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
      throw new Error("SESSION_SECRET is required to store the OFeed password");
    }
    await put(
      OFEED_KEYS.password,
      sealSecret(input.password, env.SESSION_SECRET, OFEED_SECRET_PURPOSE),
    );
    await put(OFEED_KEYS.passwordSetAt, new Date().toISOString());
  }
}
