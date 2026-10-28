/**
 * Doplní `{klíč}` v šabloně textu (např. z `t.raw(...)` předané klientské komponentě).
 * Neznámé zástupné symboly nechá beze změny; nahrazuje všechny výskyty.
 */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}
