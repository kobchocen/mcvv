import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/client";

/**
 * Test endpoint to verify BLOB images imported from old DB.
 *
 * Fetches the first record from `webimages` that has image data
 * and serves it as a binary response.
 *
 * Usage:
 *   http://localhost:3000/api/test/webimage
 *   http://localhost:3000/api/test/webimage?id=5
 *
 * This is only for verification during data import.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get("id");
  const format = searchParams.get("format"); // "meta" to get info without binary

  try {
    let webImage;

    if (idParam) {
      const id = parseInt(idParam, 10);
      if (isNaN(id)) {
        return new Response("Invalid id", { status: 400 });
      }
      webImage = await prisma.webImage.findUnique({
        where: { id },
        select: { id: true, desc: true, image: true },
      });
    } else {
      // Get the first record that actually has image data
      webImage = await prisma.webImage.findFirst({
        where: { image: { not: null } },
        orderBy: { id: "asc" },
        select: { id: true, desc: true, image: true },
      });
    }

    if (!webImage || !webImage.image) {
      return new Response(
        JSON.stringify({
          error: "No image found",
          message: idParam
            ? `No image data in record with id=${idParam}`
            : "No records with image data in webimages table",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const img = webImage.image;
    const raw: unknown = img;

    // Debug log - this will appear in your terminal where pnpm dev is running
    console.log(
      `[test/webimage] id=${webImage.id}, typeof=${typeof raw}, isBuffer=${Buffer.isBuffer(raw)}, length=${(raw as { length?: number })?.length ?? "n/a"}, ctor=${(raw as { constructor?: { name?: string } } | null)?.constructor?.name}`,
    );

    // Normalize to real Buffer. This is the most common source of problems when importing old BLOB dumps.
    let buffer: Buffer;
    if (Buffer.isBuffer(raw)) {
      buffer = raw;
    } else if (
      raw &&
      typeof raw === "object" &&
      "type" in raw &&
      (raw as { type?: unknown }).type === "Buffer" &&
      Array.isArray((raw as { data?: unknown }).data)
    ) {
      buffer = Buffer.from((raw as unknown as { data: number[] }).data);
    } else if (typeof raw === "string") {
      const s = raw as string;
      // Common cases: base64 or "binary string" (latin1)
      if (/^[A-Za-z0-9+/=]+$/.test(s) && s.length % 4 === 0 && s.length > 100) {
        try {
          const b64 = Buffer.from(s, "base64");
          if (b64.length > 10) {
            buffer = b64;
          } else {
            buffer = Buffer.from(s, "latin1");
          }
        } catch {
          buffer = Buffer.from(s, "latin1");
        }
      } else {
        buffer = Buffer.from(s, "latin1"); // treat as raw byte string
      }
    } else {
      buffer = Buffer.from(raw as Uint8Array);
    }

    if (format === "meta") {
      return new Response(
        JSON.stringify({
          id: webImage.id,
          desc: webImage.desc,
          hasImage: true,
          imageLength: buffer.length,
          isBuffer: Buffer.isBuffer(raw),
          typeof: typeof raw,
          normalizedFrom: Buffer.isBuffer(raw)
            ? "native"
            : raw &&
                typeof raw === "object" &&
                "type" in raw &&
                (raw as { type?: unknown }).type === "Buffer"
              ? "json-buffer"
              : "other",
          firstBytesHex:
            buffer.length > 0
              ? buffer.subarray(0, Math.min(16, buffer.length)).toString("hex")
              : null,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const contentType = detectImageContentType(buffer);

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-store, no-cache",
        "X-Image-Id": webImage.id.toString(),
        // Note: We do NOT put desc here because it can contain non-ASCII
        // and would break the Response headers with "ByteString" error.
      },
    });
  } catch (error: unknown) {
    console.error("Error serving test webimage:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: msg,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
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

  return "image/jpeg"; // fallback for old web images
}
