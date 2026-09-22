import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/client";

export async function GET(request: NextRequest) {
  const idParam = request.nextUrl.searchParams.get("id");
  if (!idParam) {
    return new Response("Missing id", { status: 400 });
  }

  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return new Response("Invalid id", { status: 400 });
  }

  try {
    const photo = await prisma.photo.findUnique({
      where: { id },
      select: { id: true, year: true, image: true },
    });

    if (!photo?.image) {
      return new Response("Not found", { status: 404 });
    }

    const buffer = Buffer.from(photo.image);
    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": detectImageContentType(buffer),
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=86400, immutable",
        "X-Image-Id": String(photo.id),
        "X-Image-Year": photo.year?.toString() || "",
      },
    });
  } catch (error) {
    console.error("[fotka] serve failed", error);
    return new Response("Internal server error", { status: 500 });
  }
}

function detectImageContentType(buffer: Buffer): string {
  if (buffer.length < 4) return "application/octet-stream";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return "image/gif";
  }
  return "image/jpeg";
}
