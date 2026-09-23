"use server";

import { sendContactMessage } from "@/lib/contact/send";

export type ContactFormState = {
  status: "idle" | "ok" | "error";
  message?: string;
};

const schema = {
  name: (value: string) => value.trim().length >= 2 && value.trim().length <= 80,
  email: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),
  message: (value: string) => value.trim().length >= 10 && value.trim().length <= 4000,
};

export async function submitContact(
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  if (String(formData.get("company") ?? "").trim()) {
    return { status: "ok" };
  }

  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const message = String(formData.get("message") ?? "");

  if (!schema.name(name) || !schema.email(email) || !schema.message(message)) {
    return { status: "error", message: "invalid" };
  }

  try {
    await sendContactMessage({ name: name.trim(), email: email.trim(), message: message.trim() });
    return { status: "ok" };
  } catch (error) {
    console.error("[contact] send failed", error);
    return { status: "error", message: "send" };
  }
}
