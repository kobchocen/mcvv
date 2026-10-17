"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireStaff } from "@/lib/admin/staff";
import { formChecked, formInt, formString } from "@/lib/admin/parse";
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

export async function savePartner(formData: FormData): Promise<void> {
  await requireStaff();
  const id = formInt(formData, "id");
  const name = formString(formData, "name") || null;
  const link = formString(formData, "link") || null;
  const image = formString(formData, "image") || null;
  const category = formInt(formData, "category") ?? 0;
  const order = formInt(formData, "order") ?? 0;
  const active = formChecked(formData, "active");
  const description = formString(formData, "description");
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

  if (id) {
    await prisma.sponsor.update({
      where: { id },
      data: { name, link, image, category, order, active, description, ...logoData },
    });
  } else {
    await prisma.sponsor.create({
      data: { name, link, image, category, order, active, description, ...logoData },
    });
  }

  revalidatePartners();
  revalidatePath("/[locale]", "page");
  redirect({ href: "/admin/partneri", locale });
}

export async function deactivatePartner(formData: FormData): Promise<void> {
  await requireStaff();
  const id = formInt(formData, "id");
  if (!id) {
    return;
  }
  await prisma.sponsor.update({ where: { id }, data: { active: false } });
  revalidatePartners();
}
