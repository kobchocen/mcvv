import QRCode from "qrcode";

import { spdPayload } from "@/lib/entries/spd";

export const dynamic = "force-dynamic";

const int = (value: string | null, min: number, max: number) => {
  if (!value || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
};

/**
 * PNG QR platby pro e-maily (e-mailoví klienti nezobrazují inline SVG ani data: URI).
 * Generuje jen QR na klubový účet – parametry nic neprozrazují.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const year = int(url.searchParams.get("rok"), 2000, 2100);
  const id = int(url.searchParams.get("id"), 1, 9999);
  const amount = int(url.searchParams.get("castka"), 1, 100000);
  if (!year || !id || !amount) return new Response("bad request", { status: 400 });
  const png = await QRCode.toBuffer(spdPayload(year, id, amount), {
    type: "png",
    width: 300,
    margin: 1,
    errorCorrectionLevel: "M",
  });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
  });
}
