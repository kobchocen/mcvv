"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireStaff } from "@/lib/admin/staff";
import { formChecked, formInt, formString } from "@/lib/admin/parse";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/log";
import { partnerSnapshot, partnerTarget } from "@/lib/audit/startlist";
import { prisma } from "@/lib/db/client";
import { validateLogo } from "@/lib/partners/logo-file";
import { redirect } from "@/i18n/routing";

function revalidatePartners() {
  revalidatePath("/[locale]/admin", "layout");
  revalidatePath("/[locale]/admin/partneri", "page");
}

type LogoUpload =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "ok"; logo: Uint8Array<ArrayBuffer>; logoType: string; logoHash: string };

/**
 * Uploaded logos are stored in the DB (sponsors.logo) instead of public/partners: the
 * container filesystem is ephemeral and files written at runtime are lost on redeploy.
 * Only PNG/JPEG/WebP (magic bytes) and sanitized SVG are accepted.
 */
async function readLogo(file: File | null): Promise<LogoUpload> {
  if (!file || file.size === 0) {
    return { kind: "none" };
  }
  const result = validateLogo(Buffer.from(await file.arrayBuffer()), file.name);
  if (!result.ok) {
    return { kind: "invalid" };
  }
  const logoHash = createHash("sha256").update(result.data).digest("hex").slice(0, 16);
  return {
    kind: "ok",
    logo: new Uint8Array(result.data),
    logoType: result.type,
    logoHash,
  };
}

/** Pole partnera pro audit (bez binárních dat loga). */
const PARTNER_AUDIT_SELECT = {
  name: true,
  link: true,
  image: true,
  category: true,
  order: true,
  active: true,
  description: true,
  general: true,
  logoType: true,
  logoHash: true,
} as const;

/** Bez nového loga se typ / otisk nemění – do porovnání jen pole, která formulář ukládá. */
function withoutLogo<T extends { logoType: string | null; logoHash: string | null }>(row: T) {
  return { ...row, logoType: undefined, logoHash: undefined };
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Generální partner je nejvýš jeden: ostatním příznak zruší (s auditem). */
async function clearOtherGeneral(
  tx: Tx,
  keepId: number | null,
  session: Awaited<ReturnType<typeof requireStaff>>,
): Promise<void> {
  const others = await tx.sponsor.findMany({
    where: { general: true, ...(keepId ? { NOT: { id: keepId } } : {}) },
    select: { id: true },
  });
  for (const other of others) {
    await tx.sponsor.update({ where: { id: other.id }, data: { general: false } });
    await writeAudit(
      {
        actor: session,
        action: "partner.updated",
        target: partnerTarget(other.id),
        detail: { changes: diffFields({ general: true }, { general: false }) },
      },
      tx,
    );
  }
}

export async function savePartner(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = formInt(formData, "id");
  const name = formString(formData, "name") || null;
  const link = formString(formData, "link") || null;
  const image = formString(formData, "image") || null;
  const category = formInt(formData, "category") ?? 0;
  const order = formInt(formData, "order") ?? 0;
  const active = formChecked(formData, "active");
  const description = formString(formData, "description");
  /** Q153: generální partner – pevné logo na resultboardu; jen aktivní, nejvýš jeden. */
  const general = active && formChecked(formData, "general");
  const file = formData.get("logo");
  const upload = await readLogo(file instanceof File ? file : null);
  const locale = await getLocale();
  if (upload.kind === "invalid") {
    if (id) {
      redirect({
        href: {
          pathname: "/admin/partneri/[id]",
          params: { id: String(id) },
          query: { logo: "invalid" },
        },
        locale,
      });
    } else {
      redirect({ href: { pathname: "/admin/partneri/novy", query: { logo: "invalid" } }, locale });
    }
    return;
  }
  const logoData =
    upload.kind === "ok"
      ? { logo: upload.logo, logoType: upload.logoType, logoHash: upload.logoHash }
      : {};

  const fields = { name, link, image, category, order, active, description, general };
  const logoAudit =
    upload.kind === "ok" ? { logoType: upload.logoType, logoHash: upload.logoHash } : {};

  if (id) {
    const before = await prisma.sponsor.findUnique({
      where: { id },
      select: PARTNER_AUDIT_SELECT,
    });
    await prisma.$transaction(async (tx) => {
      if (general) await clearOtherGeneral(tx, id, session);
      await tx.sponsor.update({ where: { id }, data: { ...fields, ...logoData } });
    });
    const changes = diffFields(
      before ? partnerSnapshot(upload.kind === "ok" ? before : withoutLogo(before)) : null,
      partnerSnapshot({ ...fields, ...logoAudit }),
    );
    if (Object.keys(changes).length > 0) {
      await writeAudit({
        actor: session,
        action: "partner.updated",
        target: partnerTarget(id),
        detail: { changes },
      });
    }
  } else {
    const created = await prisma.$transaction(async (tx) => {
      if (general) await clearOtherGeneral(tx, null, session);
      return tx.sponsor.create({ data: { ...fields, ...logoData }, select: { id: true } });
    });
    await writeAudit({
      actor: session,
      action: "partner.created",
      target: partnerTarget(created.id),
      detail: { changes: diffFields(null, partnerSnapshot({ ...fields, ...logoAudit })) },
    });
  }

  revalidatePartners();
  revalidatePath("/[locale]", "page");
  redirect({ href: "/admin/partneri", locale });
}

/** „Smazání“ partnera = deaktivace (řádek v `sponsors` zůstává). */
export async function deactivatePartner(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = formInt(formData, "id");
  if (!id) {
    return;
  }
  const before = await prisma.sponsor.findUnique({
    where: { id },
    select: { active: true, general: true },
  });
  // neaktivní partner nemůže být generální (pevné logo by na resultboardu zmizelo potichu)
  await prisma.sponsor.update({ where: { id }, data: { active: false, general: false } });
  if (before && (before.active !== false || before.general)) {
    await writeAudit({
      actor: session,
      action: "partner.deactivated",
      target: partnerTarget(id),
      detail: { changes: diffFields(before, { active: false, general: false }) },
    });
  }
  revalidatePartners();
}
