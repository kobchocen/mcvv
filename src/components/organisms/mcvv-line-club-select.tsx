"use client";

import { updateLineClub } from "@/lib/entries/actions";

export type ClubOption = { id: string; name: string };

export function McvvLineClubSelect({
  year,
  registrationId,
  runnerId,
  clubId,
  clubs,
}: {
  year: number;
  registrationId: number;
  runnerId: string;
  clubId: string;
  clubs: ClubOption[];
}) {
  return (
    <form action={updateLineClub}>
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="registrationId" value={registrationId} />
      <input type="hidden" name="runnerId" value={runnerId} />
      <select
        name="clubId"
        defaultValue={clubId}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="h-9 max-w-[14rem] border border-race-line bg-race-surface px-2"
      >
        {clubs.map((club) => (
          <option key={club.id} value={club.id}>
            {club.name}
          </option>
        ))}
      </select>
    </form>
  );
}
