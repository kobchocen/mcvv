import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";

import { prisma } from "@/lib/db/client";
import { renderTransactionalEmail } from "@/lib/mail/layout";
import { mailConfigured, sendResendEmail } from "@/lib/mail/resend";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashToken(token) };
}

export function isTokenShape(token: unknown): token is string {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
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
  const { token, tokenHash } = newToken();
  await prisma.emailVerificationToken.deleteMany({
    where: { userId: input.userId, purpose: "verify" },
  });
  await prisma.emailVerificationToken.create({
    data: {
      userId: input.userId,
      tokenHash,
      purpose: "verify",
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
  const origin = await appOrigin();
  const locale = input.locale === "en" ? "en" : "cs";
  const url = `${origin}/api/auth/verify?token=${token}&locale=${locale}`;
  const { html, text } = renderTransactionalEmail({
    subject: input.subject,
    locale,
    site: origin,
    paragraphs: [input.intro],
    action: { label: input.action, url },
  });
  return sendResendEmail({ to: input.email, subject: input.subject, text, html, kind: "auth" });
}

export async function issuePasswordResetEmail(input: {
  userId: number;
  email: string;
  locale: string;
  subject: string;
  intro: string;
  action: string;
  outro: string;
}): Promise<boolean> {
  if (!mailConfigured()) {
    return false;
  }
  const { token, tokenHash } = newToken();
  await prisma.emailVerificationToken.deleteMany({
    where: { userId: input.userId, purpose: "reset" },
  });
  await prisma.emailVerificationToken.create({
    data: {
      userId: input.userId,
      tokenHash,
      purpose: "reset",
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });
  const origin = await appOrigin();
  const locale = input.locale === "en" ? "en" : "cs";
  const url = `${origin}/${locale}/obnova-hesla?token=${token}`;
  const { html, text } = renderTransactionalEmail({
    subject: input.subject,
    locale,
    site: origin,
    paragraphs: [input.intro],
    action: { label: input.action, url },
    after: [input.outro],
  });
  return sendResendEmail({ to: input.email, subject: input.subject, text, html, kind: "auth" });
}
