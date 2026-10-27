import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/routing";
import { canUseCashDesk } from "@/lib/auth/roles";
import { getSession, type SessionUser } from "@/lib/auth/session";

/**
 * Stráž stránek závodní kanceláře (#207). Mimo /admin (role `race_office` nemá
 * administraci), takže si přihlášení hlídá sama: nepřihlášený → přihlášení s `next`,
 * přihlášený bez oprávnění → null (stránka ukáže hlášku, jako /mezicasy).
 */
export async function cashDeskPageSession(
  next: "/kancelar" | "/kancelar/prodejky" | "/kancelar/polozky",
): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) {
    const locale = await getLocale();
    redirect({ href: { pathname: "/prihlaseni", query: { next } }, locale });
    return null;
  }
  return canUseCashDesk(session.role) ? session : null;
}

/** Server actions: oprávnění se ověřuje vždy znovu (action jde zavolat přímým POSTem). */
export async function cashDeskActionSession(
  allowed: (role: SessionUser["role"]) => boolean = canUseCashDesk,
): Promise<SessionUser | null> {
  const session = await getSession();
  return session && allowed(session.role) ? session : null;
}
