/**
 * Runner names are "Příjmení Jméno". A result row stores the name the runner had in
 * that year (`mcvv_time.bezec_name`); the runner (`cis_bezec.jmeno`) holds the current
 * name. Which one is shown depends on the context:
 *
 * - `profile`: current name with the former one, e.g. "Zvěřinová (Dočkalová) Martina".
 * - `results`: results of an edition are an archive, so the name as it was in that year
 *   ("Dočkalová Martina" in 2003), falling back to the current name.
 * - `stats`: all-time statistics show only the current name ("Zvěřinová Martina"),
 *   falling back to the stored one.
 */
export type RunnerNameContext = "profile" | "results" | "stats";

export function runnerNameFor(
  context: RunnerNameContext,
  stored: string | null | undefined,
  current: string | null | undefined,
): string | null {
  switch (context) {
    case "results":
      return normalize(stored) || normalize(current) || null;
    case "stats":
      return normalize(current) || normalize(stored) || null;
    case "profile":
      return displayRunnerName(stored, current);
  }
}

/**
 * Profile name: when only the surname changed (e.g. after marriage), show
 * "Vetchá (Stránská) Adéla"; when more differs, show "Current (Stored)".
 */
export function displayRunnerName(
  stored: string | null | undefined,
  current: string | null | undefined,
): string | null {
  const s = normalize(stored);
  const c = normalize(current);
  if (!s) return c || null;
  if (!c || s.toLocaleLowerCase("cs") === c.toLocaleLowerCase("cs")) return s;

  const [sSurname, ...sRest] = s.split(" ");
  const [cSurname, ...cRest] = c.split(" ");
  const sFirst = sRest.join(" ");
  const cFirst = cRest.join(" ");
  if (sFirst && sFirst.toLocaleLowerCase("cs") === cFirst.toLocaleLowerCase("cs")) {
    return `${cSurname} (${sSurname}) ${cFirst}`;
  }
  return `${c} (${s})`;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}
