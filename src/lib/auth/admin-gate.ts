/**
 * Stráž administrace v `src/proxy.ts` (čisté funkce, testované).
 *
 * Nepřihlášený návštěvník (bez platné podepsané cookie) dostane na admin stránku skutečné
 * HTTP 307 na přihlášení s `next=<původní cesta>`, ne až streamovaný NEXT_REDIRECT se stavem 200.
 *
 * Přihlášeného účtu se stráž podle role v cookie neptá: role v cookie je z okamžiku přihlášení
 * (platí 7 dní), kdežto kolečko, layout i přihlášení čtou roli z DB. Když admin účtu roli změní
 * (registrar → mezičasy), stará cookie by posílala /admin na přihlášení a přihlášení zpět na
 * /admin – nekonečná smyčka, v prohlížeči prázdná stránka (Pavel 26. 11.). Roli proto ověřuje
 * až layout a stránka v DB (`getAccess` / `requireSection` …).
 */
import type { UserRole } from "@/lib/auth/roles";
import { safeNext } from "@/lib/auth/safe-next";

/** Hlavička, kterou proxy předává stránce s původní cestou (přepisuje případnou z klienta). */
export const REQUEST_PATH_HEADER = "x-mcvv-path";

const ADMIN_PAGE = /^\/(cs|en|de|pl|uk)(\/admin(?:\/[^?#]*)?)$/;

/** Locale a cesta bez locale pro admin stránku (`/cs/admin/platby`), jinak null. */
export function adminPage(pathname: string): { locale: string; path: string } | null {
  const match = ADMIN_PAGE.exec(pathname);
  if (!match) {
    return null;
  }
  const path = match[2]!.replace(/\/$/, "") || "/admin";
  return { locale: match[1]!, path };
}

/** `next` pro přihlášení: cesta s query, když projde whitelistem, jinak aspoň cesta. */
export function loginNextFor(path: string, search: string): string | null {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return (query ? safeNext(`${path}?${query}`) : null) ?? safeNext(path);
}

/** URL přihlašovací stránky s `next`, pokud je bezpečný. */
export function loginUrl(locale: string, next: string | null): string {
  return next
    ? `/${locale}/prihlaseni?${new URLSearchParams({ next }).toString()}`
    : `/${locale}/prihlaseni`;
}

export type AdminGateInput = {
  pathname: string;
  search: string;
  method: string;
  /** Požadavek klientské navigace (hlavička `RSC`) nebo server action (`Next-Action`). */
  isRscOrAction: boolean;
  /** Role z platné podepsané cookie, nebo null (žádná / neplatná / prošlá cookie). */
  cookieRole: UserRole | null;
  /**
   * Příznak `staff` z cookie (role z `mcvv_user_role` při zapnutém `permissions.v2`).
   * Stráž ho už nepotřebuje (pouští každou platnou session), zůstává kvůli kompatibilitě.
   */
  cookieStaff?: boolean;
};

export type AdminGateDecision =
  { kind: "none" } | { kind: "pass"; requestPath: string } | { kind: "redirect"; location: string };

export function adminGate(input: AdminGateInput): AdminGateDecision {
  const page = adminPage(input.pathname);
  if (!page) {
    return { kind: "none" };
  }
  const requestPath = `${page.path}${input.search}`;
  const documentRequest =
    (input.method === "GET" || input.method === "HEAD") && !input.isRscOrAction;
  // Jen platná session; role se ověří v DB (viz výše), ne podle staré cookie.
  const allowed = input.cookieRole !== null;
  if (!allowed && documentRequest) {
    return {
      kind: "redirect",
      location: loginUrl(page.locale, loginNextFor(page.path, input.search)),
    };
  }
  return { kind: "pass", requestPath };
}
