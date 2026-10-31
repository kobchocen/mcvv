/**
 * Našeptávač partnera („spolu s“) je nativní `<datalist>`: hodnota možnosti je čitelný popis
 * s id běžce v hranatých závorkách, např. „Novák Jan · 1983 · SK Kopec [19830002]“.
 * Ze vstupu se bere id v závorkách, případně holé osmimístné id.
 */
export function partnerOptionValue(runner: {
  runnerId: string;
  name: string;
  clubName?: string | null;
}): string {
  const parts = [runner.name, runner.runnerId.slice(0, 4), runner.clubName].filter(Boolean);
  return `${parts.join(" · ")} [${runner.runnerId}]`;
}

export function partnerIdFromInput(raw: string): string | null {
  const value = raw.trim();
  const bracketed = /\[(\d{8})\]\s*$/.exec(value);
  if (bracketed) {
    return bracketed[1];
  }
  return /^\d{8}$/.test(value) ? value : null;
}
