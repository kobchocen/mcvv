/**
 * Jak se k nám dostat: body příjezdu/příchodu k Velké Verandě a odkazy do map.
 *
 * Zdroje souřadnic:
 * - Velká Veranda (start/cíl): GPS 49°59′45″N, 16°12′10″E uvedené na webu.
 * - P1, P2: zadal pořadatel (issue #75).
 * - Vlak: výpravní budova žst. Choceň, OpenStreetMap way 74854799.
 * - Autobus: nástupiště „Choceň, kino“ (autobusové nádraží ČSAD u kina), OpenStreetMap
 *   nodes 8414416314–8414430221 (střed nástupišť).
 * Pěší trasy: nejkratší cesta po pěšky průchozích cestách OSM (Overpass, highway=path/footway/
 * track/… , 19. 10. 2026) – od P2 lesními cestami pod Hrnmalem; vlak a autobus se na ni napojují
 * u nábřeží Krále Jiřího. Časy při 4,5 km/h, zaokrouhleno nahoru; orientační.
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
  { id: "p1", lat: 49.9934183, lon: 16.2043828, walk: { meters: 405, minutes: 6 } },
  { id: "p2", lat: 49.9945672, lon: 16.2128564, walk: { meters: 812, minutes: 11 } },
  { id: "train", lat: 49.994, lon: 16.2247, walk: { meters: 1831, minutes: 25 } },
  { id: "bus", lat: 49.9982, lon: 16.2229, walk: { meters: 1748, minutes: 24 } },
];

/**
 * Výřez statické mapy public/images/prijezd-mapa.webp: dlaždice OSM v zoomu 16,
 * levý horní roh v globálních pixelech Web Mercatoru, rozměr v px.
 */
export const ARRIVAL_MAP = {
  /** Tlumený podklad (OSM ve stupních šedi tónovaný do barev webu), světlý a tmavý motiv. */
  src: "/images/prijezd-mapa.webp",
  srcDark: "/images/prijezd-mapa-dark.webp",
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

/** Popisek města v mapě (procenta výřezu). */
export const TOWN_LABEL_POSITION = { left: 45, top: 20 } as const;

export type ArrivalRouteId = Exclude<ArrivalPointId, "veranda">;

/** Pěší trasy k Verandě po cestách OSM ([lon, lat], zjednodušeno na ~1 px). */
export const ARRIVAL_ROUTES: Record<ArrivalRouteId, readonly (readonly [number, number])[]> = {
  p1: [
    [16.204295, 49.993476],
    [16.204462, 49.99349],
    [16.204358, 49.99363],
    [16.203858, 49.994142],
    [16.203175, 49.99473],
    [16.202893, 49.994946],
    [16.20258, 49.995125],
    [16.201911, 49.995439],
    [16.202559, 49.995946],
    [16.202804, 49.995881],
  ],
  p2: [
    [16.212561, 49.994599],
    [16.212126, 49.994451],
    [16.212044, 49.994393],
    [16.211398, 49.994143],
    [16.210948, 49.993925],
    [16.210422, 49.994194],
    [16.209166, 49.994127],
    [16.208013, 49.994181],
    [16.206962, 49.994256],
    [16.205803, 49.994539],
    [16.205058, 49.994915],
    [16.204269, 49.995208],
    [16.203411, 49.995577],
    [16.202804, 49.995881],
  ],
  train: [
    [16.224911, 49.994024],
    [16.224684, 49.993856],
    [16.223623, 49.993504],
    [16.222722, 49.994593],
    [16.222691, 49.994663],
    [16.22257, 49.994648],
    [16.220797, 49.995316],
    [16.220293, 49.995357],
    [16.218888, 49.995528],
    [16.21854, 49.995593],
    [16.218282, 49.995472],
    [16.21808, 49.995289],
    [16.217941, 49.995303],
    [16.215662, 49.99497],
    [16.212418, 49.994472],
    [16.212044, 49.994393],
    [16.211398, 49.994143],
    [16.210948, 49.993925],
    [16.210422, 49.994194],
    [16.209166, 49.994127],
    [16.208013, 49.994181],
    [16.206962, 49.994256],
    [16.205803, 49.994539],
    [16.205058, 49.994915],
    [16.204269, 49.995208],
    [16.203411, 49.995577],
    [16.202804, 49.995881],
  ],
  bus: [
    [16.223203, 49.998175],
    [16.223188, 49.998117],
    [16.223081, 49.998038],
    [16.222185, 49.997843],
    [16.222283, 49.997198],
    [16.222158, 49.997129],
    [16.222076, 49.996997],
    [16.222117, 49.996955],
    [16.220129, 49.996141],
    [16.21854, 49.995593],
    [16.218282, 49.995472],
    [16.21808, 49.995289],
    [16.217941, 49.995303],
    [16.212418, 49.994472],
    [16.212044, 49.994393],
    [16.211398, 49.994143],
    [16.210948, 49.993925],
    [16.210422, 49.994194],
    [16.209166, 49.994127],
    [16.208013, 49.994181],
    [16.206962, 49.994256],
    [16.205803, 49.994539],
    [16.205058, 49.994915],
    [16.204269, 49.995208],
    [16.203411, 49.995577],
    [16.202804, 49.995881],
  ],
};

/** SVG path (viewBox 0 0 width height) trasy od bodu přes cesty OSM až k Verandě. */
export function routeSvgPath(id: ArrivalRouteId, map = ARRIVAL_MAP): string {
  const start = ARRIVAL_POINTS.find((p) => p.id === id)!;
  const points = [start, ...ARRIVAL_ROUTES[id].map(([lon, lat]) => ({ lon, lat })), VERANDA];
  return points
    .map((point, index) => {
      const { left, top } = mapPosition(point, map);
      const x = ((left / 100) * map.width).toFixed(1);
      const y = ((top / 100) * map.height).toFixed(1);
      return `${index ? "L" : "M"}${x} ${y}`;
    })
    .join(" ");
}
