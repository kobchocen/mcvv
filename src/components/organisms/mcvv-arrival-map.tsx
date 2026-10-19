"use client";

import { Bus, CircleParking, Map as MapIcon, Train, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { ArrivalMapContent } from "@/components/templates/mcvv-homepage-content";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ARRIVAL_MAP,
  ARRIVAL_POINTS,
  mapPosition,
  routeSvgPath,
  TOWN_LABEL_POSITION,
  type ArrivalPoint,
  type ArrivalPointId,
  type ArrivalRouteId,
  VERANDA,
} from "@/lib/arrival/points";

const ROUTE_IDS: ArrivalRouteId[] = ["train", "bus", "p2", "p1"];

const pointIcons: Record<ArrivalPointId, LucideIcon | null> = {
  veranda: null,
  p1: null,
  p2: null,
  train: Train,
  bus: Bus,
};

/** Parking blue (Tailwind blue-700), the usual colour of parking signs. */
const PARKING_BG = "bg-[#1d4ed8]";

function Marker({ point, label }: { point: ArrivalPoint; label: string }) {
  const { left, top } = mapPosition(point);
  const style = { left: `${left}%`, top: `${top}%` };
  if (point.id === "p1" || point.id === "p2") {
    return (
      <span
        className={`absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 border-2 border-white ${PARKING_BG} px-1.5 py-0.5 font-display text-xs font-bold tracking-[0.04em] whitespace-nowrap text-white shadow-[0_2px_6px_rgb(0_0_0/0.45)] sm:gap-1.5 sm:px-2 sm:py-1 sm:text-base lg:text-lg`}
        style={style}
        aria-hidden="true"
      >
        <CircleParking className="size-4 sm:size-5 lg:size-6" strokeWidth={2.5} />
        {label}
      </span>
    );
  }
  if (point.id === "veranda") {
    return (
      <span
        className="absolute z-30 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-race-accent-solid font-display text-[9px] font-bold tracking-[0.02em] text-white shadow-[0_2px_6px_rgb(0_0_0/0.45)] sm:size-9 sm:text-[11px] dark:border-white/90"
        style={style}
        aria-hidden="true"
      >
        {label}
      </span>
    );
  }
  const Icon = pointIcons[point.id];
  return (
    <span
      className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 border border-race-line bg-race-surface/95 px-1.5 py-0.5 font-display text-[10px] font-semibold tracking-[0.08em] whitespace-nowrap text-foreground uppercase shadow-sm sm:px-2 sm:py-1 sm:text-xs dark:text-white"
      style={style}
      aria-hidden="true"
    >
      {Icon ? <Icon className="size-3 text-race-accent sm:size-3.5 dark:text-orange-300" /> : null}
      {label}
    </span>
  );
}

/** „VERANDA“ nad bodem S/C: spodní hrana ~12 px nad tečkou, s krátkou spojnicí. */
function VerandaLabel({ text }: { text: string }) {
  const { left, top } = mapPosition(VERANDA);
  return (
    <span
      className="pointer-events-none absolute z-20 flex -translate-x-1/2 -translate-y-full flex-col items-center"
      style={{ left: `${left}%`, top: `${top}%` }}
      aria-hidden="true"
    >
      <span className="border border-white/80 bg-race-accent-solid px-1.5 py-0.5 font-display text-[10px] font-semibold tracking-[0.12em] text-white uppercase shadow-sm sm:px-2 sm:py-1 sm:text-xs dark:border-white/70">
        {text}
      </span>
      {/* connector + gap: dot radius (14–18 px) + ~12 px */}
      <span className="h-[26px] w-0.5 bg-race-accent-solid sm:h-[30px]" />
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

/** Statická mapa (OSM, světlý/tmavý podklad) s trasami a body příjezdu. */
function ArrivalMapFigure({ content }: { content: ArrivalMapContent }) {
  return (
    <figure>
      <div
        role="img"
        aria-label={content.mapAlt}
        className="relative w-full overflow-hidden border border-race-line bg-race-forest"
        style={{ aspectRatio: `${ARRIVAL_MAP.width} / ${ARRIVAL_MAP.height}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static, pre-sized map, no optimizer needed */}
        <img
          src={ARRIVAL_MAP.src}
          alt=""
          width={ARRIVAL_MAP.width}
          height={ARRIVAL_MAP.height}
          decoding="async"
          className="absolute inset-0 size-full dark:hidden"
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- dark variant of the same map */}
        <img
          src={ARRIVAL_MAP.srcDark}
          alt=""
          width={ARRIVAL_MAP.width}
          height={ARRIVAL_MAP.height}
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
        <VerandaLabel text={content.verandaLabel} />
        {ARRIVAL_POINTS.map((point) => (
          <Marker key={point.id} point={point} label={content.labels[point.id]} />
        ))}
      </div>
      <figcaption className="mt-2 text-xs text-race-dim">{content.attribution}</figcaption>
    </figure>
  );
}

export type McvvArrivalMapDialogProps = {
  content: ArrivalMapContent;
  className?: string;
};

/** Odkaz „Mapa příjezdu a parkování“ pod místem konání; mapu otevře v modálním okně. */
export function McvvArrivalMapDialog({ content, className }: McvvArrivalMapDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={`group flex cursor-pointer items-center gap-3 text-left text-base font-medium text-race-accent focus-visible:outline-none ${className ?? ""}`}
        >
          <MapIcon className="size-5 shrink-0 text-race-accent" aria-hidden="true" />
          <span className="underline-offset-2 group-hover:underline group-focus-visible:underline">
            {content.linkLabel}
          </span>
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-h-[94dvh] w-[min(96vw,1240px,calc((94dvh-6rem)*2.2))] max-w-none gap-3 overflow-auto rounded-none border-race-line bg-race-deep p-3 sm:max-w-none sm:p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <DialogTitle className="font-display text-lg font-semibold text-foreground sm:text-xl dark:text-white">
            {content.title}
          </DialogTitle>
          <DialogClose
            className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center border border-race-line/70 text-race-muted hover:border-race-accent hover:text-race-accent focus-visible:border-race-accent focus-visible:outline-none"
            aria-label={content.closeLabel}
          >
            <X className="size-5" aria-hidden="true" />
          </DialogClose>
        </div>
        <DialogDescription className="sr-only">{content.mapAlt}</DialogDescription>
        <ArrivalMapFigure content={content} />
      </DialogContent>
    </Dialog>
  );
}
