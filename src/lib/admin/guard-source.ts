import { readFileSync, type PathLike } from "node:fs";

import { isSectionId, legacyGuard, type AccessLevel } from "@/lib/admin/permissions";

const LEGACY_CALL = { staff: "requireStaff", admin: "requireAdmin", raceday: "requireRaceDay" };

/**
 * Pro statické testy stráží: `requireSection("sekce", "úroveň")` přepíše na dnešní stráž,
 * kterou při vypnutém `permissions.v2` opravdu volá (`requireStaff()` / `requireAdmin()` /
 * `requireRaceDay()`). Testy tak dál hlídají totéž co před P4.
 */
export function legacyGuardSource(source: string): string {
  return source.replace(
    /requireSection\("([\w.]+)", "(read|write)"\)/g,
    (call, id: string, level: AccessLevel) => {
      if (!isSectionId(id)) return call;
      const guard = legacyGuard(id, level);
      return guard in LEGACY_CALL ? `${LEGACY_CALL[guard as keyof typeof LEGACY_CALL]}()` : call;
    },
  );
}

export function readGuardSource(path: PathLike): string {
  return legacyGuardSource(readFileSync(path, "utf8"));
}
