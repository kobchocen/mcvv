/** Serializovatelný náhled importu pro klientský formulář (texty skládá server). */
export type ImportView = {
  summary: { label: string; value: string | number }[];
  errors: string[];
  warnings: string[];
  sections: { title: string; header: string[]; rows: (string | number)[][]; more: number }[];
  unchanged: boolean;
};

export type ImportState =
  | { status: "idle" }
  | { status: "error"; message: string; view?: ImportView }
  | { status: "preview"; hash: string; view: ImportView }
  | { status: "done"; message: string; view?: ImportView };

export const IMPORT_SECTION_LIMIT = 200;

export function section(
  title: string,
  header: string[],
  rows: (string | number)[][],
): ImportView["sections"][number] {
  return {
    title,
    header,
    rows: rows.slice(0, IMPORT_SECTION_LIMIT),
    more: Math.max(0, rows.length - IMPORT_SECTION_LIMIT),
  };
}
