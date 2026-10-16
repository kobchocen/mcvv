import { getLocale, getTranslations } from "next-intl/server";

import { mailConfigured, sendResendEmail } from "@/lib/mail/resend";

export async function sendConfirmationEmail(input: {
  year: number;
  id: number;
  email: string | null | undefined;
  name: string | null | undefined;
  lines: { runner: string; club: string; category: string; fee: number }[];
  fee: number;
  paid: number;
}): Promise<boolean> {
  if (!input.email || !mailConfigured()) {
    return false;
  }
  const locale = await getLocale();
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const runners = input.lines
    .map((line) => `${line.runner} · ${line.club} · ${line.category} · ${line.fee} Kč`)
    .join("\n");
  const runnersHtml = input.lines
    .map(
      (line) =>
        `<li>${escapeHtml(line.runner)} · ${escapeHtml(line.club)} · ${escapeHtml(line.category)} · ${line.fee} Kč</li>`,
    )
    .join("");
  const subject = copy("confirmMailSubject", { year: input.year, id: input.id });
  const intro = copy("confirmMailIntro", { name: input.name || input.email });
  const thanks = copy("confirmMailThanks");
  const totals = `${copy("regsFee")} ${input.fee} Kč · ${copy("regsPaid")} ${input.paid} Kč`;
  return sendResendEmail({
    to: input.email,
    subject,
    text: `${intro}\n\n${runners}\n\n${totals}\n\n${thanks}\n`,
    html: `<p>${escapeHtml(intro)}</p><ul>${runnersHtml}</ul><p>${escapeHtml(totals)}</p><p>${escapeHtml(thanks)}</p>`,
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
