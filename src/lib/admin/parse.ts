export function formString(data: FormData, key: string): string {
  return String(data.get(key) ?? "").trim();
}

export function formInt(data: FormData, key: string): number | null {
  const raw = formString(data, key);
  if (!raw) {
    return null;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

export function formDate(data: FormData, key: string): Date | null {
  const raw = formString(data, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return null;
  }
  return new Date(`${raw}T00:00:00.000Z`);
}

export function dateInputValue(value: Date | null | undefined): string {
  if (!value) {
    return "";
  }
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formChecked(data: FormData, key: string): boolean {
  return data.get(key) === "on" || data.get(key) === "true";
}

/** Legacy `mcvv_platba.prihlaska_id` is CHAR — match as a number, not padded text. */
export function paymentRegistrationId(value: string | number): number {
  return Number.parseInt(String(value).trim(), 10);
}

export function toPaymentRegistrationId(id: number): string {
  return String(id);
}
