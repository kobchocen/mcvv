/**
 * Vlastní připnuté položky panelu administrace (P6, `mcvv_user_pin`). Čisté funkce.
 * Účet bez uložených řádků vidí výchozí připnutí podle svých rolí; po první úpravě se
 * uloží jeho vlastní seznam (prázdný seznam = jeden řádek `PIN_NONE`).
 */
import type { SectionId } from "@/lib/admin/permissions";
import type { StaffRole } from "@/lib/auth/staff-roles";

export const MAX_PINS = 8;
const MAX_DEFAULT_PINS = 6;
/** Značka „uživatel odepnul vše“ (bez ní by se znovu ukázaly výchozí). */
export const PIN_NONE = "_none";

export const DEFAULT_PINS: Record<StaffRole, readonly SectionId[]> = {
  admin: ["messages", "entries.list", "raceControl.overview", "users"],
  organizer_legacy: ["messages", "entries.list", "startlist.list", "raceControl.overview"],
  entries: ["entries.list", "entries.payments", "messages"],
  startlist: ["startlist.list", "startlist.print"],
  comms: ["messages", "newsletter"],
  content: ["partners", "afterRace"],
  data: ["editions", "dictionaries.clubs", "dictionaries.runners"],
  speaker: ["screens.speaker", "screens.resultboard"],
  timing_ops: ["raceControl.overview", "raceControl.live", "raceControl.start"],
  chief_referee: ["raceControl.official", "raceControl.live", "afterRace"],
  course_chief: ["raceControl.course", "raceControl.overview", "screens.splits"],
  starter: ["screens.starter"],
  splitmaker: ["screens.splits"],
  race_office: ["raceOffice.cash", "raceOffice.sales"],
};

/** Výchozí připnutí pro sadu rolí (pořadí rolí, bez duplicit, nejvýš 6). */
export function defaultPins(grants: readonly StaffRole[]): string[] {
  const out: string[] = [];
  for (const role of grants) {
    for (const id of DEFAULT_PINS[role]) {
      if (!out.includes(id)) out.push(id);
    }
  }
  return out.slice(0, MAX_DEFAULT_PINS);
}

/** Uložené řádky → seznam id (null = nic uloženo, použij výchozí). */
export function storedPins(rows: readonly { sectionId: string; pos: number }[]): string[] | null {
  if (rows.length === 0) return null;
  return [...rows]
    .sort((a, b) => a.pos - b.pos)
    .map((row) => row.sectionId)
    .filter((id) => id !== PIN_NONE);
}

/** Připnout / odepnout; nové připnutí na konec, nejvýš `MAX_PINS`. */
export function togglePinList(current: readonly string[], id: string): string[] {
  if (current.includes(id)) return current.filter((item) => item !== id);
  return [...current, id].slice(-MAX_PINS);
}
