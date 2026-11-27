/**
 * Dlaždice rozcestníku `/admin` pro účty bez plné administrace (čistá funkce).
 * `allows` je `can()` aktuálního účtu: při vypnutém `permissions.v2` dnešní predikáty rolí
 * (canAccessRaceDay / canAccessSplits / canAccessStarter / canAccessPrestarter / canUseCashDesk),
 * jinak engine.
 */
import type { AccessLevel, SectionId } from "@/lib/admin/permissions";

export type RaceDayHref =
  "/admin/den-zavodu" | "/admin/obrazovky" | "/mezicasy" | "/start" | "/predstarter" | "/kancelar";
export type RaceDayTileKey =
  "navRaceDay" | "navScreens" | "navSplitEntry" | "navStarter" | "navPrestarter" | "navCashDesk";

export function raceDayTiles(
  allows: (id: SectionId, level: AccessLevel) => boolean,
): { href: RaceDayHref; key: RaceDayTileKey }[] {
  const tiles: { href: RaceDayHref; key: RaceDayTileKey }[] = [];
  if (allows("raceControl.overview", "read"))
    tiles.push({ href: "/admin/den-zavodu", key: "navRaceDay" });
  if (allows("screens.splits", "read")) tiles.push({ href: "/mezicasy", key: "navSplitEntry" });
  if (allows("screens.starter", "read")) tiles.push({ href: "/start", key: "navStarter" });
  if (allows("screens.prestarter", "read")) {
    tiles.push({ href: "/predstarter", key: "navPrestarter" });
  }
  if (allows("raceOffice.cash", "read")) tiles.push({ href: "/kancelar", key: "navCashDesk" });
  // Jiné obrazovky (cíl, speaker, resultboard …) bez vlastní dlaždice: aspoň rozcestník obrazovek,
  // aby stránka nikdy nezůstala prázdná.
  if (!tiles.length && allows("screens", "read"))
    tiles.push({ href: "/admin/obrazovky", key: "navScreens" });
  return tiles;
}
