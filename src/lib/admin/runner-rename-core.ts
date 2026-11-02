/**
 * Změna jména běžce (#198) – čistá logika bez databáze.
 *
 * `cis_bezec.jmeno` je aktuální jméno („Příjmení Jméno“), `mcvv_time.bezec_name` a
 * `mcvv_start.bezec_name` drží jméno v daném ročníku (NULL / prázdné = aktuální jméno, viz
 * `runnerNameFor`). Dva režimy (Q250):
 *
 * - `all` – „Všude (oprava překlepu)“: nové aktuální jméno a ročníkové řádky se starým
 *   jménem dostanou nové. Řádky s jiným historickým jménem (např. rodné příjmení) zůstávají.
 * - `from` – „Od ročníku X (svatba)“: nové aktuální jméno; ročníky ≥ X dostanou nové jméno,
 *   starší ročníky bez jména (NULL / prázdné) dostanou staré jméno (Q251), aby historie
 *   po změně aktuálního jména neukazovala nové jméno. Starší ročníky se jménem zůstávají.
 */

export const RUNNER_NAME_TABLES = ["mcvv_time", "mcvv_start"] as const;
export type RunnerNameTable = (typeof RUNNER_NAME_TABLES)[number];

export const RUNNER_NAME_MAX = 50;

export type RunnerRenameMode = "all" | "from";

export type RunnerNameRow = {
  table: RunnerNameTable;
  year: number;
  /** Uložené jméno ročníku (NULL / "" = žádné). */
  name: string | null;
};

export type RunnerNameUpdate = {
  table: RunnerNameTable;
  year: number;
  oldName: string | null;
  newName: string;
};

export type RunnerRenameError = "empty" | "too_long" | "unchanged" | "year";

export type RunnerRenamePlan = {
  runnerId: string;
  oldName: string;
  newName: string;
  mode: RunnerRenameMode;
  fromYear: number | null;
  /** Řádky ročníků, kterým se mění `bezec_name` (seřazené podle roku a tabulky). */
  updates: RunnerNameUpdate[];
  /** Řádky, které zůstávají beze změny (jiné historické jméno / starší ročník). */
  kept: RunnerNameRow[];
};

/** „Příjmení Jméno“ s jednou mezerou mezi slovy. */
export function composeRunnerName(lastName: string, firstName: string): string {
  return normalizeRunnerName(`${lastName} ${firstName}`);
}

export function normalizeRunnerName(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Rozdělí uložené „Příjmení Jméno“ pro předvyplnění formuláře: první slovo je příjmení,
 * zbytek jméno (víceslovná příjmení si admin opraví).
 */
export function splitRunnerName(value: string | null | undefined): {
  lastName: string;
  firstName: string;
} {
  const [lastName = "", ...rest] = normalizeRunnerName(value).split(" ");
  return { lastName, firstName: rest.join(" ") };
}

function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  return (
    normalizeRunnerName(a).toLocaleLowerCase("cs") ===
    normalizeRunnerName(b).toLocaleLowerCase("cs")
  );
}

const TABLE_ORDER: Record<RunnerNameTable, number> = { mcvv_time: 0, mcvv_start: 1 };

export function planRunnerRename(input: {
  runner: { id: string; name: string };
  lastName: string;
  firstName: string;
  mode: RunnerRenameMode;
  /** Povinný v režimu `from`. */
  fromYear?: number | null;
  rows: readonly RunnerNameRow[];
}): { ok: true; plan: RunnerRenamePlan } | { ok: false; error: RunnerRenameError } {
  const lastName = normalizeRunnerName(input.lastName);
  const firstName = normalizeRunnerName(input.firstName);
  if (!lastName || !firstName) return { ok: false, error: "empty" };
  const newName = composeRunnerName(lastName, firstName);
  if (newName.length > RUNNER_NAME_MAX) return { ok: false, error: "too_long" };
  const oldName = normalizeRunnerName(input.runner.name);
  const fromYear = input.mode === "from" ? (input.fromYear ?? null) : null;
  if (
    input.mode === "from" &&
    (fromYear == null || !Number.isInteger(fromYear) || fromYear < 1900 || fromYear > 2999)
  ) {
    return { ok: false, error: "year" };
  }

  const rows = [...input.rows].sort(
    (a, b) => a.year - b.year || TABLE_ORDER[a.table] - TABLE_ORDER[b.table],
  );
  const updates: RunnerNameUpdate[] = [];
  const kept: RunnerNameRow[] = [];
  for (const row of rows) {
    const stored = normalizeRunnerName(row.name);
    let target: string | null = null;
    if (input.mode === "all") {
      // Jen řádky se starým (chybným) jménem; prázdné řádky ukazují aktuální = nové jméno.
      if (stored && sameName(stored, oldName)) target = newName;
    } else if (row.year >= (fromYear as number)) {
      target = newName;
    } else if (!stored) {
      // Q251: starší ročník bez jména by po změně ukazoval nové jméno → doplní se staré.
      target = oldName;
    }
    if (target != null && target !== (row.name ?? null)) {
      updates.push({ table: row.table, year: row.year, oldName: row.name, newName: target });
    } else {
      kept.push(row);
    }
  }

  // Jméno beze změny a nic k přepsání → nic se nemění (velikost písmen se počítá jako změna).
  if (newName === oldName && updates.length === 0) return { ok: false, error: "unchanged" };

  return {
    ok: true,
    plan: {
      runnerId: input.runner.id,
      oldName,
      newName,
      mode: input.mode,
      fromYear,
      updates,
      kept,
    },
  };
}

/**
 * Řádky, které zůstávají s jiným jménem než starým i novým (typicky rodné příjmení),
 * seskupené podle jména pro upozornění v náhledu.
 */
export function keptOtherNames(plan: RunnerRenamePlan): { name: string; years: number[] }[] {
  const groups = new Map<string, { name: string; years: number[] }>();
  for (const row of plan.kept) {
    const name = normalizeRunnerName(row.name);
    if (!name || sameName(name, plan.oldName) || sameName(name, plan.newName)) continue;
    const key = name.toLocaleLowerCase("cs");
    const group = groups.get(key) ?? { name, years: [] };
    if (!group.years.includes(row.year)) group.years.push(row.year);
    groups.set(key, group);
  }
  return [...groups.values()];
}
