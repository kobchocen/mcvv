import { fillGroups, type BoardPartner } from "./resultboard-core";

/**
 * Pruh partnerů na online výsledcích (Q210–Q215). Desktop: přilepená lišta, generální
 * partner pevně vlevo (jako resultboard), ostatní ve skupinách podle šířky; mobil: jedno
 * logo pod výsledky, generální jako každé třetí. Jen partneři s logem.
 */
export const STRIP_ROTATE_MS = 6000;
/** Na mobilu je generální partner každé N-té logo (P1, P2, GEN, P3, P4, GEN …). */
export const STRIP_GENERAL_EVERY = 3;
/** Výška dlaždice v liště (px) a přibližný poměr stran loga → šířka dlaždice. */
export const STRIP_TILE_H = 48;
export const STRIP_TILE_W = Math.round(STRIP_TILE_H * 3.4);
export const STRIP_GAP = 8;

export type StripPartner = {
  id: number;
  name: string;
  logoSrc: string;
  href: string | null;
};

export type StripPartners = { general: StripPartner | null; rest: StripPartner[] };

/** Rozdělení na generálního (s logem) a ostatní v pořadí webu; bez loga se nezobrazují. */
export function stripPartners(partners: readonly BoardPartner[]): StripPartners {
  let general: StripPartner | null = null;
  const rest: StripPartner[] = [];
  for (const p of partners) {
    if (!p.logoSrc) continue;
    const item = { id: p.id, name: p.name, logoSrc: p.logoSrc, href: p.href ?? null };
    if (p.general && !general) general = item;
    else rest.push(item);
  }
  return { general, rest };
}

export function stripIsEmpty({ general, rest }: StripPartners): boolean {
  return !general && !rest.length;
}

/**
 * Pořadí na mobilu: generální jako každé třetí (P1, P2, GEN, P3, P4, GEN …). Lichý zbytek
 * končí generálním (…, P5, GEN), aby se mezi cykly neopakoval běžný partner dvakrát za sebou
 * bez generálního. Jen generální → jediné (statické) logo.
 */
export function stripMobileSequence({ general, rest }: StripPartners): StripPartner[] {
  if (!general) return rest.slice();
  const out: StripPartner[] = [];
  const every = STRIP_GENERAL_EVERY - 1;
  rest.forEach((p, i) => {
    out.push(p);
    if ((i + 1) % every === 0) out.push(general);
  });
  if (rest.length % every !== 0 || !rest.length) out.push(general);
  return out;
}

/** Kolik dlaždic se vejde do šířky `width` (aspoň jedna). */
export function stripTilesFit(width: number, tileW = STRIP_TILE_W, gap = STRIP_GAP): number {
  if (!Number.isFinite(width) || width <= 0) return 1;
  return Math.max(1, Math.floor((width + gap) / (tileW + gap)));
}

/** Skupiny na desktopu: po `perGroup`, poslední doplněná od začátku (Q214). */
export function stripDesktopGroups(rest: readonly StripPartner[], perGroup: number) {
  return fillGroups(rest, perGroup);
}
