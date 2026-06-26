import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/client";

/**
 * Test endpoint to verify BLOB images imported from old DB (mcvv_fotky table).
 *
 * Fetches the first record from `mcvv_fotky` that has image data
 * and serves it as a binary response.
 *
 * Usage:
 *   http://localhost:3000/api/test/fotka
 *   http://localhost:3000/api/test/fotka?id=123
 *
 * This is only for verification during data import.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get("id");

  try {
    let photo;

    if (idParam) {
      const id = parseInt(idParam, 10);
      if (isNaN(id)) {
        return new Response("Invalid id", { status: 400 });
      }
      photo = await prisma.photo.findUnique({
        where: { id },
        select: { id: true, year: true, originalFilename: true, debugText: true, image: true },
      });
    } else {
      // Get the first record that actually has image data
      photo = await prisma.photo.findFirst({
        where: { image: { not: null } },
        orderBy: { id: "asc" },
        select: { id: true, year: true, originalFilename: true, debugText: true, image: true },
      });
    }

    if (!photo || !photo.image) {
      return new Response(
        JSON.stringify({
          error: "No image found",
          message: idParam
            ? `No image data in record with id=${idParam}`
            : "No records with image data in mcvv_fotky table",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const buffer = Buffer.from(photo.image);
    const contentType = detectImageContentType(buffer);

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-store, no-cache",
        "X-Image-Id": photo.id.toString(),
        "X-Image-Year": photo.year?.toString() || "",
        "X-Image-Filename": photo.originalFilename || "",
      },
    });
  } catch (error) {
    console.error("Error serving test fotka:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/** Very basic image type detection from magic bytes */
function detectImageContentType(buffer: Buffer): string {
  if (buffer.length < 4) return "application/octet-stream";

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  // GIF
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return "image/gif";
  }

  return "image/jpeg"; // fallback
}
