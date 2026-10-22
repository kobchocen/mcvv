import { findClubOption, type ClubOption } from "@/lib/entries/club-options";

export const EMPTY_CLUB_ID = "000";

/** Přístup k číselníku `cis_klub`, ať jde rozhodování o klubu testovat bez databáze. */
export type ClubStore = {
  ensureEmptyClub(year: number): Promise<string>;
  /** Řádek id v ročníku. */
  findInYear(id: string, year: number): Promise<{ name: string } | null>;
  /** Nejnovější řádek id v kterémkoli ročníku. */
  findLatest(id: string): Promise<{ name: string } | null>;
  findInYearByName(year: number, name: string): Promise<{ id: string } | null>;
  findLatestByName(name: string): Promise<{ id: string } | null>;
  /** Hlavní id pro sloučené id (`mcvv_klub_slouceni`), jinak id samo. */
  mainId(id: string): Promise<string>;
  /** Nabídka klubů (hlavní id). Načte se jen při potřebě. */
  options(): Promise<readonly ClubOption[]>;
  create(row: { id: string; year: number; name: string }): Promise<void>;
  nextNumericId(): Promise<string>;
};

export type ResolvedClub = { id: string; name: string; created: boolean };

/**
 * Klub řádku přihlášky (Q35). Rozhoduje id:
 * 1. `clubId` z formuláře (např. rychlé přidání s loňským id běžce), pokud v číselníku existuje,
 * 2. jinak volba z nabídky podle textu (`Název` nebo `Název (id)`),
 * 3. jinak název v ročníku, pak nejnovější id s tímto názvem,
 * 4. jinak nový klub s novým číselným id.
 *
 * Sloučené id se nahradí hlavním id (Q37), přihláška tak dostane klub, pod kterým se starty
 * počítají. Když id v ročníku ještě nemá řádek, založí se s nejnovějším názvem id.
 * `created` = vzniklo nové id (souhrn změn #130 „Založen nový klub“), ne jen řádek ročníku.
 */
export async function resolveClubWith(
  store: ClubStore,
  name: string,
  year: number,
  clubId?: string | null,
): Promise<ResolvedClub> {
  const label = name.trim().replace(/\s+/g, " ").slice(0, 50);
  const wantedId = clubId?.trim() ?? "";
  if (!label && !wantedId) {
    return { id: await store.ensureEmptyClub(year), name: "", created: false };
  }
  let id: string | null = null;
  if (wantedId && wantedId !== EMPTY_CLUB_ID && (await store.findLatest(wantedId))) {
    id = wantedId;
  }
  if (!id && label) {
    id = findClubOption(label, await store.options())?.id ?? null;
  }
  if (id) {
    return ensureYearRow(store, id, year, label);
  }
  if (!label) {
    return { id: await store.ensureEmptyClub(year), name: "", created: false };
  }
  const thisYear = await store.findInYearByName(year, label);
  if (thisYear) {
    return ensureYearRow(store, thisYear.id, year, label);
  }
  const historic = await store.findLatestByName(label);
  if (historic) {
    return ensureYearRow(store, historic.id, year, label);
  }
  const newId = await store.nextNumericId();
  await store.create({ id: newId, year, name: label });
  return { id: newId, name: label, created: true };
}

async function ensureYearRow(
  store: ClubStore,
  chosenId: string,
  year: number,
  label: string,
): Promise<ResolvedClub> {
  const id = await store.mainId(chosenId);
  const inYear = await store.findInYear(id, year);
  if (inYear) {
    return { id, name: inYear.name, created: false };
  }
  const latest = await store.findLatest(id);
  const name = latest?.name.trim() || label;
  await store.create({ id, year, name });
  return { id, name, created: false };
}
