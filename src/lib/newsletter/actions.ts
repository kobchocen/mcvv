"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { formChecked, formInt, formString } from "@/lib/admin/parse";
import { requireStaff } from "@/lib/admin/staff";
import { prisma } from "@/lib/db/client";
import { redirect } from "@/i18n/routing";

import {
  normalizeEmail,
  renderNewsletter,
  unsubscribeHeaders,
  unsubscribeUrl,
  type BatchOutcome,
} from "./core";
import {
  BANNER_ERROR_MESSAGES,
  bannerPreset,
  campaignBanner,
  normalizeBannerAlt,
  normalizeBannerLink,
  parseBannerChoice,
} from "./banner";
import { processBannerImage } from "./banner-image";
import { bannerImageExists, storeBannerImage } from "./banner-store";
import { newsletterOrigin } from "./origin";
import { runNewsletterBatch } from "./runner";
import { ensureOptOutTokens, loadAudience, tokenFor } from "./store";
import { newsletterMailConfigured, sendNewsletterBatch } from "./transport";
import { applyUnsubscribe, isUnsubscribeToken, type UnsubscribeResult } from "./unsubscribe";
import { prismaUnsubscribeStore } from "./store";

export type ActionState = { ok: boolean; message: string } | null;

function revalidateNewsletter(id?: number) {
  revalidatePath("/[locale]/admin/newsletter", "page");
  if (id) revalidatePath("/[locale]/admin/newsletter/[id]", "page");
}

function clampYears(value: number | null): number {
  return Math.min(30, Math.max(0, value ?? 0));
}

type BannerFields = {
  bannerImageId: number | null;
  bannerPreset: string | null;
  bannerAlt: string | null;
  bannerLink: string | null;
};

type BannerError = keyof typeof BANNER_ERROR_MESSAGES;

/**
 * Banner z formuláře: nahraný soubor má přednost před výběrem. Při chybě se banner nemění
 * (ostatní úpravy kampaně se uloží) a stránka ukáže hlášku.
 */
async function bannerFromForm(
  formData: FormData,
): Promise<{ fields: BannerFields } | { error: BannerError }> {
  const alt = normalizeBannerAlt(formString(formData, "bannerAlt"));
  const link = normalizeBannerLink(formString(formData, "bannerLink"));
  if (!link) return { error: "link" };
  const file = formData.get("bannerFile");
  if (file instanceof File && file.size > 0) {
    if (!alt) return { error: "alt" };
    const processed = await processBannerImage(new Uint8Array(await file.arrayBuffer()));
    if (!processed.ok) return { error: processed.error };
    const id = await storeBannerImage(processed.data, alt);
    return { fields: { bannerImageId: id, bannerPreset: null, bannerAlt: alt, bannerLink: link } };
  }
  const choice = parseBannerChoice(formString(formData, "banner"));
  if (!choice) return { error: "choice" };
  if (choice.kind === "none") {
    return {
      fields: { bannerImageId: null, bannerPreset: null, bannerAlt: null, bannerLink: null },
    };
  }
  if (choice.kind === "preset") {
    const presetAlt = normalizeBannerAlt(bannerPreset(choice.key)?.alt);
    return {
      fields: {
        bannerImageId: null,
        bannerPreset: choice.key,
        bannerAlt: alt || presetAlt,
        bannerLink: link,
      },
    };
  }
  if (!(await bannerImageExists(choice.id))) return { error: "choice" };
  if (!alt) return { error: "alt" };
  return {
    fields: { bannerImageId: choice.id, bannerPreset: null, bannerAlt: alt, bannerLink: link },
  };
}

export async function saveNewsletter(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = formInt(formData, "id");
  const subject = formString(formData, "subject").slice(0, 200);
  const body = String(formData.get("body") ?? "");
  const audienceUsers = formChecked(formData, "audienceUsers");
  const audienceYears = clampYears(formInt(formData, "audienceYears"));
  const excludeCurrentEntrants = formChecked(formData, "excludeCurrentEntrants");
  const locale = await getLocale();
  if (!subject || !body.trim()) {
    throw new Error("Předmět i text jsou povinné.");
  }
  let campaignId = id;
  if (id) {
    const existing = await prisma.newsletterCampaign.findUnique({ where: { id } });
    if (!existing || existing.status === "sending" || existing.status === "sent") {
      throw new Error("Odesílanou nebo odeslanou kampaň nelze upravit.");
    }
  }
  const banner = await bannerFromForm(formData);
  const bannerData = "fields" in banner ? banner.fields : {};
  if (id) {
    // Any edit invalidates the previous test send.
    await prisma.newsletterCampaign.update({
      where: { id },
      data: {
        subject,
        body,
        audienceUsers,
        audienceYears,
        excludeCurrentEntrants,
        ...bannerData,
        status: "draft",
        testSentAt: null,
      },
    });
  } else {
    const created = await prisma.newsletterCampaign.create({
      data: {
        subject,
        body,
        audienceUsers,
        audienceYears,
        excludeCurrentEntrants,
        ...bannerData,
        createdById: session.id,
      },
    });
    campaignId = created.id;
  }
  revalidateNewsletter(campaignId ?? undefined);
  redirect({
    href: {
      pathname: "/admin/newsletter/[id]",
      params: { id: String(campaignId) },
      ...("error" in banner ? { query: { banner: banner.error } } : {}),
    },
    locale,
  });
}

