import { startlistDrawConfirmed, type SiteSettings } from "@/lib/settings/site-core";

/**
 * Zámek „Navrhnout startovku“ (#115) po potvrzení losování.
 *
 * Potvrzení losování (uložení návrhu) startovku hned zveřejní (varianta A). Od té chvíle
 * generátor nesmí hromadně přečíslovat běžce, kteří čísla a časy vidí na webu – ani když je
 * startovka nouzově skrytá (`reason: "drawn"`). Ruční úpravy jednotlivých řádků (číslo,
 * prohození, zámek, spec. starty v přihláškách) zůstávají povolené.
 */
export type StartListProposalLock =
  { locked: false } | { locked: true; reason: "published" | "drawn" };

export function startListProposalLock(
  site: Pick<SiteSettings, "startlistPublished" | "startlistDrawnYear">,
  year: number,
): StartListProposalLock {
  if (site.startlistPublished) return { locked: true, reason: "published" };
  if (startlistDrawConfirmed(site, year)) return { locked: true, reason: "drawn" };
  return { locked: false };
}
