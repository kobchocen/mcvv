"use server";

import bcrypt from "bcryptjs";
import { getLocale, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/db/client";
import { isStaffRole } from "@/lib/auth/session";
import { issueVerificationEmail } from "@/lib/auth/tokens";
import { mailConfigured } from "@/lib/mail/resend";

export type RegisterState = {
  error?: "mail" | "exists" | "generic";
  sent?: boolean;
};

export async function registerAccount(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name || !email || password.length < 8) {
    return { error: "generic" };
  }

  if (!mailConfigured()) {
    return { error: "mail" };
  }

  const locale = await getLocale();
  const copy = await getTranslations({ locale, namespace: "Auth" });
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing?.emailVerified) {
    return { error: "exists" };
  }

  let userId = existing?.id;
  if (!existing) {
    const created = await prisma.user.create({
      data: {
        email,
        name: name.slice(0, 80),
        passwordHash: await bcrypt.hash(password, 12),
        role: "registrar",
      },
    });
    userId = created.id;
  } else if (!isStaffRole(existing.role)) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { name: name.slice(0, 80), passwordHash: await bcrypt.hash(password, 12) },
    });
  }

  if (!userId) {
    return { error: "generic" };
  }

  const sent = await issueVerificationEmail({
    userId,
    email,
    locale,
    subject: copy("verifySubject"),
    intro: copy("verifyIntro"),
    action: copy("verifyAction"),
  });
  if (!sent) {
    if (!existing) {
      await prisma.user.delete({ where: { id: userId } });
    }
    return { error: "mail" };
  }
  return { sent: true };
}

export async function resendVerification(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email || !mailConfigured()) {
    return { error: "mail" };
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerified || isStaffRole(user.role)) {
    return { sent: true };
  }
  const locale = await getLocale();
  const copy = await getTranslations({ locale, namespace: "Auth" });
  const sent = await issueVerificationEmail({
    userId: user.id,
    email: user.email,
    locale,
    subject: copy("verifySubject"),
    intro: copy("verifyIntro"),
    action: copy("verifyAction"),
  });
  return sent ? { sent: true } : { error: "mail" };
}
