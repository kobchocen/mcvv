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
import { forgotAnswer, normalizeForgotEmail, processForgotRequest } from "@/lib/auth/forgot-core";
import {
  hashToken,
  isTokenShape,
  issuePasswordResetEmail,
  issueSignupInviteEmail,
} from "@/lib/auth/tokens";
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
  if (!mailConfigured()) {
    return { error: "mail" };
  }
  const email = normalizeForgotEmail(formData.get("email"));
  const locale = await getLocale();
  const copy = await getTranslations({ locale, namespace: "Auth" });
  const outcome = await processForgotRequest(email, await clientIp(), {
    perIp,
    perEmail,
    findAccount: (address) =>
      prisma.user.findUnique({ where: { email: address }, select: { id: true, email: true } }),
    sendReset: (account) =>
      issuePasswordResetEmail({
        userId: account.id,
        email: account.email,
        locale,
        subject: copy("resetSubject"),
        intro: copy("resetIntro"),
        action: copy("resetAction"),
        outro: copy("resetOutro"),
      }),
    sendSignupInvite: (address) =>
      issueSignupInviteEmail({
        email: address,
        locale,
        subject: copy("signupInviteSubject"),
        intro: copy("signupInviteIntro"),
        action: copy("signupInviteAction"),
        outro: copy("signupInviteOutro"),
      }),
    log: (message) => console.error("password reset request failed", message),
  });
  // Same answer for every input and outcome – no account enumeration.
  return forgotAnswer(outcome);
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
