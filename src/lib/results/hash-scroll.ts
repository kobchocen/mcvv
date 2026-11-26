/**
 * Jak zarovnat cíl hashe na stránce výsledků pod lepicí hlavičkou.
 * Sekce (kategorie, soutěž týmů) na začátek; řádek běžce doprostřed.
 */
export function resultsHashScrollBlock(id: string): "start" | "center" {
  if (id === "soutez-tymu" || id.startsWith("soutez-tymu-") || id.startsWith("cat-")) {
    return "start";
  }
  return "center";
}
