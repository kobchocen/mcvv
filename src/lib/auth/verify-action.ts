"use server";

import { getLocale } from "next-intl/server";

import { prisma } from "@/lib/db/client";
import { setSession } from "@/lib/auth/session";
import { hashToken } from "@/lib/auth/tokens";
import { redirect } from "@/i18n/routing";

export type VerifyState = {
  error?: boolean;
};

export async function consumeVerificationToken(
  _prev: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const token = String(formData.get("token") ?? "");
  if (!token) {
    return { error: true };
  }
  const row = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!row || row.expiresAt.getTime() < Date.now()) {
    if (row) {
      await prisma.emailVerificationToken.delete({ where: { id: row.id } });
    }
    return { error: true };
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { emailVerified: new Date() },
    }),
    prisma.emailVerificationToken.deleteMany({ where: { userId: row.userId } }),
  ]);
  const written = await setSession({
    id: row.user.id,
    email: row.user.email,
    name: row.user.name,
    role: row.user.role,
  });
  if (!written) {
    return { error: true };
  }
  const locale = await getLocale();
  redirect({ href: "/prihlasky", locale });
  return {};
}
