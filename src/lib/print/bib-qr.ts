import QRCode from "qrcode";

/** Obsah QR na čísle: ročník + startovní číslo, např. MCVV2026-173. */
export function bibQrPayload(year: number, bib: number): string {
  return `MCVV${year}-${bib}`;
}

export type QrMatrix = { size: number; darkAt: (row: number, col: number) => boolean };

export function bibQrMatrix(year: number, bib: number): QrMatrix {
  const qr = QRCode.create(bibQrPayload(year, bib), { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  return {
    size,
    darkAt: (row, col) => qr.modules.get(row, col) === 1,
  };
}
