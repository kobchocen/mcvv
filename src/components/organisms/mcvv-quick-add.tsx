"use client";

import { addExistingRunner } from "@/lib/entries/actions";
import { Button } from "@/components/ui/button";

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
              <Button
                type="submit"
                variant="outline"
                className="h-9 border-race-line bg-race-surface"
                title={copy.runnerTitle
                  .replace("{name}", runner.name)
                  .replace("{year}", runner.id.slice(0, 4))}
                aria-label={copy.runnerTitle
                  .replace("{name}", runner.name)
                  .replace("{year}", runner.id.slice(0, 4))}
              >
                {runner.name}
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