export async function sendNewsletterTest(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();
  const id = formInt(formData, "id");
  const to = normalizeEmail(formString(formData, "to"));
  if (!id || !to) {
    return { ok: false, message: "Zadejte platný e-mail." };
  }
  if (!newsletterMailConfigured()) {
    return { ok: false, message: "Resend není nakonfigurován (RESEND_API_KEY, MAIL_FROM)." };
  }
  const campaign = await prisma.newsletterCampaign.findUnique({ where: { id } });
  if (!campaign) return { ok: false, message: "Kampaň nenalezena." };
  const origin = await newsletterOrigin();
  const token = await tokenFor(to);
  const mail = renderNewsletter({
    subject: `[TEST] ${campaign.subject}`,
    body: campaign.body,
    unsubscribeUrl: unsubscribeUrl(origin, token),
    siteUrl: origin,
    banner: campaignBanner(campaign, origin),
  });
  const result = await sendNewsletterBatch(
    [{ ...mail, to, headers: unsubscribeHeaders(origin, token) }],
    `mcvv-nl-test-${id}-${randomUUID()}`,
    { dryRun: false },
  );
  if (!result.ok) return { ok: false, message: `Odeslání selhalo: ${result.error}` };
  if (campaign.status === "draft" || campaign.status === "test_sent") {
    await prisma.newsletterCampaign.update({
      where: { id },
      data: { status: "test_sent", testSentAt: new Date() },
    });
  }
  revalidateNewsletter(id);
  return { ok: true, message: `Testovací e-mail odeslán na ${to}.` };
}

export async function startNewsletter(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();
  const id = formInt(formData, "id");
  const confirm = formInt(formData, "confirmCount");
  if (!id) return { ok: false, message: "Chybí kampaň." };
  const campaign = await prisma.newsletterCampaign.findUnique({ where: { id } });
  if (!campaign) return { ok: false, message: "Kampaň nenalezena." };
  if (campaign.status !== "test_sent") {
    return { ok: false, message: "Nejdřív odešlete testovací e-mail (po úpravě znovu)." };
  }
  const audience = await loadAudience({
    users: campaign.audienceUsers,
    years: campaign.audienceYears,
    excludeCurrentEntrants: campaign.excludeCurrentEntrants,
  });
  if (audience.emails.length === 0) return { ok: false, message: "Publikum je prázdné." };
  if (confirm !== audience.emails.length) {
    return {
      ok: false,
      message: `Potvrzení nesouhlasí: publikum má nyní ${audience.emails.length} adres.`,
    };
  }
  // Conditional status switch so a double submit cannot start twice.
  const switched = await prisma.newsletterCampaign.updateMany({
    where: { id, status: "test_sent" },
    data: { status: "sending", startedAt: new Date() },
  });
  if (switched.count !== 1) return { ok: false, message: "Kampaň už se odesílá." };
  await ensureOptOutTokens(audience.emails);
  for (let i = 0; i < audience.emails.length; i += 500) {
    await prisma.newsletterRecipient.createMany({
      data: audience.emails.slice(i, i + 500).map((email) => ({ campaignId: id, email })),
      skipDuplicates: true,
    });
  }
  revalidateNewsletter(id);
  return { ok: true, message: `Zařazeno ${audience.emails.length} příjemců.` };
}

export async function sendNewsletterBatchAction(id: number): Promise<BatchOutcome> {
  await requireStaff();
  const outcome = await runNewsletterBatch(id);
  if (outcome.done) revalidateNewsletter(id);
  return outcome;
}

/** Re-queue failed recipients (explicit admin decision; may re-send interrupted ones). */
export async function retryFailedNewsletter(formData: FormData): Promise<void> {
  await requireStaff();
  const id = formInt(formData, "id");
  if (!id) return;
  const result = await prisma.newsletterRecipient.updateMany({
    where: { campaignId: id, status: "failed" },
    data: { status: "pending", claimToken: null, claimedAt: null, error: null },
  });
  if (result.count > 0) {
    await prisma.newsletterCampaign.update({
      where: { id },
      data: { status: "sending", sentAt: null },
    });
  }
  revalidateNewsletter(id);
}

export async function deleteNewsletterDraft(formData: FormData): Promise<void> {
  await requireStaff();
  const id = formInt(formData, "id");
  const locale = await getLocale();
  if (id) {
    await prisma.newsletterCampaign.deleteMany({
      where: { id, status: { in: ["draft", "test_sent"] } },
    });
  }
  revalidateNewsletter();
  redirect({ href: "/admin/newsletter", locale });
}

export async function unsubscribeAction(
  _prev: UnsubscribeResult | null,
  formData: FormData,
): Promise<UnsubscribeResult> {
  const token = formString(formData, "token");
  if (!isUnsubscribeToken(token)) return "invalid";
  return applyUnsubscribe(prismaUnsubscribeStore, token);
}
