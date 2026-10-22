"use client";

import { updateLineClub } from "@/lib/entries/actions";
import { McvvClubCombobox } from "@/components/organisms/mcvv-club-combobox";

export function McvvLineClubSelect({
  year,
  registrationId,
  runnerId,
  clubName,
  listId,
}: {
  year: number;
  registrationId: number;
  runnerId: string;
  /** Text pole: hodnota z nabídky pro id klubu řádku (`clubOptionValue`). */
  clubName: string;
  /** Id společné nabídky klubů (`McvvClubDatalist`). */
  listId: string;
}) {
  return (
    <form action={updateLineClub}>
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="registrationId" value={registrationId} />
      <input type="hidden" name="runnerId" value={runnerId} />
      <McvvClubCombobox
        defaultValue={clubName}
        listId={listId}
        className="h-11 min-w-0 md:h-9 md:min-w-[10rem]"
        onBlurSubmit
      />
    </form>
  );
}
