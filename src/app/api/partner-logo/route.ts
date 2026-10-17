import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/client";
import { logoResponseHeaders } from "@/lib/partners/logo-file";

export async function GET(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return new Response("Invalid id", { status: 400 });
  }
  try {
    const row = await prisma.sponsor.findUnique({
      where: { id },
      select: { logo: true, logoType: true, logoHash: true },
    });
    if (!row?.logo || !row.logoType) {
      return new Response("Not found", { status: 404 });
    }
    const etag = `"${row.logoHash ?? id}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }
    const buffer = Buffer.from(row.logo);
    return new Response(buffer as unknown as BodyInit, {
      headers: { ...logoResponseHeaders(row.logoType, buffer.length), ETag: etag },
    });
  } catch (error) {
    console.error("[partner-logo] serve failed", error);
    return new Response("Internal server error", { status: 500 });
  }
}
