/**
 * Rozvržení statistiky na JEDNU stranu A4 (čisté funkce, bez jsPDF – testovatelné).
 * Hledá největší písmo a počet sloupců stránky (1–3), při kterých se všechny tabulky
 * vejdou na výšku i na šířku. Když se nevejdou ani při minimálním písmu, zkrátí
 * nejdelší tabulky a vrátí počet vynechaných řádků (v PDF se vypíše poznámka).
 */
import type { StatsTableData } from "@/lib/stats/tables";

export const PT_TO_MM = 25.4 / 72;
export const MAX_FONT = 13;
export const MIN_FONT = 5.5;
export const FONT_STEP = 0.25;
export const COLUMN_GAP = 6;
export const CELL_PAD = 1.4;
/** Výška řádku = písmo × LINE. */
export const LINE = 1.55;
/** Pružné sloupce (jména, kluby) smí zkrátit text nejvýš o tuto část. */
export const MAX_SHRINK = 0.3;

/** Šířka textu v mm pro písmo `size` (pt); `bold` pro hlavičku. */
export type Measure = (text: string, size: number, bold: boolean) => number;

export type TableGeometry = { widths: number[]; align: ("left" | "right")[] };

export type FlowItem =
  | { kind: "title"; table: number }
  | { kind: "head"; table: number }
  | { kind: "row"; table: number; row: number };

export type PlacedItem = FlowItem & { column: number; y: number; height: number };

export type StatsLayout = {
  font: number;
  columns: number;
  columnWidth: number;
  rowHeight: number;
  geometry: TableGeometry[];
  items: PlacedItem[];
  /** Vynechané řádky (při zkrácení), podle indexu tabulky. */
  omitted: number[];
};

export function rowHeight(font: number): number {
  return font * PT_TO_MM * LINE;
}

export function titleHeight(font: number): number {
  return (font + 2) * PT_TO_MM * 1.9;
}

const NUMERIC = /^[\d\s:.,–—-]*$/;

/** Číselné sloupce (roky, časy, počty) zarovnat vpravo. */
export function columnAlign(table: StatsTableData): ("left" | "right")[] {
  return table.columns.map((_, index) => {
    const cells = table.rows.map((row) => row[index]?.text ?? "").filter(Boolean);
    return cells.length > 0 && cells.every((text) => NUMERIC.test(text)) ? "right" : "left";
  });
}

/** Přirozené šířky sloupců (max. z hlavičky a buněk) + šířky po vměstnání do `available`. */
export function tableGeometry(
  table: StatsTableData,
  font: number,
  available: number,
  measure: Measure,
): TableGeometry | null {
  const align = columnAlign(table);
  const natural = table.columns.map((column, index) => {
    const cellMax = table.rows.reduce(
      (max, row) => Math.max(max, measure(row[index]?.text ?? "", font, false)),
      0,
    );
    return Math.max(measure(column, font, true), cellMax) + 2 * CELL_PAD;
  });
  const total = natural.reduce((sum, width) => sum + width, 0);
  if (total <= available) {
    // Volné místo hlavně textovým sloupcům (jména, kluby), čísla zůstanou u sebe.
    const extra = available - total;
    const textTotal = natural.reduce((sum, w, i) => sum + (align[i] === "left" ? w : 0), 0);
    const even = textTotal > 0 ? (extra * 0.25) / natural.length : extra / natural.length;
    const rest = textTotal > 0 ? extra * 0.75 : 0;
    return {
      widths: natural.map(
        (width, i) => width + even + (align[i] === "left" ? (rest * width) / textTotal : 0),
      ),
      align,
    };
  }
  // Pružné = textové sloupce; zkrátit je (s „…“) nejvýš o MAX_SHRINK.
  const flex = natural.map((width, index) => (align[index] === "left" ? width : 0));
  const flexTotal = flex.reduce((sum, width) => sum + width, 0);
  const fixed = total - flexTotal;
  if (flexTotal === 0 || fixed + flexTotal * (1 - MAX_SHRINK) > available) {
    return null;
  }
  const ratio = (available - fixed) / flexTotal;
  return {
    widths: natural.map((width, index) => (flex[index] ? width * ratio : width)),
    align,
  };
}

function flowItems(tables: StatsTableData[], limits: number[]): FlowItem[][] {
  return tables.map((table, index) => {
    const items: FlowItem[] = [];
    if (table.title) {
      items.push({ kind: "title", table: index });
    }
    items.push({ kind: "head", table: index });
    for (let row = 0; row < Math.min(table.rows.length, limits[index]); row += 1) {
      items.push({ kind: "row", table: index, row });
    }
    return items;
  });
}

