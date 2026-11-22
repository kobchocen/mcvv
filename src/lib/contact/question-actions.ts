"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/routing";
import { requireSection } from "@/lib/admin/access";
import { formInt } from "@/lib/admin/parse";

import { replyToQuestion, setQuestionStatus } from "./questions";
import { isQuestionStatus } from "./questions-core";

function revalidateQuestions() {
  revalidatePath("/[locale]/admin/zpravy", "layout");
}

async function toQuestion(id: number, query: Record<string, string>): Promise<never> {
  const locale = await getLocale();
  return redirect({
    href: { pathname: "/admin/zpravy/dotazy/[id]", params: { id: String(id) }, query },
    locale,
  });
}

/** Odpovědět na dotaz e-mailem (sekce Zprávy, zápis). */
export async function replyToQuestionAction(formData: FormData): Promise<void> {
  const session = await requireSection("messages", "write");
  const id = formInt(formData, "id");
  if (id === null) return;
  const result = await replyToQuestion(session, id, formData.get("body"));
  revalidateQuestions();
  return toQuestion(id, result === "ok" ? { ok: "replied" } : { chyba: result });
}

/** Změnit stav dotazu: nový / zodpovězený / uzavřený (sekce Zprávy, zápis). */
export async function setQuestionStatusAction(formData: FormData): Promise<void> {
  const session = await requireSection("messages", "write");
  const id = formInt(formData, "id");
  const status = formData.get("status");
  if (id === null || !isQuestionStatus(status)) return;
  const ok = await setQuestionStatus(session, id, status);
  revalidateQuestions();
  return toQuestion(id, ok ? { ok: status } : { chyba: "not_found" });
}
