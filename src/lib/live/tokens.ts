import { prisma } from "@/lib/db/client";

import { generateToken, hashToken, parseBearer, tokenState, type TokenState } from "./tokens-core";

export type AuthenticatedToken = {
  id: number;
  label: string;
  year: number;
  splits: string;
  author: string;
};

export async function authenticateDevice(
  header: string | null,
  now = new Date(),
): Promise<
  { ok: true; token: AuthenticatedToken } | { ok: false; reason: TokenState | "invalid" }
> {
  const raw = parseBearer(header);
  if (!raw) return { ok: false, reason: "invalid" };
  const row = await prisma.ingestToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!row) return { ok: false, reason: "invalid" };
  const state = tokenState(row, now);
  if (state !== "active") return { ok: false, reason: state };
  // lastUsedAt stačí s přesností na minutu – šetří zápisy při polling klientovi
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > 60_000) {
    await prisma.ingestToken.update({ where: { id: row.id }, data: { lastUsedAt: now } });
  }
  return {
    ok: true,
    token: { id: row.id, label: row.label, year: row.year, splits: row.splits, author: row.author },
  };
}

export async function createDeviceToken(input: {
  label: string;
  year: number;
  splits: string;
  author: string;
  validFrom: Date;
  validUntil: Date;
  createdBy: number;
}): Promise<{ id: number; token: string }> {
  const generated = generateToken();
  const row = await prisma.ingestToken.create({
    data: { ...input, tokenHash: generated.hash, prefix: generated.prefix },
    select: { id: true },
  });
  return { id: row.id, token: generated.token };
}

export async function revokeDeviceToken(id: number): Promise<void> {
  await prisma.ingestToken.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function listDeviceTokens(year: number) {
  return prisma.ingestToken.findMany({
    where: { year },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      prefix: true,
      splits: true,
      author: true,
      validFrom: true,
      validUntil: true,
      revokedAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
}
