import QRCode from "qrcode";

export const BANK_ACCOUNT = "2700938285/2010";
export const BANK_IBAN = "CZ8820100000002700938285";
export const BANK_BIC = "FIOBCZPPXXX";

export function variableSymbol(year: number, id: number): string {
  return `${year}${id}`;
}

export function spdPayload(year: number, id: number, amount: number): string {
  const vs = variableSymbol(year, id);
  const am = `${amount}.00`;
  return `SPD*1.0*ACC:${BANK_IBAN}*AM:${am}*CC:CZK*MSG:STARTOVNE MCVV PRIHLASKA ${id}*X-VS:${vs}`;
}

export async function spdQrSvg(year: number, id: number, amount: number): Promise<string> {
  return QRCode.toString(spdPayload(year, id, amount), {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });
}
