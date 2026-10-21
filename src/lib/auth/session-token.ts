/**
 * Podepsaný token session cookie (čisté funkce nad `node:crypto`, bez Next.js a DB),
 * aby ho šlo ověřit i v `src/proxy.ts` a testovat.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { isUserRole, type UserRole } from "@/lib/auth/roles";

export const SESSION_COOKIE = "mcvv_session";

export type SessionTokenPayload = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  exp: number;
};

/** Tajemství session (min. 32 znaků), jinak undefined = session vypnuté. */
export function usableSessionSecret(secret: string | undefined): string | undefined {
  if (!secret || secret.length < 32) {
    return undefined;
  }
  return secret;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function encodeSessionToken(payload: SessionTokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** Ověří podpis a platnost; vrací payload, nebo null (neplatný, prošlý, neznámá role). */
export function decodeSessionToken(
  token: string,
  secret: string,
  nowMs: number = Date.now(),
): SessionTokenPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) {
    return null;
  }
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(body, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionTokenPayload;
    if (
      typeof payload.id !== "number" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp * 1000 < nowMs
    ) {
      return null;
    }
    if (!isUserRole(payload.role)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
