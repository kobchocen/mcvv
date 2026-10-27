"use client";

import { useFormStatus } from "react-dom";
import { Loader2Icon } from "lucide-react";

import { addExistingRunner } from "@/lib/entries/actions";
import { Button } from "@/components/ui/button";

/**
 * Tlačítko běžce v rychlé nabídce. Hned po kliknutí ukáže, že se běžec přidává (#189):
 * zablokuje se, točí se ikonka a `aria-busy`. Běžec z nabídky zmizí, až ho server uloží
 * a stránka se obnoví.
 */
function QuickAddButton({ name, title }: { name: string; title: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="outline"
      disabled={pending}
      aria-busy={pending || undefined}
      className="h-9 border-race-line bg-race-surface disabled:opacity-70"
      title={title}
      aria-label={title}
    >
      {pending ? <Loader2Icon className="size-4 animate-spin" aria-hidden="true" /> : null}
      {name}
    </Button>
  );
}

export function McvvQuickAdd({
  year,
  registrationId,
  runners,
  clubName,
  copy,
}: {
  year: number;
  /** null = přihláška ještě neexistuje, založí se s prvním běžcem. */
  registrationId: number | null;
  /** Klub z poslední přihlášky běžce (id + text), jinak výchozí klub přihlášky (Q35). */
  runners: { id: string; name: string; clubId?: string; clubName?: string }[];
  clubName: string;
  copy: { quickAdd: string; runnerTitle: string };
}) {
  return (
    <div className="mt-6">
      <h3 className="font-display text-lg font-semibold">{copy.quickAdd}</h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        {runners.map((runner) => (
          <li key={runner.id}>
            <form action={addExistingRunner}>
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="registrationId" value={registrationId ?? 0} />
              <input type="hidden" name="runnerId" value={runner.id} />
              <input type="hidden" name="clubId" value={runner.clubId ?? ""} />
              <input type="hidden" name="clubName" value={runner.clubName ?? clubName} />
              <QuickAddButton
                name={runner.name}
                title={copy.runnerTitle
                  .replace("{name}", runner.name)
                  .replace("{year}", runner.id.slice(0, 4))}
              />
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
