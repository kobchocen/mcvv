import { createHash } from "node:crypto";

import type { GeneratorInput } from "./startlist-generator";
import { resolveOrganizerTieSeed } from "./startlist-organizer-order";

/** Otisk vstupu generátoru: uložení návrhu projde jen nad stejnými daty, jaká byla v náhledu. */
export function inputFingerprint(input: GeneratorInput): string {
  const entries = [...input.entries]
    .sort((a, b) => a.runnerId.localeCompare(b.runnerId))
    .map((e) => [
      e.runnerId,
      e.categoryId,
      e.currentBib,
      e.locked,
      e.eligible,
      e.lastYearTime,
      e.editionsCount ?? 0,
      e.special ? [e.special.kind, e.special.partnerId, e.special.offsetSeconds] : null,
    ]);
  const payload = JSON.stringify([
    input.model,
    input.ranges,
    input.champions,
    entries,
    resolveOrganizerTieSeed(input),
  ]);
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}
