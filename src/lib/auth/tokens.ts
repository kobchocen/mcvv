import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";

import { prisma } from "@/lib/db/client";
import { mailConfigured, sendResendEmail } from "@/lib/mail/resend";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function appOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function issueVerificationEmail(input: {
  userId: number;
  email: string;
  locale: string;
  subject: string;
  intro: string;
  action: string;
}): Promise<boolean> {
  if (!mailConfigured()) {
    return false;
  }
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  await prisma.emailVerificationToken.deleteMany({ where: { userId: input.userId } });
  await prisma.emailVerificationToken.create({
    data: {
      userId: input.userId,
      tokenHash,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
  const origin = await appOrigin();
  const url = `${origin}/${input.locale}/overeni?token=${token}`;
  return sendResendEmail({
    to: input.email,
    subject: input.subject,
    text: `${input.intro}\n${url}\n`,
    html: `<p>${input.intro}</p><p><a href="${url}">${input.action}</a></p>`,
  });
}
