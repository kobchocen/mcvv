"use server";

import { revalidatePath } from "next/cache";

import { formInt } from "@/lib/admin/parse";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { isCancelledStatus } from "@/lib/entries/ensure-core";
import { isPaidStatus } from "@/lib/slots/late-core";

import { runPaymentsJob } from "./job";
import { stateDate, verifyStateName, verifyWaitSeconds } from "./verify-core";

export type VerifyPaymentState = {
  result?: "paid" | "not_yet" | "wait" | "error" | "invalid";
  /** Za kolik sekund lze znovu ověřit. */
  retryIn?: number;
  /** Čas odpovědi (klient podle něj resetuje odpočet). */
  at?: number;
};

async function entryStatus(year: number, id: number, email: string) {
  const [reg, meta] = await Promise.all([
    prisma.registration.findFirst({
      where: { year, id, email: { equals: email } },
      select: { status: true },
    }),
    prisma.registrationMeta.findUnique({
      where: { year_id: { year, id } },
      select: { slot: true, submittedAt: true },
    }),
  ]);
  if (!reg || meta?.slot !== "late" || !meta.submittedAt) return null;
  return reg.status;
}

/**
 * „Zaplatil(a) jsem – ověřit platbu“ u odeslané pozdní přihlášky: hned stáhne pohyby z Fio
 * a spáruje je (stejný job jako cron). Max. 1× za 30 s na přihlášku a nikdy častěji, než
 * dovolí limit Fio API.
 */
export async function verifyLatePayment(
  _prev: VerifyPaymentState,
  formData: FormData,
): Promise<VerifyPaymentState> {
  const at = Date.now();
  const session = await getSession();
  const year = formInt(formData, "year");
  const id = formInt(formData, "registrationId");
  if (!session || year === null || id === null) return { result: "invalid", at };
  const status = await entryStatus(year, id, session.email);
  if (status === null || isCancelledStatus(status)) {
    revalidatePath("/[locale]/prihlasky", "page");
    return { result: "invalid", at };
  }
  if (isPaidStatus(status)) {
    revalidatePath("/[locale]/prihlasky", "page");
    return { result: "paid", at };
  }
  const now = new Date();
  const name = verifyStateName(year, id);
  const [lastVerify, lastFio] = await Promise.all([
    prisma.jobState.findUnique({ where: { name } }),
    prisma.jobState.findUnique({ where: { name: "fio_last_request_at" } }),
  ]);
  const wait = verifyWaitSeconds(now, stateDate(lastVerify?.value), stateDate(lastFio?.value));
  if (wait > 0) return { result: "wait", retryIn: wait, at };
  const value = now.toISOString();
  await prisma.jobState.upsert({ where: { name }, create: { name, value }, update: { value } });

  let failed = false;
  try {
    const job = await runPaymentsJob({ now });
    if (job.status === "skipped" && job.reason !== "not_configured") {
      // Souběh s cronem (zámek / limit Fio) – výsledek cronu se projeví obnovením stránky.
      return { result: "wait", retryIn: 30, at };
    }
    failed = job.status === "failed";
  } catch {
    failed = true;
  }
  const after = await entryStatus(year, id, session.email);
  revalidatePath("/[locale]/prihlasky", "page");
  if (isPaidStatus(after)) return { result: "paid", at };
  return { result: failed ? "error" : "not_yet", retryIn: 30, at };
}
