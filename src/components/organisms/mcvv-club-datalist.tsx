import type { ClubOption } from "@/lib/entries/club-options";

/**
 * Jedna společná nabídka klubů pro všechna pole klubu na stránce (Q35). Vykresluje se
 * na serveru, aby se ~1000 id neposílalo do každého řádku přihlášky zvlášť.
 */
export function McvvClubDatalist({ id, clubs }: { id: string; clubs: readonly ClubOption[] }) {
  return (
    <datalist id={id}>
      {clubs.map((club) => (
        <option key={club.id} value={club.value} label={club.label} />
      ))}
    </datalist>
  );
}
