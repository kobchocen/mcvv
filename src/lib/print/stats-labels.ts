import cs from "@/i18n/locales/cs/common.json";

import type { StatsT } from "@/lib/stats/tables";

type Tree = { [key: string]: string | Tree };

/**
 * Prostý překladač sekce „Stats“ (cs) pro PDF – route handler i skript s ukázkou
 * nepotřebují next-intl request kontext. Klíče s tečkou: „rekordy.title“.
 */
export function statsTranslator(values: Record<string, string | number> = {}): StatsT {
  const root = cs.Stats as unknown as Tree;
  return (key) => {
    let node: string | Tree | undefined = root;
    for (const part of key.split(".")) {
      node = typeof node === "object" ? node[part] : undefined;
    }
    const text = typeof node === "string" ? node : key;
    return text.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in values ? String(values[name]) : match,
    );
  };
}
