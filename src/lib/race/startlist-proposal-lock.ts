/**
 * Zámek „Navrhnout startovku“ (#115) po zveřejnění.
 *
 * Jakmile je startovka zveřejněná (přepínač „Zveřejnit startovku“ v nastavení, stejný příznak
 * řídí i tlačítka v hero na úvodní stránce), generátor už nesmí hromadně přečíslovat běžce,
 * kteří čísla a časy vidí na webu. Ruční úpravy jednotlivých řádků (číslo, prohození, zámek,
 * skupiny) a import z OBD (#119) zůstávají povolené.
 */
export type StartListProposalLock = { locked: false } | { locked: true; reason: "published" };

export function startListProposalLock(site: {
  startlistPublished: boolean;
}): StartListProposalLock {
  return site.startlistPublished ? { locked: true, reason: "published" } : { locked: false };
}
