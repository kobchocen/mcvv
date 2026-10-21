/**
 * Změny přihlášek pro denní souhrn pořadateli (#130). Čisté funkce, bez DB.
 *
 * Zdrojem jsou auditní záznamy `entry.*` (mcvv_audit_log), které zapisují akce
 * přihlašujících. Typy odpovídají e-mailům legacy `prihlasit.php`:
 * založení přihlášky, přihlášení a odhlášení závodníka, založení klubu a závodníka.
 * Změnu poznámky nahradily zprávy (#108) – ty jsou v témže e-mailu v sekci zpráv.
 * Navíc: změna názvu přihlášky (hlavička) a změna klubu běžce.
 */

export const ENTRY_CHANGE_ACTIONS = [
  "entry.created",
  "entry.runner_added",
  "entry.runner_removed",
  "entry.runner_created",
  "entry.club_created",
  "entry.header_changed",
  "entry.line_club_changed",
] as const;
export type EntryChangeAction = (typeof ENTRY_CHANGE_ACTIONS)[number];

export function isEntryChangeAction(value: string): value is EntryChangeAction {
  return (ENTRY_CHANGE_ACTIONS as readonly string[]).includes(value);
}

/** Detail auditního záznamu (bez osobních údajů navíc – jen to, co je i v přihlášce). */
export type EntryChangeDetail = {
  year: number;
  registrationId: number;
  /** Název přihlášky v okamžiku změny. */
  registrationName?: string | null;
  runnerId?: string;
  runnerName?: string | null;
  category?: string | null;
  fee?: number | null;
  clubId?: string;
  clubName?: string | null;
  from?: string | null;
  to?: string | null;
};

/** Cíl auditního záznamu: "registration:2026/12". */
export function entryTarget(year: number, registrationId: number): string {
  return `registration:${year}/${registrationId}`;
}

export function parseEntryTarget(target: string | null): { year: number; id: number } | null {
  const match = /^registration:(\d{4})\/(\d{1,5})$/.exec(target ?? "");
  return match ? { year: Number(match[1]), id: Number(match[2]) } : null;
}

export type EntryChangeRow = {
  id: number;
  createdAt: Date;
  action: string;
  target: string | null;
  actorEmail: string;
  detail: unknown;
};

/** Klidová doba: změnu zařadit až chvíli po ní (přihlašující obvykle mění víc věcí najednou). */
export const CHANGES_QUIET_MS = 15 * 60 * 1000;
/** Nejstarší změna v souhrnu (po delším vypnutí sekce se nepošle celá historie). */
export const CHANGES_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Nejvýš tolik přihlášek v jednom e-mailu, zbytek jen počtem. */
export const CHANGES_MAX_REGISTRATIONS = 60;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function detailOf(row: EntryChangeRow): Partial<EntryChangeDetail> {
  return row.detail && typeof row.detail === "object" ? (row.detail as EntryChangeDetail) : {};
}

function runnerLabel(detail: Partial<EntryChangeDetail>): string {
  const name = text(detail.runnerName) || text(detail.runnerId) || "běžec";
  const id = text(detail.runnerId);
  return id && name !== id ? `${name} (${id})` : name;
}

/** Jedna řádka souhrnu česky, např. „Přihlášen závodník: Novák Jan (19900012), kat. A, 250 Kč“. */
export function describeEntryChange(row: EntryChangeRow): string | null {
  if (!isEntryChangeAction(row.action)) return null;
  const detail = detailOf(row);
  switch (row.action) {
    case "entry.created":
      return "Založena nová přihláška";
    case "entry.runner_added": {
      const extra = [
        text(detail.category) ? `kat. ${text(detail.category)}` : "",
        typeof detail.fee === "number" ? `${detail.fee} Kč` : "",
        text(detail.clubName) ? text(detail.clubName) : "",
      ].filter(Boolean);
      return `Přihlášen závodník: ${runnerLabel(detail)}${extra.length ? `, ${extra.join(", ")}` : ""}`;
    }
    case "entry.runner_removed":
      return `Odhlášen závodník: ${runnerLabel(detail)}`;
    case "entry.runner_created":
      return `Založen nový závodník: ${runnerLabel(detail)}`;
    case "entry.club_created":
      return `Založen nový klub: ${text(detail.clubName) || "?"}${text(detail.clubId) ? ` (${text(detail.clubId)})` : ""}`;
    case "entry.header_changed":
      return `Změna názvu přihlášky: „${text(detail.from)}“ → „${text(detail.to)}“`;
    case "entry.line_club_changed":
      return `Změna klubu: ${runnerLabel(detail)}: ${text(detail.from) || "bez klubu"} → ${text(detail.to) || "bez klubu"}`;
  }
}

export type EntryChangeGroup = {
  year: number;
  registrationId: number;
  name: string;
  email: string;
  lines: { at: Date; text: string }[];
};

/**
 * Seskupí změny podle přihlášek (v pořadí první změny), uvnitř chronologicky.
 * Nečitelné záznamy (cizí akce, chybný cíl) vynechá.
 */
export function groupEntryChanges(
  rows: EntryChangeRow[],
  names: Map<string, string | null> = new Map(),
): EntryChangeGroup[] {
  const groups = new Map<string, EntryChangeGroup>();
  const sorted = [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id,
  );
  for (const row of sorted) {
    const target = parseEntryTarget(row.target);
    const line = describeEntryChange(row);
    if (!target || !line) continue;
    const key = `${target.year}/${target.id}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        year: target.year,
        registrationId: target.id,
        name: "",
        email: row.actorEmail,
        lines: [],
      };
      groups.set(key, group);
    }
    group.name = text(names.get(key)) || text(detailOf(row).registrationName) || group.name || "";
    group.lines.push({ at: row.createdAt, text: line });
  }
  return [...groups.values()];
}

/** Okno změn do souhrnu: novější než kurzor a max. stáří, starší než klidová doba. */
export function changesWindow(now: Date): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() - CHANGES_MAX_AGE_MS),
    to: new Date(now.getTime() - CHANGES_QUIET_MS),
  };
}

/** Kurzor (id posledního zahrnutého záznamu) z mcvv_job_state. */
export function parseCursor(value: string | null | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
