import { Bus, Car, Flag, Footprints, MapPin, Train } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLocale } from "next-intl";

import type { ArrivalContent } from "@/components/templates/mcvv-homepage-content";
import {
  ARRIVAL_MAP,
  ARRIVAL_POINTS,
  formatWalkDistance,
  googleDriveUrl,
  googleWalkUrl,
  mapPosition,
  mapyPointUrl,
  mapyWalkUrl,
  routeSvgPath,
  TOWN_LABEL_POSITION,
  type ArrivalPoint,
  type ArrivalPointId,
  type ArrivalRouteId,
} from "@/lib/arrival/points";

const ROUTE_IDS: ArrivalRouteId[] = ["train", "bus", "p2", "p1"];

const pointIcons: Record<ArrivalPointId, LucideIcon | null> = {
  veranda: Flag,
  p1: null,
  p2: null,
  train: Train,
  bus: Bus,
};

const linkClass =
  "inline-flex min-h-9 items-center gap-1.5 border border-race-line/70 px-2.5 py-1 text-xs font-semibold text-race-accent hover:border-race-accent hover:bg-race-accent/10 dark:text-orange-300";

function Marker({ point, label }: { point: ArrivalPoint; label: string }) {
  const { left, top } = mapPosition(point);
  const Icon = pointIcons[point.id];
  const isFinish = point.id === "veranda";
  return (
    <span
      className={`absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 border px-1.5 py-0.5 font-display text-[10px] font-semibold tracking-[0.08em] whitespace-nowrap uppercase shadow-sm sm:px-2 sm:py-1 sm:text-xs ${
        isFinish
          ? "border-white/80 bg-race-accent-solid text-white dark:border-race-deep/80"
          : "border-race-line bg-race-surface/95 text-foreground dark:text-white"
      }`}
      style={{ left: `${left}%`, top: `${top}%` }}
      aria-hidden="true"
    >
      {Icon ? (
        <Icon
          className={`size-3 sm:size-3.5 ${isFinish ? "" : "text-race-accent dark:text-orange-300"}`}
        />
      ) : null}
      {label}
    </span>
  );
}

function RouteLines() {
  const { width, height } = ARRIVAL_MAP;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="pointer-events-none absolute inset-0 size-full"
      aria-hidden="true"
    >
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {ROUTE_IDS.map((id) => (
          <path
            key={`c-${id}`}
            d={routeSvgPath(id)}
            strokeWidth={9}
            className="stroke-white dark:stroke-race-deep"
          />
        ))}
        {ROUTE_IDS.map((id) => (
          <path key={id} d={routeSvgPath(id)} strokeWidth={4.5} className="stroke-race-accent" />
        ))}
      </g>
    </svg>
  );
}

function PointLinks({ point, content }: { point: ArrivalPoint; content: ArrivalContent }) {
  const parking = point.id === "p1" || point.id === "p2";
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <a href={mapyPointUrl(point)} target="_blank" rel="noreferrer" className={linkClass}>
        <MapPin className="size-3.5" aria-hidden="true" />
        {content.mapy}
      </a>
      {parking ? (
        <a href={googleDriveUrl(point)} target="_blank" rel="noreferrer" className={linkClass}>
          <Car className="size-3.5" aria-hidden="true" />
          {content.drive} ({content.google})
        </a>
      ) : null}
      {point.walk ? (
        <>
          <a href={mapyWalkUrl(point)} target="_blank" rel="noreferrer" className={linkClass}>
            <Footprints className="size-3.5" aria-hidden="true" />
            {content.walkRoute} ({content.mapy})
          </a>
          <a href={googleWalkUrl(point)} target="_blank" rel="noreferrer" className={linkClass}>
            <Footprints className="size-3.5" aria-hidden="true" />
            {content.walkRoute} ({content.google})
          </a>
        </>
      ) : null}
    </div>
  );
}

export type McvvArrivalMapProps = {
  content: ArrivalContent;
};

/** „Jak se k nám dostat“: statická mapa (OSM) s body příjezdu + odkazy do Mapy.com / Google Maps. */
export function McvvArrivalMap({ content }: McvvArrivalMapProps) {
  const locale = useLocale();
  return (
    <div id="arrival" className="mx-auto mt-16 max-w-7xl scroll-mt-24">
      <h3 className="font-display text-2xl font-bold text-foreground sm:text-3xl dark:text-white">
        {content.title}
      </h3>
      <p className="mt-3 max-w-3xl text-base leading-7 text-race-muted">{content.intro}</p>

      <figure className="mt-6">
        <a
          href={ARRIVAL_MAP.src}
          target="_blank"
          rel="noreferrer"
          className="relative block w-full overflow-hidden border border-race-line bg-race-forest"
          style={{ aspectRatio: `${ARRIVAL_MAP.width} / ${ARRIVAL_MAP.height}` }}
          aria-label={content.mapOpen}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- static, pre-sized map, no optimizer needed */}
          <img
            src={ARRIVAL_MAP.src}
            alt={content.mapAlt}
            width={ARRIVAL_MAP.width}
            height={ARRIVAL_MAP.height}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 size-full dark:hidden"
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- dark variant of the same map */}
          <img
            src={ARRIVAL_MAP.srcDark}
            alt={content.mapAlt}
            width={ARRIVAL_MAP.width}
            height={ARRIVAL_MAP.height}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 hidden size-full dark:block"
          />
          <RouteLines />
          <span
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 font-display text-base font-semibold tracking-[0.35em] text-race-muted/80 uppercase [text-shadow:0_0_3px_var(--race-deep),0_0_6px_var(--race-deep)] sm:text-2xl lg:text-4xl"
            style={{ left: `${TOWN_LABEL_POSITION.left}%`, top: `${TOWN_LABEL_POSITION.top}%` }}
            aria-hidden="true"
          >
            {content.townLabel}
          </span>
          {ARRIVAL_POINTS.map((point) => (
            <Marker key={point.id} point={point} label={content.points[point.id].label} />
          ))}
        </a>
        <figcaption className="mt-2 text-xs text-race-dim">{content.attribution}</figcaption>
      </figure>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ARRIVAL_POINTS.map((point) => {
          const copy = content.points[point.id];
          return (
            <li key={point.id} className="border border-race-line/55 bg-race-surface p-4">
              <p className="flex items-center gap-2 font-display text-lg font-semibold text-foreground dark:text-white">
                <span className="bg-race-accent/15 px-1.5 py-0.5 text-xs font-bold text-race-accent dark:text-orange-300">
                  {copy.label}
                </span>
                {copy.name}
              </p>
              <p className="mt-2 text-sm leading-6 text-race-muted">{copy.description}</p>
              {point.walk ? (
                <p className="mt-1 text-sm font-medium text-foreground dark:text-white">
                  {content.walk
                    .replace("{distance}", formatWalkDistance(point.walk.meters, locale))
                    .replace("{minutes}", String(point.walk.minutes))}
                </p>
              ) : null}
              <PointLinks point={point} content={content} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
