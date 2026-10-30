"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  STRIP_ROTATE_MS,
  STRIP_TILE_W,
  stripDesktopGroups,
  stripIsEmpty,
  stripMobileSequence,
  stripPartners,
  stripTilesFit,
  type StripPartner,
} from "@/lib/live/partner-strip-core";
import type { BoardPartner } from "@/lib/live/resultboard-core";

import s from "./mcvv-partner-strip.module.css";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** Index aktivní položky; každých 6 s další, ve skryté záložce stojí. */
function useRotation(count: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (count < 2) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setTick((t) => t + 1);
    }, STRIP_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [count]);
  return count ? tick % count : 0;
}

function Tile({ p, active }: Readonly<{ p: StripPartner; active: boolean }>) {
  // loga partnerů: SVG i bitmapy přes <img> (bez optimalizace, jako resultboard a patička webu)
  // eslint-disable-next-line @next/next/no-img-element
  const img = <img src={p.logoSrc} alt={p.name} loading="lazy" />;
  return p.href ? (
    <a
      className={s.tile}
      href={p.href}
      target="_blank"
      rel="noopener sponsored"
      title={p.name}
      tabIndex={active ? undefined : -1}
    >
      {img}
    </a>
  ) : (
    <div className={s.tile} title={p.name}>
      {img}
    </div>
  );
}

/** Mobil (Q215): jedno logo pod výsledky, generální jako každé třetí. Na desktopu skryté. */
export function McvvPartnerStripSingle({ partners }: Readonly<{ partners: BoardPartner[] }>) {
  const t = useTranslations("OnlineResults");
  const seq = useMemo(() => stripMobileSequence(stripPartners(partners)), [partners]);
  const active = useRotation(seq.length);
  if (!seq.length) return null;
  return (
    <aside className={s.single} aria-label={t("partners")} data-testid="online-partners-single">
      <div className={s.stage}>
        {seq.map((p, i) => (
          <div
            key={`${p.id}-${i}`}
            className={cx(s.slot, i === active && s.act)}
            aria-hidden={i === active ? undefined : true}
          >
            <Tile p={p} active={i === active} />
          </div>
        ))}
      </div>
    </aside>
  );
}

/**
 * Desktop (Q210, Q214): přilepená lišta dole. Generální partner pevně vlevo (jako resultboard),
 * ostatní ve skupinách podle šířky, poslední skupina doplněná od začátku. Na mobilu skrytá.
 */
export function McvvPartnerStripBar({ partners }: Readonly<{ partners: BoardPartner[] }>) {
  const t = useTranslations("OnlineResults");
  const split = useMemo(() => stripPartners(partners), [partners]);
  const rotRef = useRef<HTMLDivElement>(null);
  const [perGroup, setPerGroup] = useState(0);
  useEffect(() => {
    const el = rotRef.current;
    if (!el) return;
    const measure = () => setPerGroup(stripTilesFit(el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const groups = useMemo(
    () => (perGroup ? stripDesktopGroups(split.rest, perGroup) : []),
    [split.rest, perGroup],
  );
  const active = useRotation(groups.length);
  if (stripIsEmpty(split)) return null;
  // málo partnerů na jednu skupinu: dlaždice běžné šířky zleva, jinak plná šířka lišty
  const columns =
    split.rest.length < perGroup
      ? `repeat(${split.rest.length}, ${STRIP_TILE_W}px)`
      : `repeat(${perGroup || 1}, minmax(0, 1fr))`;
  return (
    <>
      <div className={s.spacer} aria-hidden="true" />
      <aside className={s.bar} aria-label={t("partners")} data-testid="online-partners-bar">
        {split.general ? (
          <div className={s.gen}>
            <Tile p={split.general} active />
          </div>
        ) : null}
        <div className={s.rot} ref={rotRef}>
          {groups.map((g, i) => (
            <div
              key={g.map((p) => p.id).join()}
              className={cx(s.grp, i === active && s.act)}
              style={{ gridTemplateColumns: columns }}
              aria-hidden={i === active ? undefined : true}
            >
              {g.map((p) => (
                <Tile key={p.id} p={p} active={i === active} />
              ))}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
