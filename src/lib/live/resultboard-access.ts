import { redirect, type Locale } from "@/i18n/routing";
import { canAccess } from "@/lib/admin/access";
import { getSession } from "@/lib/auth/session";

/**
 * Přístup k resultboardu (rozcestník, TV i API): stejně jako speaker, jen
 * `screens.resultboard` (admin a pořadatel, případně další role podle oprávnění).
 * Nepřihlášený na stránce skončí na přihlášení, na API 401; bez oprávnění 403 / forbidden.
 */
export function resultboardApiReject(hasSession: boolean, allowed: boolean): 401 | 403 | null {
  if (!hasSession) return 401;
  if (!allowed) return 403;
  return null;
}

/** `true` = smí obrazovku; bez session přesměruje na přihlášení a nevrátí se. */
export async function requireResultboardAccess(locale: Locale, next: string): Promise<boolean> {
  const session = await getSession();
  if (!session) {
    redirect({ href: { pathname: "/prihlaseni", query: { next } }, locale });
  }
  return canAccess("screens.resultboard", "read");
}
