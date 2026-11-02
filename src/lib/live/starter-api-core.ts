import { z } from "zod";

import { isStaffRole, type UserRole } from "@/lib/auth/roles";

import { MAX_BATCH, MAX_BIB } from "./ingest-core";
import { parseCorridor, STARTER_ACTIONS, type Corridor } from "./starter-core";

/** Dávka ťuknutí startéra (offline fronta): klientské UUID, číslo, akce, okamžik ťuknutí. */
export const starterEntrySchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9-]{8,64}$/, "invalid id"),
  bib: z.number().int().min(1).max(MAX_BIB),
  action: z.enum(STARTER_ACTIONS),
  at: z.number().int().positive(),
});

export const starterBatchSchema = z.object({
  entries: z.array(starterEntrySchema).min(1).max(MAX_BATCH),
});

export type StarterAccess =
  | { ok: true; corridor: Corridor; allowed: Corridor | null; canSwitch: boolean }
  | { ok: false; error: "forbidden" | "no-corridor" };

/**
 * Koho pustit na obrazovku startéra a s jakým koridorem: startér jen svůj přiřazený koridor
 * (bez přiřazení nic), pořadatel a admin libovolný (přepínač, výchozí přiřazený nebo 1).
 */
export function starterAccess(
  role: UserRole,
  assigned: Corridor | null,
  requested: unknown,
): StarterAccess {
  if (role === "starter") {
    return assigned
      ? { ok: true, corridor: assigned, allowed: assigned, canSwitch: false }
      : { ok: false, error: "no-corridor" };
  }
  if (isStaffRole(role)) {
    return {
      ok: true,
      corridor: parseCorridor(requested) ?? assigned ?? 1,
      allowed: null,
      canSwitch: true,
    };
  }
  return { ok: false, error: "forbidden" };
}
