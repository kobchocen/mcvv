import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/routing";
import { canAccess } from "@/lib/admin/access";
import type { AccessLevel, SectionId } from "@/lib/admin/permissions";
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
  return (await canAccess("raceOffice.cash", "read")) ? session : null;
}

/** Sekce pro změnu stavu prodejky: ruční převod jen s právem „zaplaceno převodem“. */
export function saleStatusSection(to: "paid_cash" | "paid_bank" | "cancelled"): SectionId {
  return to === "paid_bank" ? "raceOffice.bankPaid" : "raceOffice.cash";
}

/** Server actions: oprávnění se ověřuje vždy znovu (action jde zavolat přímým POSTem). */
export async function cashDeskActionSession(
  section: SectionId = "raceOffice.cash",
  level: AccessLevel = "write",
): Promise<SessionUser | null> {
  const session = await getSession();
  return session && (await canAccess(section, level)) ? session : null;
}
