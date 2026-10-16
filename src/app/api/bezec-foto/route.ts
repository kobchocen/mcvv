import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/client";

export async function GET(request: NextRequest) {
  const idParam = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!idParam || idParam.length > 8) {
    return new Response("Missing id", { status: 400 });
  }

  try {
    const own = await prisma.webImage.findFirst({
      where: { runnerId: idParam, image: { not: null } },
      select: { image: true },
      orderBy: { id: "asc" },
    });

    if (!own?.image) {
      return new Response("Not found", { status: 404 });
    }

    const buffer = Buffer.from(own.image);
    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("[bezec-foto] serve failed", error);
    return new Response("Internal server error", { status: 500 });
  }
}
