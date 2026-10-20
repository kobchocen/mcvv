/**
 * Kdo smí spustit webového klienta mezičasů (#121).
 *
 * Role `splitmaker` přidává do `UserRole` PR #140 (feature/role-obd-export, #112) včetně
 * `canAccessSplits` v `@/lib/auth/roles`. Tady je stejné jméno a stejná sémantika
 * (splitmaker + organizer + admin), jen nad rolí jako textem, aby šlo mergovat v libovolném
 * pořadí. Po merge #140 nahradit importem z `@/lib/auth/roles` a tenhle soubor smazat.
 */
export const SPLITS_CLIENT_ROLES = ["splitmaker", "organizer", "admin"] as const;

export function hasRole(
  user: { role: string } | null | undefined,
  ...roles: readonly string[]
): boolean {
  return Boolean(user && roles.includes(user.role));
}

export function canAccessSplits(user: { role: string } | null | undefined): boolean {
  return hasRole(user, ...SPLITS_CLIENT_ROLES);
}

/** Opravy a konflikty mezičasů v adminu, OFeed a API klíče: jen admin. */
export function canManageLiveResults(user: { role: string } | null | undefined): boolean {
  return hasRole(user, "admin");
}
