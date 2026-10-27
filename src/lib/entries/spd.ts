import QRCode from "qrcode";

export const BANK_ACCOUNT = "2700938285/2010";
export const BANK_IBAN = "CZ8820100000002700938285";
export const BANK_BIC = "FIOBCZPPXXX";

export function variableSymbol(year: number, id: number): string {
  return `${year}${id}`;
}

/** Obecná QR platba (SPD 1.0) na účet závodu: celé Kč, VS a zpráva pro příjemce. */
export function spdPaymentPayload(input: { amount: number; vs: string; message: string }): string {
  const am = `${input.amount}.00`;
  return `SPD*1.0*ACC:${BANK_IBAN}*AM:${am}*CC:CZK*MSG:${input.message}*X-VS:${input.vs}`;
}

export function spdPayload(year: number, id: number, amount: number): string {
  return spdPaymentPayload({
    amount,
    vs: variableSymbol(year, id),
    message: `STARTOVNE MCVV PRIHLASKA ${id}`,
  });
}

export async function spdPaymentQrSvg(input: {
  amount: number;
  vs: string;
  message: string;
}): Promise<string> {
  return QRCode.toString(spdPaymentPayload(input), {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });
}

export async function spdQrSvg(year: number, id: number, amount: number): Promise<string> {
  return QRCode.toString(spdPayload(year, id, amount), {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });
}
