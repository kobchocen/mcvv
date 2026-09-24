"use server";

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireStaff } from "@/lib/admin/staff";
import { formChecked, formInt, formString } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";
import { redirect } from "@/i18n/routing";

function revalidatePartners() {
  revalidatePath("/[locale]/admin", "layout");
  revalidatePath("/[locale]/admin/partneri", "page");
}

function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "logo";
  return base.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64);
}

async function saveLogo(file: File | null, fallback: string): Promise<string> {
  if (!file || file.size === 0) {
    return fallback;
  }
  const filename = sanitizeFilename(file.name) || fallback;
  if (!filename) {
    return fallback;
  }
  const dir = join(process.cwd(), "public/partners");
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(dir, filename), buffer);
  return filename;
}

export async function savePartner(formData: FormData): Promise<void> {
  await requireStaff();
  const id = formInt(formData, "id");
  const name = formString(formData, "name") || null;
  const link = formString(formData, "link") || null;
  const imageField = formString(formData, "image");
  const category = formInt(formData, "category") ?? 0;
  const order = formInt(formData, "order") ?? 0;
  const active = formChecked(formData, "active");
  const description = formString(formData, "description");
  const file = formData.get("logo");
  const upload = file instanceof File ? file : null;
  const image = (await saveLogo(upload, imageField)) || null;

  if (id) {
    await prisma.sponsor.update({
      where: { id },
      data: { name, link, image, category, order, active, description },
    });
  } else {
    await prisma.sponsor.create({
      data: { name, link, image, category, order, active, description },
    });
  }

  revalidatePartners();
  const locale = await getLocale();
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
