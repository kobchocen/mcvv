"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";

import { prisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import {
  createLoginGuard,
  DEFAULT_LOGIN_EMAIL_LIMIT,
  DEFAULT_LOGIN_IP_LIMIT,
  loginRateLimit,
} from "@/lib/auth/login-guard";
import { redirectAfterLogin, safeNext } from "@/lib/auth/login-next";
import { requiresVerifiedEmail } from "@/lib/auth/roles";
import { clearSession, setSession } from "@/lib/auth/session";
import { clientIp } from "@/lib/security/rate-limit";
import { redirect, type Locale } from "@/i18n/routing";

const loginGuard = createLoginGuard({
  ipLimit: loginRateLimit(env.LOGIN_RATE_LIMIT_IP, DEFAULT_LOGIN_IP_LIMIT),
  emailLimit: loginRateLimit(env.LOGIN_RATE_LIMIT_EMAIL, DEFAULT_LOGIN_EMAIL_LIMIT),
});

export type LoginState = {
  /** "limited" = too many attempts (generic, never says whether the account exists). */
  error?: boolean | "limited";
  unverified?: boolean;
  email?: string;
};

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: true };
  }

  const limitKey = email.slice(0, 255);
  if (!loginGuard.attempt(clientIp(await headers()), limitKey)) {
    console.warn("[login] rate limited");
    return { error: "limited" };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !ok) {
    return { error: true };
  }
  loginGuard.succeeded(limitKey);

  // Nové role timing/splitmaker potřebují ověřený e-mail stejně jako registrar.
  if (!user.emailVerified && requiresVerifiedEmail(user.role)) {
    return { unverified: true, email: user.email };
  }

  const written = await setSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  if (!written) {
    return { error: true };
  }

  const locale = (await getLocale()) as Locale;
  const next = safeNext(formData.get("next"));
  redirectAfterLogin(next, user.role, locale);
  return {};
}

export async function logout(): Promise<void> {
  await clearSession();
  const locale = await getLocale();
  redirect({ href: "/prihlaseni", locale });
  return;
}

export async function logoutHome(): Promise<void> {
  await clearSession();
  const locale = await getLocale();
  redirect({ href: "/", locale });
  return;
}
