"use server";

import bcrypt from "bcryptjs";
import { getLocale } from "next-intl/server";

import { prisma } from "@/lib/db/client";
import { clearSession, isStaffRole, setSession } from "@/lib/auth/session";
import { redirect } from "@/i18n/routing";

export type LoginState = {
  error?: boolean;
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

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !ok) {
    return { error: true };
  }

  if (!user.emailVerified && !isStaffRole(user.role)) {
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

  const locale = await getLocale();
  if (isStaffRole(user.role)) {
    redirect({ href: "/admin", locale });
  }
  redirect({ href: "/prihlasky", locale });
  return {};
}

export async function logout(): Promise<void> {
  await clearSession();
  const locale = await getLocale();
  redirect({ href: "/prihlaseni", locale });
  return;
}
