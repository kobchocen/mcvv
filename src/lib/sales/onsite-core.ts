/**
 * Dohláška na místě v pokladně (#222) – čisté funkce bez DB (testovatelné, bezpečné i pro
 * klientský bundle).
 *
 * Obsluha zadá údaje běžce a kategorii; startovní číslo systém navrhne (nejbližší volné ve
 * startovní řadě kategorie, `onsite-bib-core.ts`) a pokladní ho smí přepsat. Číslo se rezervuje už při
 * vytvoření prodejky (řádek přihlášky s číslem, zamčený ve startovce); storno nezaplacené
 * prodejky přihlášku zruší a číslo uvolní. Startovné je cena termínu „na místě“ (Q314).
 */
import { z } from "zod";

import { isCountryCode } from "@/lib/runner/nationality";

/** Nejvyšší přípustné startovní číslo (sloupec cislo je SMALLINT, v praxi < 1000). */
export const ONSITE_BIB_MAX = 9999;
/** Autor platby v mcvv_platba (VARCHAR(8)) u zaplacené dohlášky z pokladny. */
export const ONSITE_PAYMENT_AUTHOR = "pokladna";

const optionalEmail = z
  .string()
  .trim()
  .max(128)
  .optional()
  .default("")
  .refine((value) => value === "" || z.email().safeParse(value).success);

export const onsiteEntrySchema = z.object({
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  birthYear: z.coerce.number().int().min(1900).max(2100),
  sex: z.enum(["M", "F"]),
  categoryId: z.string().trim().length(1),
  clubName: z.string().trim().max(50).optional().default(""),
  nationality: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => isCountryCode(value)),
  /** Prázdné = automaticky nejbližší volné číslo ve startovní řadě kategorie. */
  bib: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().min(1).max(ONSITE_BIB_MAX).optional(),
  ),
  /** "1" = pokladní nechal navržené číslo beze změny (při uložení se vybere znovu pod zámkem). */
  bibAuto: z
    .enum(["0", "1"])
    .optional()
    .transform((value) => value === "1"),
  /** Nepovinný e-mail běžce (doklad / potvrzení); prázdný = přihláška bez e-mailu. */
  email: optionalEmail,
  /**
   * E-mail pro účtenku prodejky (#223). Formulář ho předvyplní e-mailem běžce, pokladní ho smí
   * změnit nebo smazat; prázdný = prodejka bez e-mailu (účtenka se pak neposílá).
   */
  receiptEmail: optionalEmail,
  /** Jazyk účtenky (cs | en | de | pl | uk); neznámý nebo prázdný = cs. */
  receiptLocale: z.string().trim().max(5).optional().default(""),
});

export type OnsiteEntryInput = z.infer<typeof onsiteEntrySchema>;

export type OnsiteEntryField =
  "name" | "birthYear" | "sex" | "category" | "nationality" | "bib" | "email" | "receiptEmail";

export type OnsiteEntryParse =
  { ok: true; data: OnsiteEntryInput } | { ok: false; error: "invalid"; field: OnsiteEntryField };

const FIELD_OF: Record<string, OnsiteEntryField> = {
  firstName: "name",
  lastName: "name",
  clubName: "name",
  birthYear: "birthYear",
  sex: "sex",
  categoryId: "category",
  nationality: "nationality",
  bib: "bib",
  bibAuto: "bib",
  email: "email",
  receiptEmail: "receiptEmail",
  receiptLocale: "receiptEmail",
};

/**
 * E-mail pro účtenku ve formuláři dohlášky: dokud ho pokladní nezměnil (`override` null),
 * kopíruje e-mail běžce; po ruční změně (i smazání na prázdný) platí hodnota pokladní.
 */
export function onsiteReceiptEmail(entryEmail: string, override: string | null): string {
  return override ?? entryEmail;
}

export function parseOnsiteEntryInput(raw: Record<string, unknown>): OnsiteEntryParse {
  const result = onsiteEntrySchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const first = String(result.error.issues[0]?.path[0] ?? "");
  return { ok: false, error: "invalid", field: FIELD_OF[first] ?? "name" };
}

export type OnsiteBibCheck =
  { ok: true; outsideCategory: boolean } | { ok: false; error: "bib_taken" | "bib_champion" };

/**
 * Ručně zadané číslo: nesmí ho mít jiný běžec ročníku (přihlášky, startovka z prezentace) a
 * nesmí to být číslo obhájce titulu. Číslo mimo rozsah kategorie je povolené (v kanceláři
 * nemusí být vytištěná všechna čísla) – jen se to poznamená.
 */
export function checkOnsiteBib(
  bib: number,
  taken: ReadonlySet<number>,
  champions: readonly (number | null | undefined)[],
  range: { bibFrom: number; bibTo: number } | null | undefined,
): OnsiteBibCheck {
  if (champions.some((value) => value != null && value > 0 && value === bib)) {
    return { ok: false, error: "bib_champion" };
  }
  if (taken.has(bib)) return { ok: false, error: "bib_taken" };
  const outsideCategory = !range || bib < range.bibFrom || bib > range.bibTo;
  return { ok: true, outsideCategory };
}

/** Název řádku prodejky (snímek, max. 80 znaků): „Dohláška na místě – Novák Jan, M, č. 123“. */
export function onsiteSaleLineName(
  label: string,
  runnerName: string,
  categoryName: string,
  bib: number,
): string {
  const suffix = `, ${categoryName}, č. ${bib}`;
  const head = `${label} – `;
  const room = Math.max(1, 80 - head.length - suffix.length);
  const name = runnerName.trim().replace(/\s+/g, " ");
  return `${head}${name.length > room ? `${name.slice(0, room - 1)}…` : name}${suffix}`;
}

/** Text pro název řádku prodejky (ukládá se česky, jako ostatní položky ceníku). */
export const ONSITE_SALE_LINE_LABEL = "Dohláška na místě";
