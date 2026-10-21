import sharp from "sharp";

import { detectBitmapType } from "@/lib/partners/logo-file";

import { BANNER_MIN_WIDTH, BANNER_WIDTH, MAX_BANNER_BYTES, type BannerImageError } from "./banner";

export type ProcessedBanner =
  | {
      ok: true;
      data: Buffer;
      type: "image/png" | "image/jpeg";
      width: number;
      height: number;
    }
  | { ok: false; error: BannerImageError };

/** Max. poměr výšky k šířce – banner, ne celostránkový obrázek. */
const MAX_HEIGHT_RATIO = 1.5;

/**
 * Nahraný banner (JPG/PNG/WebP podle magic bytes, max. 1 MB) zmenší na šířku 1200 px
 * (retina pro zobrazení v 600 px, menší obrázek nezvětšuje), otočí podle EXIF a zahodí
 * metadata. Výstup je PNG, pokud má obrázek průhlednost, jinak JPEG – WebP v e-mailu
 * nepodporuje Outlook ani část webmailů.
 */
export async function processBannerImage(input: Uint8Array): Promise<ProcessedBanner> {
  if (input.length === 0) return { ok: false, error: "empty" };
  if (input.length > MAX_BANNER_BYTES) return { ok: false, error: "too_large" };
  if (!detectBitmapType(input)) return { ok: false, error: "type" };
  try {
    const image = sharp(input, { limitInputPixels: 40_000_000, failOn: "error" }).rotate();
    const meta = await image.metadata();
    const width = meta.autoOrient?.width ?? meta.width;
    const height = meta.autoOrient?.height ?? meta.height;
    if (!width || !height) return { ok: false, error: "invalid" };
    if (width < BANNER_MIN_WIDTH) return { ok: false, error: "too_small" };
    if (height > width * MAX_HEIGHT_RATIO) return { ok: false, error: "invalid" };
    const resized = image.resize({ width: BANNER_WIDTH, withoutEnlargement: true });
    const { data, info } = meta.hasAlpha
      ? await resized.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer({
          resolveWithObject: true,
        })
      : await resized
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 85, progressive: true, mozjpeg: true })
          .toBuffer({ resolveWithObject: true });
    return {
      ok: true,
      data,
      type: meta.hasAlpha ? "image/png" : "image/jpeg",
      width: info.width,
      height: info.height,
    };
  } catch {
    return { ok: false, error: "invalid" };
  }
}
