import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";

import { prisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import { isUserRole, type UserRole } from "@/lib/auth/roles";

export {
  adminAccess,
  canAccessRaceDay,
  canAccessSplits,
  isStaffRole,
  type AdminAccess,
  type UserRole,
} from "@/lib/auth/roles";

export const SESSION_COOKIE = "mcvv_session";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
};

type SessionPayload = SessionUser & { exp: number };

function sessionSecret(): string | undefined {
  const secret = env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    return undefined;
  }
  return secret;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function encode(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

function decode(token: string, secret: string): SessionPayload | null {
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
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (
      typeof payload.id !== "number" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp * 1000 < Date.now()
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

/**
 * Aktuální účet z podepsané cookie. Role (a jméno/e-mail) se dočítají z DB, jednou za
 * request (`React.cache`), takže změna nebo odebrání role v administraci platí hned,
 * ne až po vypršení 7denní cookie. Smazaný účet = odhlášený.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const fromCookie = await sessionFromCookie();
  if (!fromCookie) {
    return null;
  }
  try {
    const account = await prisma.user.findUnique({
      where: { id: fromCookie.id },
      select: { email: true, name: true, role: true },
    });
    if (!account || !isUserRole(account.role)) {
      return null;
    }
    return { id: fromCookie.id, email: account.email, name: account.name, role: account.role };
  } catch (error) {
    // Bez DB nelze roli ověřit: privilegované role nepouštět (fail closed).
    console.error("[session] role refresh failed", error);
    return fromCookie.role === "registrar" ? fromCookie : null;
  }
});

async function sessionFromCookie(): Promise<SessionUser | null> {
  const secret = sessionSecret();
  if (!secret) {
    return null;
  }
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  const payload = decode(token, secret);
  if (!payload) {
    return null;
  }
  return { id: payload.id, email: payload.email, name: payload.name, role: payload.role };
}

export async function setSession(user: SessionUser): Promise<boolean> {
  const secret = sessionSecret();
  if (!secret) {
    return false;
  }
  const token = encode(
    { ...user, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC },
    secret,
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
  return true;
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
