/**
 * Náhled administrace očima jiné role (jen pro admina). Čisté funkce nad `node:crypto`,
 * bez Next.js a DB, aby šly použít v `src/proxy.ts` i v testech.
 *
 * Stav náhledu nese podepsaná cookie `mcvv_view_as` (HMAC tajemstvím session s vlastním
 * prefixem). Platí jen pro účet, který ji založil, jen pro režim oprávnění, ve kterém
 * vznikla (`legacy` = vypnutý `permissions.v2`, `v2` = zapnutý), a nejvýš 2 hodiny.
 * Dokud je platná, proxy blokuje všechny zápisy (POST/PUT/PATCH/DELETE) kromě ukončení.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { USER_ROLES, type UserRole } from "@/lib/auth/roles";
import { primaryLegacyRole, STAFF_ROLES, type StaffRole } from "@/lib/auth/staff-roles";

export const VIEW_AS_COOKIE = "mcvv_view_as";
/** Jediný zápis povolený během náhledu (zapnutí / ukončení). */
export const VIEW_AS_ROUTE = "/api/admin/view-as";
export const VIEW_AS_TTL_SEC = 2 * 60 * 60;

export type ViewAsMode = "legacy" | "v2";

export type ViewAsPayload = {
  uid: number;
  mode: ViewAsMode;
  roles: string[];
  exp: number;
};

/** Role, kterými jde admin zobrazit: bez admina (to je on sám) a bez závodníka (nemá admin). */
export const VIEW_AS_LEGACY_ROLES: readonly UserRole[] = USER_ROLES.filter(
  (role) => role !== "admin" && role !== "registrar",
);
export const VIEW_AS_V2_ROLES: readonly StaffRole[] = STAFF_ROLES.filter(
  (role) => role !== "admin",
);

export function viewAsRolesFor(mode: ViewAsMode): readonly string[] {
  return mode === "v2" ? VIEW_AS_V2_ROLES : VIEW_AS_LEGACY_ROLES;
}

/** Vybrané role z formuláře → platné, unikátní, v pořadí číselníku. */
export function parseViewAsRoles(values: Iterable<unknown>, mode: ViewAsMode): string[] {
  const wanted = new Set<string>();
  for (const value of values) {
    if (typeof value === "string") wanted.add(value.trim());
  }
  return viewAsRolesFor(mode).filter((role) => wanted.has(role));
}

/**
 * Role pro sloupcový kód (`session.role`) během náhledu: kvůli místům, která čtou jedinou
 * roli. Režim legacy: nejsilnější z vybraných; v2: stejně jako u účtu s víc rolemi (P5).
 */
export function viewAsSessionRole(mode: ViewAsMode, roles: readonly string[]): UserRole {
  if (mode === "v2") {
    return primaryLegacyRole(
      roles.filter((role): role is StaffRole => isIn(VIEW_AS_V2_ROLES, role)),
    );
  }
  for (const role of [
    "organizer",
    "timing",
    "race_office",
    "starter",
    "splitmaker",
    "resultboard",
  ] as const) {
    if (roles.includes(role)) return role;
  }
  return "registrar";
}

function isIn<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(`${VIEW_AS_COOKIE}:${body}`).digest("base64url");
}

export function encodeViewAs(payload: ViewAsPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** Ověří podpis, platnost a role; vrací payload, nebo null. */
export function decodeViewAs(
  token: string,
  secret: string,
  nowMs: number = Date.now(),
): ViewAsPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const left = Buffer.from(token.slice(dot + 1));
  const right = Buffer.from(sign(body, secret));
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const raw = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Partial<ViewAsPayload>;
    if (
      typeof raw.uid !== "number" ||
      (raw.mode !== "legacy" && raw.mode !== "v2") ||
      !Array.isArray(raw.roles) ||
      typeof raw.exp !== "number" ||
      raw.exp * 1000 < nowMs
    ) {
      return null;
    }
    const roles = parseViewAsRoles(raw.roles, raw.mode);
    if (!roles.length) return null;
    return { uid: raw.uid, mode: raw.mode, roles, exp: raw.exp };
  } catch {
    return null;
  }
}

/** Platný náhled pro tento účet a režim? (cookie jiného účtu nebo režimu se ignoruje) */
export function viewAsFor(
  payload: ViewAsPayload | null,
  userId: number,
  mode: ViewAsMode,
): ViewAsPayload | null {
  return payload && payload.uid === userId && payload.mode === mode ? payload : null;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Proxy: zablokovat požadavek během náhledu? (zápisy kromě zapnutí / ukončení náhledu) */
export function viewAsBlocks(method: string, pathname: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase()) && pathname !== VIEW_AS_ROUTE;
}

export const VIEW_AS_BLOCKED_BODY =
  "Náhled role je jen pro čtení – změny se neuloží. Ukončete náhled v administraci.";

// Proxy (`src/proxy.ts`): locale list stejný jako v `config.matcher` (kontroluje test).
const PROXY_LOCALES = "cs|en|de|pl|uk";
const LOCALE_GUARDED = new RegExp(`^/(${PROXY_LOCALES})/(admin|bezec)(/|$)`);
const UNPREFIXED_SKIPPED = new RegExp(
  `^/(?:(?:${PROXY_LOCALES})(?:/|$)|api|_next|_vercel|healthz|readyz|test|.*\\..*)`,
);

/** Cesty, na které proxy běží i bez náhledu (první tři vzory `config.matcher` v `src/proxy.ts`). */
export function regularProxyPath(pathname: string): boolean {
  return LOCALE_GUARDED.test(pathname) || !UNPREFIXED_SKIPPED.test(pathname);
}
