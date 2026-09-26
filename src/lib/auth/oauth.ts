import { createHmac, createPrivateKey, randomBytes, sign as signBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import { redirectAfterLogin, safeAdminNext } from "@/lib/auth/login-next";
import { isStaffRole, setSession, type UserRole } from "@/lib/auth/session";
import { type Locale } from "@/i18n/routing";

const STATE_COOKIE = "mcvv_oauth";
const STATE_MAX_AGE = 60 * 10;

export function googleEnabled(): boolean {
  return Boolean(env.AUTH_ORIGIN && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function appleEnabled(): boolean {
  return Boolean(
    env.AUTH_ORIGIN &&
    env.APPLE_CLIENT_ID &&
    env.APPLE_TEAM_ID &&
    env.APPLE_KEY_ID &&
    env.APPLE_PRIVATE_KEY,
  );
}

function origin(): string {
  return (env.AUTH_ORIGIN ?? "").replace(/\/$/, "");
}

function signState(body: string): string {
  const secret = env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET missing");
  }
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

function readState(token: string): { n: string; locale: Locale; next: string | null } | null {
  const secret = env.SESSION_SECRET;
  if (!secret) {
    return null;
  }
  const dot = token.lastIndexOf(".");
  if (dot <= 0) {
    return null;
  }
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (signature !== expected) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      n?: string;
      locale?: string;
      next?: string | null;
    };
    if (payload.locale !== "cs" && payload.locale !== "en") {
      return null;
    }
    if (typeof payload.n !== "string") {
      return null;
    }
    return { n: payload.n, locale: payload.locale, next: payload.next ?? null };
  } catch {
    return null;
  }
}

function makeState(locale: Locale, next: string | null): { n: string; token: string } {
  const n = randomBytes(16).toString("hex");
  const body = Buffer.from(JSON.stringify({ n, locale, next }), "utf8").toString("base64url");
  return { n, token: signState(body) };
}

function stateCookie(token: string, response: NextResponse) {
  response.cookies.set(STATE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_MAX_AGE,
  });
}

async function consumeState(state: string | null): Promise<{
  locale: Locale;
  next: string | null;
} | null> {
  if (!state) {
    return null;
  }
  const jar = await cookies();
  const stored = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  if (!stored) {
    return null;
  }
  const parsed = readState(stored);
  if (!parsed || parsed.n !== state) {
    return null;
  }
  return { locale: parsed.locale, next: parsed.next };
}

export async function startGoogle(locale: Locale, next: string | null): Promise<NextResponse> {
  if (!googleEnabled()) {
    return new NextResponse(null, { status: 404 });
  }
  const { n, token } = makeState(locale, next);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", `${origin()}/api/auth/callback/google`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", n);
  const response = NextResponse.redirect(url);
  stateCookie(token, response);
  return response;
}

export async function startApple(locale: Locale, next: string | null): Promise<NextResponse> {
  if (!appleEnabled()) {
    return new NextResponse(null, { status: 404 });
  }
  const { n, token } = makeState(locale, next);
  const url = new URL("https://appleid.apple.com/auth/authorize");
  url.searchParams.set("client_id", env.APPLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", `${origin()}/api/auth/callback/apple`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "form_post");
  url.searchParams.set("scope", "name email");
  url.searchParams.set("state", n);
  const response = NextResponse.redirect(url);
  stateCookie(token, response);
  return response;
}

async function finishLogin(
  profile: { email: string; name: string },
  locale: Locale,
  next: string | null,
): Promise<NextResponse> {
  const email = profile.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.redirect(new URL(`/${locale}/prihlaseni`, origin()));
  }
  const name = profile.name.trim().slice(0, 80) || email.split("@")[0]!;
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name,
        role: "registrar",
        emailVerified: new Date(),
        passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12),
      },
    });
  }
  const written = await setSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
  });
  if (!written) {
    return NextResponse.redirect(new URL(`/${locale}/prihlaseni`, origin()));
  }
  redirectAfterLogin(safeAdminNext(next), isStaffRole(user.role as UserRole), locale);
}

export async function finishGoogle(
  code: string | null,
  state: string | null,
): Promise<NextResponse> {
  const parsed = await consumeState(state);
  if (!parsed || !code || !googleEnabled()) {
    return NextResponse.redirect(new URL("/cs/prihlaseni", origin() || "http://localhost:3000"));
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${origin()}/api/auth/callback/google`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL(`/${parsed.locale}/prihlaseni`, origin()));
  }
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) {
    return NextResponse.redirect(new URL(`/${parsed.locale}/prihlaseni`, origin()));
  }
  const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) {
    return NextResponse.redirect(new URL(`/${parsed.locale}/prihlaseni`, origin()));
  }
  const profile = (await profileRes.json()) as { email?: string; name?: string };
  return finishLogin(
    { email: profile.email ?? "", name: profile.name ?? "" },
    parsed.locale,
    parsed.next,
  );
}

function appleClientSecret(): string {
  const pem = (env.APPLE_PRIVATE_KEY ?? "").replaceAll("\\n", "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "ES256", kid: env.APPLE_KEY_ID, typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: env.APPLE_TEAM_ID,
      iat: now,
      exp: now + 60 * 50,
      aud: "https://appleid.apple.com",
      sub: env.APPLE_CLIENT_ID,
    }),
  ).toString("base64url");
  const data = `${header}.${payload}`;
  const key = createPrivateKey(pem);
  const signature = signBytes("sha256", Buffer.from(data), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${data}.${signature.toString("base64url")}`;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

export async function finishApple(
  code: string | null,
  state: string | null,
  userJson: string | null,
): Promise<NextResponse> {
  const parsed = await consumeState(state);
  if (!parsed || !code || !appleEnabled()) {
    return NextResponse.redirect(new URL("/cs/prihlaseni", origin() || "http://localhost:3000"));
  }
  const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.APPLE_CLIENT_ID!,
      client_secret: appleClientSecret(),
      redirect_uri: `${origin()}/api/auth/callback/apple`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL(`/${parsed.locale}/prihlaseni`, origin()));
  }
  const tokens = (await tokenRes.json()) as { id_token?: string };
  const claims = tokens.id_token ? decodeJwtPayload(tokens.id_token) : null;
  const email = typeof claims?.email === "string" ? claims.email : "";
  let name = "";
  if (userJson) {
    try {
      const user = JSON.parse(userJson) as { name?: { firstName?: string; lastName?: string } };
      name = `${user.name?.firstName ?? ""} ${user.name?.lastName ?? ""}`
        .replace(/\s+/g, " ")
        .trim();
    } catch {
      name = "";
    }
  }
  return finishLogin({ email, name }, parsed.locale, parsed.next);
}

export function oauthLocale(raw: string | null): Locale {
  return raw === "en" ? "en" : "cs";
}
