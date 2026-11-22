/**
 * Veřejný guard roku (B+, návrh §2 pojistka 4): veřejné výstupy nikdy neukážou stínový
 * ročník testovacího režimu (rok ≥ 9000). Používají ho veřejné stránky a seznamy ročníků.
 */
import { isShadowYear, SHADOW_YEAR_FLOOR } from "./config-core";

/** Podmínka Prisma pro veřejné dotazy přes víc ročníků. */
export const PUBLIC_YEAR_WHERE = { lt: SHADOW_YEAR_FLOOR } as const;

/** Ročník smí na veřejný výstup (platné kladné celé číslo pod hranicí stínových roků). */
export function isPublicYear(year: number): boolean {
  return Number.isInteger(year) && year > 0 && !isShadowYear(year);
}

/** Seznam ročníků bez stínových. */
export function publicYears<T extends number>(years: readonly T[]): T[] {
  return years.filter((year) => isPublicYear(year));
}
