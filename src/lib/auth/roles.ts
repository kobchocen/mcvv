/**
 * Role účtů a jejich oprávnění (čisté funkce, bez frameworku a DB).
 *
 * - `registrar` – běžný přihlašující (výchozí role po registraci),
 * - `organizer` – pořadatel, plná administrace kromě nastavení a správy uživatelů,
 * - `admin` – vše včetně nastavení a správy rolí,
 * - `timing` – „Časomíra“: jen přehled „Den závodu“ (dřív export a importy OBD; role se
 *   v navazujícím PR rozdělí na Měření a Hlavního rozhodčího),
 * - `splitmaker` – obsluha mezičasových kontrol: žádná administrace, jen stránka
 *   mezičasů (#121), kterou spouští podle role,
 * - `race_office` – „Závodní kancelář“ (#207): žádná administrace, jen pokladna
 *   a přehled prodejek na `/kancelar`,
 * - `starter` – startér: žádná administrace, jen obrazovka startu `/start` pro přiřazený
 *   koridor (`mcvv_user.start_corridor`).
 *
 * Oprávnění se vynucují na serveru (stránky, server actions, route handlery) přes
 * `src/lib/admin/staff.ts`; tady je jen jejich definice, aby šla testovat.
 */

export const USER_ROLES = [
  "registrar",
  "organizer",
  "admin",
  "timing",
  "splitmaker",
  "race_office",
  "starter",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

/** Plná administrace (organizer, admin). */
export function isStaffRole(role: UserRole): boolean {
  return role === "organizer" || role === "admin";
}

/** Sekce „Den závodu“ (přehled dne závodu). */
export function canAccessRaceDay(role: UserRole): boolean {
  return role === "timing" || isStaffRole(role);
}

/** Zadávání mezičasů na kontrolách (#121). */
export function canAccessSplits(role: UserRole): boolean {
  return role === "splitmaker" || isStaffRole(role);
}

/** Obrazovka startéra `/start`: startér (svůj koridor), pořadatel a admin (přepínač koridoru). */
export function canAccessStarter(role: UserRole): boolean {
  return role === "starter" || isStaffRole(role);
}

/** Obrazovka pro speakera s průběžnými výsledky (#188, Q73): jen admin nebo pořadatel. */
export function canViewSpeakerScreen(role: UserRole): boolean {
  return isStaffRole(role);
}

/** Pokladna závodní kanceláře (#207): prodejky, „zaplaceno hotově“, storno nezaplacené. */
export function canUseCashDesk(role: UserRole): boolean {
  return role === "race_office" || isStaffRole(role);
}

/** Ceník prodejních položek (#207): zatím jen admin (konzervativně, viz otevřené otázky). */
export function canManageSaleItems(role: UserRole): boolean {
  return role === "admin";
}

/**
 * Ruční „zaplaceno převodem“ u prodejky (platba přišla, ale nespárovala se): jen admin.
 * Pořadatel (`organizer`) ne – s pokladnou kanceláře to nesouvisí (#207).
 */
export function canMarkSalePaidBank(role: UserRole): boolean {
  return role === "admin";
}

/** Změna stavu nezaplacené prodejky: hotově a storno smí pokladna, převod ručně jen admin. */
export function canChangeSaleStatus(
  role: UserRole,
  to: "paid_cash" | "paid_bank" | "cancelled",
): boolean {
  return to === "paid_bank" ? canMarkSalePaidBank(role) : canUseCashDesk(role);
}

/** Správa živých výsledků (#120, #121): opravy a konflikty mezičasů, stanoviště, testovací běh. */
export function canManageLiveResults(role: UserRole): boolean {
  return role === "admin";
}

/** Sloučení id klubů (náhled i provedení, Q45/Q47): nevratný přepis dat – jen admin. */
export function canMergeClubs(role: UserRole): boolean {
  return role === "admin";
}

/**
 * Úroveň přístupu do /admin:
 * - `full` – plná administrace (organizer, admin),
 * - `raceday` – rozcestník a „Den závodu“ (timing),
 * - `tools` – jen rozcestník `/admin` s odkazy na vlastní obrazovku dne závodu
 *   (splitmaker → mezičasy, race_office → pokladna, starter → start); obrazovky samotné
 *   leží mimo /admin a hlídají si přístup samy,
 * - `none` – závodník (`registrar`), bez kolečka a bez administrace.
 */
export type AdminAccess = "full" | "raceday" | "tools" | "none";

export function adminAccess(role: UserRole): AdminAccess {
  if (isStaffRole(role)) return "full";
  if (canAccessRaceDay(role)) return "raceday";
  if (role === "registrar") return "none";
  return "tools";
}

/** Má účet ozubené kolečko a rozcestník administrace? Všichni kromě závodníka. */
export function hasAdminHome(role: UserRole): boolean {
  return adminAccess(role) !== "none";
}

export const ADMIN_HOME_PATH = "/admin";
export const RACE_DAY_PATH = "/admin/den-zavodu";

/** Kam vede ozubené kolečko v hlavičce: vždy rozcestník administrace. */
export function adminHomeHref(): string {
  return ADMIN_HOME_PATH;
}

/** Smí účet s danou úrovní přístupu otevřít admin cestu (bez locale, bez query)? */
export function adminPathAllowed(access: AdminAccess, path: string): boolean {
  if (access === "full") return path === ADMIN_HOME_PATH || path.startsWith(`${ADMIN_HOME_PATH}/`);
  if (access === "raceday") {
    return (
      path === ADMIN_HOME_PATH || path === RACE_DAY_PATH || path.startsWith(`${RACE_DAY_PATH}/`)
    );
  }
  if (access === "tools") return path === ADMIN_HOME_PATH;
  return false;
}

/**
 * Přihlášení bez ověřeného e-mailu smí jen plný staff (účty zakládá seed).
 * Nové omezené role (`timing`, `splitmaker`, `race_office`, `starter`) ověřený e-mail potřebují stejně jako `registrar`.
 */
export function requiresVerifiedEmail(role: UserRole): boolean {
  return !isStaffRole(role);
}

export type RoleChangeError =
  "invalid_role" | "same_role" | "self_change" | "last_admin" | "unverified";

/**
 * Pojistky změny role (volá se v transakci se skutečným počtem adminů).
 * - admin nemůže měnit roli sám sobě (nezamkne se),
 * - nelze odebrat posledního admina,
 * - privilegovanou roli (cokoli kromě `registrar`) jen účtu s ověřeným e-mailem.
 */
export function validateRoleChange(input: {
  actorId: number;
  target: { id: number; role: UserRole; emailVerified: boolean };
  newRole: unknown;
  adminCount: number;
}): { ok: true; role: UserRole } | { ok: false; error: RoleChangeError } {
  const { actorId, target, newRole, adminCount } = input;
  if (!isUserRole(newRole)) return { ok: false, error: "invalid_role" };
  if (newRole === target.role) return { ok: false, error: "same_role" };
  if (target.id === actorId) return { ok: false, error: "self_change" };
  if (target.role === "admin" && adminCount <= 1) return { ok: false, error: "last_admin" };
  if (newRole !== "registrar" && !target.emailVerified) return { ok: false, error: "unverified" };
  return { ok: true, role: newRole };
}
