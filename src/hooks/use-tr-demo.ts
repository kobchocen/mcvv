"use client";

import { useSyncExternalStore } from "react";

const subscribeNothing = () => () => {};
const readDemo = () => new URLSearchParams(window.location.search).get("trdemo") === "1";

/**
 * `?trdemo=1` – náhled pro pořadatele: překryv „nový traťový rekord“ se přehraje i pro
 * rekordy, které už jsou ve snímku (normálně první snímek nic nespouští). `&trt=ms` zastaví
 * animaci v daném okamžiku (snímky obrazovky). Na serveru vždy false (bez rozdílu při hydrataci).
 */
export function useTrDemo(): boolean {
  return useSyncExternalStore(subscribeNothing, readDemo, () => false);
}
