/**
 * Dohledání běžce podle dřívějšího jména (#198, Q252): po svatbě / opravě jména je v
 * `cis_bezec.jmeno` nové jméno, ale přihlašující může vyplnit to staré. Bez tohoto kroku
 * by `resolveRunner` založil duplicitu.
 */

export type PreviousNameRow = {
  runnerId: string;
  /** `mcvv_time.bezec_name` / `mcvv_start.bezec_name` (NULL / "" se ignoruje). */
  name: string | null;
};

function key(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Vrátí id běžce, pokud dřívější jméno odpovídá jednoznačně: stejné jméno (bez ohledu na
 * velikost písmen), rok narození (prefix id), pohlaví (5. znak id) a běžec v číselníku
 * existuje. Víc kandidátů nebo žádný → null (volající založí nového běžce jako dřív).
 */
export function matchRunnerByPreviousName(input: {
  wanted: string;
  birthYear: number;
  sexDigit: string;
  rows: readonly PreviousNameRow[];
  existingIds: ReadonlySet<string>;
}): string | null {
  const wanted = key(input.wanted);
  if (!wanted) return null;
  const prefix = `${input.birthYear}${input.sexDigit}`;
  const ids = new Set(
    input.rows
      .filter(
        (row) =>
          row.runnerId.startsWith(prefix) &&
          input.existingIds.has(row.runnerId) &&
          key(row.name) === wanted,
      )
      .map((row) => row.runnerId),
  );
  return ids.size === 1 ? [...ids][0] : null;
}
