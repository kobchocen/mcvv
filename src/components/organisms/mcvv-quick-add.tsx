"use client";

import { useState } from "react";

import { addExistingRunner } from "@/lib/entries/actions";
import { McvvClubCombobox, type ClubOption } from "@/components/organisms/mcvv-club-combobox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function McvvQuickAdd({
  year,
  registrationId,
  runners,
  clubs,
  defaultClubName,
  copy,
}: {
  year: number;
  registrationId: number;
  runners: { id: string; name: string }[];
  clubs: ClubOption[];
  defaultClubName: string;
  copy: { club: string; quickAdd: string };
}) {
  const [clubName, setClubName] = useState(defaultClubName);

  return (
    <div className="mt-6">
      <h3 className="font-display text-lg font-semibold">{copy.quickAdd}</h3>
      <div className="mt-3 grid max-w-sm gap-1.5">
        <Label htmlFor="quick-club-input">{copy.club}</Label>
        <McvvClubCombobox
          id="quick-club-input"
          clubs={clubs}
          value={clubName}
          onChange={setClubName}
          listId="quick-club"
          className="h-10"
        />
      </div>
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
