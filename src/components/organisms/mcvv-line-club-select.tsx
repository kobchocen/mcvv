"use client";

import { updateLineClub } from "@/lib/entries/actions";
import { McvvClubCombobox, type ClubOption } from "@/components/organisms/mcvv-club-combobox";

export function McvvLineClubSelect({
  year,
  registrationId,
  runnerId,
  clubName,
  clubs,
}: {
  year: number;
  registrationId: number;
  runnerId: string;
  clubName: string;
  clubs: ClubOption[];
}) {
  return (
    <form action={updateLineClub}>
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="registrationId" value={registrationId} />
      <input type="hidden" name="runnerId" value={runnerId} />
      <McvvClubCombobox
        clubs={clubs}
        defaultValue={clubName}
        listId={`club-${runnerId}`}
        onBlurSubmit
      />
    </form>
  );
}
