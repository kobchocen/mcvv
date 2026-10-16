"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/db/client";
import {
  BCRYPT_COST,
  RateLimiter,
  checkNewPassword,
  isResetTokenUsable,
} from "@/lib/auth/password-reset";
import { hashToken, isTokenShape, issuePasswordResetEmail } from "@/lib/auth/tokens";
import { mailConfigured } from "@/lib/mail/resend";
import { redirect } from "@/i18n/routing";

const WINDOW_MS = 15 * 60 * 1000;
const perEmail = new RateLimiter(3, WINDOW_MS);
const perIp = new RateLimiter(10, WINDOW_MS);

export type ForgotState = { sent?: boolean; error?: "mail" };
export type ResetState = { error?: "invalid" | "short" | "mismatch" };

async function clientIp(): Promise<string> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || list.get("x-real-ip") || "unknown";
}

export async function requestPasswordReset(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 255);
  if (!mailConfigured()) {
    return { error: "mail" };
  }
  // Same answer for every input – no account enumeration.
  if (!email || !email.includes("@")) {
    return { sent: true };
  }
  const ipAllowed = perIp.take(await clientIp());
  const emailAllowed = perEmail.take(email);
  if (!ipAllowed || !emailAllowed) {
    return { sent: true };
  }
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const locale = await getLocale();
      const copy = await getTranslations({ locale, namespace: "Auth" });
      await issuePasswordResetEmail({
        userId: user.id,
        email: user.email,
        locale,
        subject: copy("resetSubject"),
        intro: copy("resetIntro"),
        action: copy("resetAction"),
        outro: copy("resetOutro"),
      });
    }
  } catch (error) {
    console.error("password reset request failed", error instanceof Error ? error.message : "");
  }
  return { sent: true };
}

export async function resetPassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const token = formData.get("token");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("passwordConfirm") ?? "");
  if (!isTokenShape(token)) {
    return { error: "invalid" };
  }
  const problem = checkNewPassword(password, confirm);
  if (problem) {
    return { error: problem };
  }
  const row = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!row || !isResetTokenUsable(row)) {
    if (row && row.purpose === "reset") {
      await prisma.emailVerificationToken.deleteMany({ where: { id: row.id } });
    }
    return { error: "invalid" };
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const user = await prisma.user.findUnique({ where: { id: row.userId } });
  if (!user) {
    return { error: "invalid" };
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      // the link proves mailbox ownership, so the address counts as verified
      data: { passwordHash, emailVerified: user.emailVerified ?? new Date() },
    }),
    prisma.emailVerificationToken.deleteMany({ where: { userId: user.id, purpose: "reset" } }),
  ]);
  const locale = await getLocale();
  redirect({ href: { pathname: "/prihlaseni", query: { heslo: "zmeneno" } }, locale });
  return {};
}
