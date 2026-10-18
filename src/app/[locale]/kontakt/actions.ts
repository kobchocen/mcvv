"use server";

import { headers } from "next/headers";

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
    await sendContactMessage(input);
    return { status: "ok" };
  } catch (error) {
    console.error("[contact] send failed", error);
    return { status: "error", message: "send" };
  }
}