/**
 * Umístění položek do sloupců stránky. Tabulka může pokračovat v dalším sloupci
 * (zopakuje se hlavička). Když je tabulek stejně jako sloupců, každá začne ve svém.
 * Vrací null, když se obsah nevejde.
 */
export function placeItems(
  tables: StatsTableData[],
  limits: number[],
  columns: number,
  font: number,
  height: number,
): PlacedItem[] | null {
  const rh = rowHeight(font);
  const th = titleHeight(font);
  const own = tables.length > 1 && tables.length === columns;
  const placed: PlacedItem[] = [];
  let column = 0;
  let y = 0;
  const groups = flowItems(tables, limits);
  for (let t = 0; t < groups.length; t += 1) {
    if (own && t > 0) {
      column += 1;
      y = 0;
    } else if (y > 0) {
      y += rh * 0.9; // mezera mezi tabulkami
    }
    const items = groups[t];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const h = item.kind === "title" ? th : rh;
      // titulek + hlavička + aspoň jeden řádek držet pohromadě
      const keep = item.kind === "title" ? th + 2 * rh : item.kind === "head" ? 2 * rh : h;
      if (y + keep > height) {
        column += 1;
        y = 0;
        if (column >= columns) {
          return null;
        }
        if (item.kind === "row") {
          placed.push({ kind: "head", table: item.table, column, y, height: rh });
          y += rh;
        }
      }
      if (column >= columns) {
        return null;
      }
      placed.push({ ...item, column, y, height: h });
      y += h;
    }
  }
  return placed;
}

function tryLayout(
  tables: StatsTableData[],
  limits: number[],
  columns: number,
  font: number,
  width: number,
  height: number,
  measure: Measure,
): StatsLayout | null {
  const columnWidth = (width - (columns - 1) * COLUMN_GAP) / columns;
  // Tabulky se stejnými sloupci (muži / ženy) dostanou stejné šířky sloupců.
  const shared = new Map<string, TableGeometry | null>();
  const geometry: TableGeometry[] = [];
  for (const table of tables) {
    const key = table.columns.join("\u0000");
    if (!shared.has(key)) {
      const rows = tables
        .filter((other) => other.columns.join("\u0000") === key)
        .flatMap((t) => t.rows);
      shared.set(key, tableGeometry({ columns: table.columns, rows }, font, columnWidth, measure));
    }
    const g = shared.get(key);
    if (!g) {
      return null;
    }
    geometry.push(g);
  }
  const items = placeItems(tables, limits, columns, font, height);
  if (!items) {
    return null;
  }
  return {
    font,
    columns,
    columnWidth,
    rowHeight: rowHeight(font),
    geometry,
    items,
    omitted: tables.map((table, index) => Math.max(0, table.rows.length - limits[index])),
  };
}

function bestLayout(
  tables: StatsTableData[],
  limits: number[],
  width: number,
  height: number,
  measure: Measure,
  maxColumns: number,
): StatsLayout | null {
  for (let font = MAX_FONT; font >= MIN_FONT - 1e-9; font -= FONT_STEP) {
    for (let columns = 1; columns <= maxColumns; columns += 1) {
      const layout = tryLayout(tables, limits, columns, font, width, height, measure);
      if (layout) {
        return layout;
      }
    }
  }
  return null;
}

/** Nejlepší rozvržení na jednu stranu; v nouzi zkracuje nejdelší tabulky. */
export function layoutStats(
  tables: StatsTableData[],
  width: number,
  height: number,
  measure: Measure,
  maxColumns = 3,
): StatsLayout {
  const limits = tables.map((table) => table.rows.length);
  for (;;) {
    const layout = bestLayout(tables, limits, width, height, measure, maxColumns);
    if (layout) {
      return layout;
    }
    // zkrátit nejdelší tabulku o ~5 % (aspoň o řádek)
    let longest = 0;
    limits.forEach((limit, index) => {
      if (limit > limits[longest]) longest = index;
    });
    if (limits[longest] <= 1) {
      return {
        font: MIN_FONT,
        columns: 1,
        columnWidth: width,
        rowHeight: rowHeight(MIN_FONT),
        geometry: tables.map((table) => ({
          widths: table.columns.map(() => width / table.columns.length),
          align: columnAlign(table),
        })),
        items: [],
        omitted: tables.map((table) => table.rows.length),
      };
    }
    limits[longest] = Math.max(1, limits[longest] - Math.max(1, Math.ceil(limits[longest] * 0.05)));
  }
}
