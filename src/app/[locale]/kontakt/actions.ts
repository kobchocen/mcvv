"use server";

import { headers } from "next/headers";
import { getLocale } from "next-intl/server";

import { getSession } from "@/lib/auth/session";
import {
  contactGlobal,
  contactPerEmail,
  contactPerIp,
  validateContactInput,
  verifyFormToken,
} from "@/lib/contact/guard";
import { sendContactMessage } from "@/lib/contact/send";
import { env } from "@/lib/env";
import { redirect } from "@/i18n/routing";
import { normalizeMessageBody, subjectFromBody } from "@/lib/messages/core";
import { createGeneralThread } from "@/lib/messages/service";
import { getMessageSettings, getOrganizerEmail } from "@/lib/settings/messages";
import { LIMITS } from "@/lib/contact/limits";

export type ContactFormState = {
  status: "idle" | "ok" | "error";
  message?: string;
};

async function clientIp(): Promise<string> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || list.get("x-real-ip") || "unknown";
}

export async function submitContact(
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  // Detekovaní boti dostanou falešný úspěch (tichý drop).
  const botOk: ContactFormState = { status: "ok" };

  if (String(formData.get("company") ?? "").trim()) {
    return botOk;
  }

  const session = await getSession();

  // Přihlášený uživatel: zpráva se uloží jako obecné vlákno pod jeho účtem (žádný e-mail).
  if (session && (await getMessageSettings()).enabled) {
    const body = normalizeMessageBody(formData.get("message"));
    if (!body || body.length < LIMITS.messageMin) {
      return { status: "error", message: "invalid" };
    }
    const result = await createGeneralThread(session, subjectFromBody(body), body);
    if (!result.ok) {
      return { status: "error", message: result.error.startsWith("rate") ? "rate" : "invalid" };
    }
    const locale = await getLocale();
    redirect({
      href: { pathname: "/zpravy/[id]", params: { id: String(result.threadId) } },
      locale,
    });
  }

  const secret = env.SESSION_SECRET;
  if (!session && secret && secret.length >= 32) {
    const check = verifyFormToken(String(formData.get("ts") ?? ""), secret);
    if (check === "expired") return { status: "error", message: "expired" };
    if (check !== "ok") {
      console.warn(`[contact] dropped (token ${check})`);
      return botOk;
    }
  }

  const input = validateContactInput({
    name: formData.get("name"),
    email: formData.get("email"),
    message: formData.get("message"),
  });
  if (!input) {
    return { status: "error", message: "invalid" };
  }

  const ip = await clientIp();
  const rateKey = session ? `user:${session.id}` : `ip:${ip}`;
  if (
    !contactPerIp.take(rateKey) ||
    !contactPerEmail.take(input.email.toLowerCase()) ||
    !contactGlobal.take("all")
  ) {
    console.warn("[contact] dropped (rate limit)");
    return botOk;
  }

  try {
    await sendContactMessage(input, undefined, await getOrganizerEmail());
    return { status: "ok" };
  } catch (error) {
    console.error("[contact] send failed", error);
    return { status: "error", message: "send" };
  }
}
