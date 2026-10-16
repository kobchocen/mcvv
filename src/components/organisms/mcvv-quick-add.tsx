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
  registrationId: number;
  runners: { id: string; name: string }[];
  clubName: string;
  copy: { quickAdd: string };
}) {
  return (
    <div className="mt-6">
      <h3 className="font-display text-lg font-semibold">{copy.quickAdd}</h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        {runners.map((runner) => (
          <li key={runner.id}>
            <form action={addExistingRunner}>
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="registrationId" value={registrationId} />
              <input type="hidden" name="runnerId" value={runner.id} />
              <input type="hidden" name="clubName" value={clubName} />
              <Button
                type="submit"
                variant="outline"
                className="h-9 border-race-line bg-race-surface"
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
