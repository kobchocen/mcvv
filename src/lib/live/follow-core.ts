/**
 * Sledovaní běžci a kluby v online výsledcích (#206) – čistá logika bez DB a prohlížečových API.
 *
 * Výběr je jen v prohlížeči (`localStorage`, per ročník podle startovního čísla, Q171), bez
 * přihlášení a bez serveru. Hlášení (mezičas, cíl, ✓ konečné pořadí) vznikají porovnáním dvou
 * stavů ze stejného snímku jako tabulka – žádný dotaz navíc. Klub je jeho id (#104, Q178:
 * dva kódy = dva kluby, dokud je admin nesloučí).
 */

import { normalizeClubName } from "@/lib/clubs/core";

import { isDns, type OnlineRunner } from "./online-results-core";
import { POINTS, type PointKey } from "./speaker-core";

/** Nejvýš tolik sledovaných běžců (Q170). */
export const FOLLOW_LIMIT = 10;
/** Víc událostí naráz (dovoz dat) → jedno souhrnné hlášení. */
export const FOLLOW_SUMMARY_OVER = 3;

/** Klíč v `localStorage` – per ročník, příští rok je seznam čistý (Q171). */
export const followStorageKey = (year: number) => `mcvv-sledovani-${year}`;
/** Přepínač systémové notifikace (jen když je stránka otevřená, Q168). */
export const FOLLOW_NOTIFY_KEY = "mcvv-sledovani-notif";

/** Startovní čísla z textu `234,203` (odkaz `?f=`) – kladná celá čísla, bez duplicit. */
export function parseBibList(value: string | null | undefined, limit = FOLLOW_LIMIT): number[] {
  const out: number[] = [];
  for (const part of (value ?? "").split(",")) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n);
    if (out.length >= limit) break;
  }
  return out;
}

/** Uložený seznam (JSON pole čísel); cokoli jiného = prázdný seznam. */
export function parseFollowed(raw: string | null | undefined, limit = FOLLOW_LIMIT): number[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return parseBibList(value.filter((x) => typeof x === "number").join(","), limit);
  } catch {
    return [];
  }
}

/** Přidat / odebrat jedno číslo; nad limit nic nepřidá a vrátí `full`. */
export function toggleFollow(
  list: readonly number[],
  bib: number,
  limit = FOLLOW_LIMIT,
): { list: number[]; full: boolean } {
  if (list.includes(bib)) return { list: list.filter((b) => b !== bib), full: false };
  if (list.length >= limit) return { list: [...list], full: true };
  return { list: [...list, bib], full: false };
}

/** Sdílený výběr (`?f=`) se přidá ke stávajícímu, nic se nemaže; jen do limitu. */
export function mergeFollow(
  list: readonly number[],
  add: readonly number[],
  limit = FOLLOW_LIMIT,
): number[] {
  const out = [...list];
  for (const b of add) if (!out.includes(b) && out.length < limit) out.push(b);
  return out;
}

/* ---------- kluby ---------- */

export type OnlineClub = {
  /** id klubu (`cis_klub.id`) – identita klubu. */
  id: string;
  name: string;
  /** Slug profilu klubu (`/kluby/<slug>`) – stejný tvar i pro `?klub=`. */
  slug: string;
};

/** Hledání klubu: název bez diakritiky / interpunkce nebo přesné id; samotné číslo = běžec. */
export function searchClubs<T extends { id: string; name: string }>(
  clubs: readonly T[],
  query: string,
  limit = 2,
): T[] {
  const raw = query.trim();
  if (!raw || /^\d+$/.test(raw)) return [];
  const q = normalizeClubName(raw);
  if (q.length < 2) return [];
  const id = raw.toUpperCase();
  return clubs
    .filter((c) => c.id.toUpperCase() === id || normalizeClubName(c.name).includes(q))
    .slice(0, limit);
}

/**
 * „Sledovat všechny z klubu“ nad limitem (Q179): jen volná místa, přednost mají ti, kdo ještě
 * nedoběhli (na trati a čekající podle startu), doběhlí a DNS až nakonec.
 */
export function clubFollowPick(
  members: readonly OnlineRunner[],
  followed: readonly number[],
  now: number,
  graceS: number,
  limit = FOLLOW_LIMIT,
): number[] {
  const free = Math.max(0, limit - followed.length);
  const prio = (r: OnlineRunner) => (r.fin != null ? 2 : isDns(r, now, graceS) ? 3 : 0);
  return members
    .filter((r) => !followed.includes(r.bib))
    .sort((a, b) => prio(a) - prio(b) || a.start - b.start || a.bib - b.bib)
    .slice(0, free)
    .map((r) => r.bib);
}

export type ClubFollowState =
  | { kind: "all"; n: number }
  | { kind: "some"; free: number; n: number }
  | { kind: "full" }
  | { kind: "unfollow"; n: number };

/** Stav tlačítka v přehledu klubu. */
export function clubFollowState(
  members: readonly { bib: number }[],
  followed: readonly number[],
  limit = FOLLOW_LIMIT,
): ClubFollowState {
  const notFollowed = members.filter((r) => !followed.includes(r.bib)).length;
  if (!notFollowed) return { kind: "unfollow", n: members.length };
  const free = limit - followed.length;
  if (free <= 0) return { kind: "full" };
  return notFollowed <= free
    ? { kind: "all", n: notFollowed }
    : { kind: "some", free, n: notFollowed };
}

/* ---------- hlášení ---------- */

export type FollowSnap = {
  m1: number | null;
  m2: number | null;
  fin: number | null;
  /** ✓ konečné pořadí v kategorii. */
  final: boolean;
};

export type FollowEvent =
  | { kind: "split"; bib: number; point: Exclude<PointKey, "fin"> }
  | { kind: "fin"; bib: number }
  | { kind: "final"; bib: number };

/** Klíč stavu – změna = možná nové hlášení. */
export function followSignature(snaps: ReadonlyMap<number, FollowSnap>): string {
  return [...snaps]
    .map(([b, x]) => `${b}:${x.m1 ?? ""}:${x.m2 ?? ""}:${x.fin ?? ""}:${x.final ? 1 : 0}`)
    .join("|");
}

/**
 * Nové události sledovaných mezi dvěma stavy. Číslo, které v předchozím stavu nebylo (první
 * načtení, právě přidaný běžec), nic nehlásí. Propad v pořadí se nehlásí (Q176).
 */
export function followEvents(
  prev: ReadonlyMap<number, FollowSnap> | null,
  next: ReadonlyMap<number, FollowSnap>,
): FollowEvent[] {
  if (!prev) return [];
  const out: FollowEvent[] = [];
  for (const [bib, is] of next) {
    const was = prev.get(bib);
    if (!was) continue;
    for (const k of POINTS) {
      if (was[k] != null || is[k] == null) continue;
      out.push(k === "fin" ? { kind: "fin", bib } : { kind: "split", bib, point: k });
    }
    if (!was.final && is.final) out.push({ kind: "final", bib });
  }
  return out;
}
