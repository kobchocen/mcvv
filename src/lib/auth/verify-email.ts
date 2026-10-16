import { prisma } from "@/lib/db/client";
import { setSession } from "@/lib/auth/session";
import { hashToken } from "@/lib/auth/tokens";

export type VerifyResult = "ok" | "invalid";

/**
 * Consume a single-use e-mail verification token: mark the e-mail verified,
 * delete the token(s) and start a session. Must run where cookies are writable
 * (route handler / server action).
 */
export async function verifyEmailToken(token: string | null | undefined): Promise<VerifyResult> {
  if (!token || !/^[a-f0-9]{16,128}$/i.test(token)) {
    return "invalid";
  }
  const row = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!row || row.purpose !== "verify") {
    return "invalid";
  }
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.emailVerificationToken.deleteMany({ where: { id: row.id } });
    return "invalid";
  }
  if (!row.user.emailVerified) {
    await prisma.user.update({
      where: { id: row.userId },
      data: { emailVerified: new Date() },
    });
  }
  // single use: drop every outstanding verification token of the user
  await prisma.emailVerificationToken.deleteMany({
    where: { userId: row.userId, purpose: "verify" },
  });
  await setSession({
    id: row.user.id,
    email: row.user.email,
    name: row.user.name,
    role: row.user.role,
  });
  return "ok";
}

export function verifyLocale(raw: string | null | undefined): "cs" | "en" {
  return raw === "en" ? "en" : "cs";
}
