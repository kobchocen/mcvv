import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { env } from "@/lib/env";

export const SESSION_COOKIE = "mcvv_session";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export type UserRole = "registrar" | "organizer" | "admin";

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
    if (payload.role !== "registrar" && payload.role !== "organizer" && payload.role !== "admin") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function isStaffRole(role: UserRole): boolean {
  return role === "organizer" || role === "admin";
}

export async function getSession(): Promise<SessionUser | null> {
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
