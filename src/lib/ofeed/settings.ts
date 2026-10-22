import type { SessionUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit/log";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db/client";

import { openSecret, sealSecret } from "./secret-box";
import {
  OFEED_KEYS,
  OFEED_SECRET_PURPOSE,
  OFEED_STATE,
  profileKeys,
  settingsFromRows,
  type OfeedProfile,
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

/**
 * Jen pro server-side upload: ID a heslo **aktivního** profilu (live / test).
 * Výsledek nikdy nelogovat ani nevracet klientovi.
 */
export async function readOfeedCredentials(): Promise<{
  profile: OfeedProfile;
  eventId: string;
  password: string;
} | null> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ALL_KEYS } },
    select: { key: true, text: true },
  });
  const settings = settingsFromRows(rows);
  const sealed = rows.find((row) => row.key === profileKeys(settings.profile).password)?.text;
  if (!settings.eventId || !sealed || !env.SESSION_SECRET) return null;
  const password = openSecret(sealed, env.SESSION_SECRET, OFEED_SECRET_PURPOSE);
  return password ? { profile: settings.profile, eventId: settings.eventId, password } : null;
}

async function put(key: string, text: string) {
  await prisma.setting.upsert({ where: { key }, update: { text }, create: { key, text } });
}

export type OfeedProfileInput = {
  eventId: string | null;
  /** undefined = nechat, null = smazat, string = nové heslo. */
  password: string | null | undefined;
};

async function saveProfile(profile: OfeedProfile, input: OfeedProfileInput) {
  const keys = profileKeys(profile);
  await put(keys.eventId, input.eventId ?? "");
  if (input.password === null) {
    await prisma.setting.deleteMany({
      where: { key: { in: [keys.password, keys.passwordSetAt] } },
    });
  } else if (typeof input.password === "string") {
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
      throw new Error("SESSION_SECRET is required to store the OFeed password");
    }
    await put(keys.password, sealSecret(input.password, env.SESSION_SECRET, OFEED_SECRET_PURPOSE));
    await put(keys.passwordSetAt, new Date().toISOString());
  }
}

export async function saveOfeedSettings(input: {
  enabled: boolean;
  live: OfeedProfileInput;
  /** Bez `test` zůstane testovací profil beze změny. */
  test?: OfeedProfileInput;
}): Promise<void> {
  await put(OFEED_KEYS.enabled, input.enabled ? "1" : "0");
  await saveProfile("live", input.live);
  if (input.test) await saveProfile("test", input.test);
}

/**
 * Přepne, do které akce se nahrává (Q33). Smaže otisk posledního uploadu, ať první běh
 * nahraje kompletní data i do nově zvolené akce, a zapíše audit. Vrací false, když se nic
 * neměnilo.
 */
export async function switchOfeedProfile(
  profile: OfeedProfile,
  actor: SessionUser,
): Promise<boolean> {
  const before = (await getOfeedSettings()).profile;
  if (before === profile) return false;
  await prisma.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { key: OFEED_KEYS.profile },
      update: { text: profile },
      create: { key: OFEED_KEYS.profile, text: profile },
    });
    await tx.jobState.deleteMany({ where: { name: OFEED_STATE.lastHash } });
    await writeAudit(
      {
        actor,
        action: "raceday.ofeed_profile",
        target: profile,
        detail: { from: before, to: profile },
      },
      tx,
    );
  });
  return true;
}
