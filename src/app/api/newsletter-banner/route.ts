import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/client";
import { NEWSLETTER_BANNER_TYPE } from "@/lib/newsletter/banner";
import { bannerResponseHeaders } from "@/lib/newsletter/banner-http";
import { detectBitmapType } from "@/lib/partners/logo-file";

/**
 * Veřejný obrázek banneru newsletteru (odkazuje na něj e-mail). Vrací jen obrázky typu
 * „newsletter“ z `webimages` – ne fotky ani jiné obrázky webu. Řádky se nemění (nový
 * banner = nový řádek), proto dlouhá cache.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("id") ?? "";
  const id = /^\d{1,5}$/.test(raw) ? Number(raw) : 0;
  if (!id || id > 32767) {
    return new Response("Invalid id", { status: 400 });
  }
  try {
    const row = await prisma.webImage.findFirst({
      where: { id, type: { desc: NEWSLETTER_BANNER_TYPE } },
      select: { image: true },
    });
    const buffer = row?.image ? Buffer.from(row.image) : null;
    const type = buffer ? detectBitmapType(buffer) : null;
    if (!buffer || !type) {
      return new Response("Not found", { status: 404 });
    }
    const etag = `"nl-banner-${id}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }
    return new Response(buffer as unknown as BodyInit, {
      headers: { ...bannerResponseHeaders(type, buffer.length), ETag: etag },
    });
  } catch (error) {
    console.error("[newsletter-banner] serve failed", error);
    return new Response("Internal server error", { status: 500 });
  }
}
