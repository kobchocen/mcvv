/**
 * Jak se k nám dostat: body příjezdu/příchodu k Velké Verandě a odkazy do map.
 *
 * Zdroje souřadnic:
 * - Velká Veranda (start/cíl): GPS 49°59′45″N, 16°12′10″E uvedené na webu.
 * - P1, P2: zadal pořadatel (issue #75).
 * - Vlak: výpravní budova žst. Choceň, OpenStreetMap way 74854799.
 * - Autobus: nástupiště „Choceň, kino“ (autobusové nádraží ČSAD u kina), OpenStreetMap
 *   nodes 8414416314–8414430221 (střed nástupišť).
 * Pěší vzdálenosti/časy: OSRM foot profil (routing.openstreetmap.de), orientační.
 */

export type ArrivalPointId = "veranda" | "p1" | "p2" | "train" | "bus";

export type ArrivalPoint = {
  id: ArrivalPointId;
  lat: number;
  lon: number;
  /** Orientační pěší trasa k Verandě (m, min); u Verandy null. */
  walk: { meters: number; minutes: number } | null;
};

export const VERANDA: ArrivalPoint = { id: "veranda", lat: 49.995833, lon: 16.202778, walk: null };

export const ARRIVAL_POINTS: readonly ArrivalPoint[] = [
  VERANDA,
  { id: "p1", lat: 49.9934183, lon: 16.2043828, walk: { meters: 390, minutes: 6 } },
  { id: "p2", lat: 49.9945672, lon: 16.2128564, walk: { meters: 1070, minutes: 15 } },
  { id: "train", lat: 49.994, lon: 16.2247, walk: { meters: 2070, minutes: 28 } },
  { id: "bus", lat: 49.9982, lon: 16.2229, walk: { meters: 1880, minutes: 26 } },
];

/**
 * Výřez statické mapy public/images/prijezd-mapa.webp: dlaždice OSM v zoomu 16,
 * levý horní roh v globálních pixelech Web Mercatoru, rozměr v px.
 */
export const ARRIVAL_MAP = {
  src: "/images/prijezd-mapa.webp",
  zoom: 16,
  originX: 9143593,
  originY: 5689933,
  width: 1240,
  height: 560,
} as const;

/** Poloha bodu ve statické mapě v procentech (left, top). */
export function mapPosition(
  point: Pick<ArrivalPoint, "lat" | "lon">,
  map: Pick<typeof ARRIVAL_MAP, "zoom" | "originX" | "originY" | "width" | "height"> = ARRIVAL_MAP,
): { left: number; top: number } {
  const size = 256 * 2 ** map.zoom;
  const x = ((point.lon + 180) / 360) * size;
  const sin = Math.sin((point.lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size;
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    left: round(((x - map.originX) / map.width) * 100),
    top: round(((y - map.originY) / map.height) * 100),
  };
}

const coord = (value: number) => String(Number(value.toFixed(7)));
const lonLat = (p: Pick<ArrivalPoint, "lat" | "lon">) => `${coord(p.lon)},${coord(p.lat)}`;
const latLon = (p: Pick<ArrivalPoint, "lat" | "lon">) => `${coord(p.lat)},${coord(p.lon)}`;

/** Mapy.com: zobrazení bodu se špendlíkem (https://developer.mapy.com – Mapy.com URL). */
export function mapyPointUrl(p: Pick<ArrivalPoint, "lat" | "lon">): string {
  return `https://mapy.com/fnc/v1/showmap?center=${lonLat(p)}&zoom=17&marker=true`;
}

/** Mapy.com: pěší trasa (foot_fast) z bodu k Verandě. */
export function mapyWalkUrl(
  from: Pick<ArrivalPoint, "lat" | "lon">,
  to: Pick<ArrivalPoint, "lat" | "lon"> = VERANDA,
): string {
  return `https://mapy.com/fnc/v1/route?start=${lonLat(from)}&end=${lonLat(to)}&routeType=foot_fast`;
}

/** Google Maps: navigace autem k bodu (parkoviště). */
export function googleDriveUrl(to: Pick<ArrivalPoint, "lat" | "lon">): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latLon(to)}&travelmode=driving`;
}

/** Google Maps: pěší trasa z bodu k Verandě. */
export function googleWalkUrl(
  from: Pick<ArrivalPoint, "lat" | "lon">,
  to: Pick<ArrivalPoint, "lat" | "lon"> = VERANDA,
): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${latLon(from)}&destination=${latLon(to)}&travelmode=walking`;
}

/** „2,1 km“ / „390 m“ s nedělitelnou mezerou; desetinná čárka pro cs. */
export function formatWalkDistance(meters: number, locale: string): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10}\u00a0m`;
  const km = (Math.round(meters / 100) / 10).toLocaleString(locale === "cs" ? "cs-CZ" : "en-GB");
  return `${km}\u00a0km`;
}
