/** Hodnota pole v auditu (JSON): data jako ISO řetězec, dlouhé texty zkrácené. */
export type AuditValue = string | number | boolean | null;

export type AuditChange = { before: AuditValue; after: AuditValue };

/** Max. délka textu v auditu – delší hodnoty (např. seznamy e-mailů) se zkrátí. */
export const AUDIT_TEXT_MAX = 500;

export function auditValue(value: unknown): AuditValue {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return Number(value);
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > AUDIT_TEXT_MAX ? `${text.slice(0, AUDIT_TEXT_MAX)}…` : text;
}

/**
 * Změněná pole mezi stavem před a po (jen klíče z `after`, resp. sjednocení klíčů).
 * `before` = null znamená nový záznam – pak jsou „změněná“ všechna vyplněná pole.
 * Prázdný text a null se neliší.
 */
export function diffFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): Record<string, AuditChange> {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]);
  const changes: Record<string, AuditChange> = {};
  for (const key of [...keys].sort()) {
    const from = auditValue(before?.[key]);
    const to = auditValue(after[key]);
    // Prázdný text a chybějící hodnota jsou pro audit totéž (nový prázdný klíč nastavení).
    if ((from ?? "") !== (to ?? "")) {
      changes[key] = { before: from, after: to };
    }
  }
  return changes;
}

/** Snímek nastavení (`mcvv_setting`) jako mapa klíč → text. */
export function settingsSnapshot(rows: { key: string; text: string }[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.key, row.text]));
}
