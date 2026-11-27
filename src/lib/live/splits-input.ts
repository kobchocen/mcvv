/** Režim vstupního pole čísla: na dotyku skryje systémovou klávesnici (máme vlastní). */
export function bibInputMode(coarsePointer: boolean): "none" | "numeric" {
  return coarsePointer ? "none" : "numeric";
}

const MAX_BIB_DIGITS = 3;

/** On-screen keypad in phone order: backspace bottom-left, Enter/Zapsat bottom-right. */
export const BIB_KEYPAD_KEYS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "Backspace",
  "0",
  "Enter",
] as const;

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

export function isBibBackspaceKey(key: string): boolean {
  return key === "⌫" || key === "Backspace";
}

type BibKeyTarget = {
  id?: string;
  tagName?: string;
  isContentEditable?: boolean;
} | null;

/**
 * Hardware Escape clears the bib field on desktop and phone layouts, unless
 * another text field (e.g. an in-list edit) is focused.
 */
export function isBibClearEvent(event: {
  key: string;
  target?: BibKeyTarget | EventTarget;
}): boolean {
  if (event.key !== "Escape") return false;
  const el = event.target as BibKeyTarget | undefined;
  if (!el || typeof el !== "object") return true;
  const tag = "tagName" in el && el.tagName ? String(el.tagName).toUpperCase() : "";
  const editable = Boolean("isContentEditable" in el && el.isContentEditable);
  const isField = editable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  if (!isField) return true;
  return el.id === "bib";
}
