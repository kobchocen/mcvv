/** Režim vstupního pole čísla: na dotyku skryje systémovou klávesnici (máme vlastní). */
export function bibInputMode(coarsePointer: boolean): "none" | "numeric" {
  return coarsePointer ? "none" : "numeric";
}

const MAX_BIB_DIGITS = 3;

/**
 * Zpracuje stisk klávesy číselníku nebo hardwarové/skenerové klávesnice.
 * Enter/OK nemění hodnotu – potvrzení řeší volající.
 */
export function applyBibKey(value: string, key: string, max = MAX_BIB_DIGITS): string {
  if (key === "C" || key === "Escape") return "";
  if (key === "⌫" || key === "Backspace") return value.slice(0, -1);
  if (key === "OK" || key === "Enter") return value;
  if (!/^\d$/.test(key)) return value;
  if (value.length >= max) return value;
  return (value + key).replace(/^0+/, "");
}

export function isBibSubmitKey(key: string): boolean {
  return key === "OK" || key === "Enter";
}
