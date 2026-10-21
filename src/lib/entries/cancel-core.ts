import type { EntryChangeDetail, EntryCancelledRunner } from "./changes-core";

/** Řádek přihlášky, jak se načte před zrušením. */
export type CancelLine = {
  runnerId: string;
  entryFee: number | null;
  runner: { name: string | null } | null;
  category: { name: string | null } | null;
};

/**
 * Detail auditu `entry.cancelled`: kteří závodníci byli zrušením odhlášeni
 * a kolik bylo zaplaceno (platby zůstávají navázané na zrušenou přihlášku).
 */
export function cancellationDetail(input: {
  year: number;
  registrationId: number;
  registrationName: string | null;
  lines: CancelLine[];
  paid: number;
}): EntryChangeDetail {
  const runners: EntryCancelledRunner[] = [...input.lines]
    .sort((a, b) => a.runnerId.localeCompare(b.runnerId))
    .map((line) => ({
      runnerId: line.runnerId,
      runnerName: line.runner?.name ?? null,
      category: line.category?.name ?? null,
      fee: line.entryFee,
    }));
  return {
    year: input.year,
    registrationId: input.registrationId,
    registrationName: input.registrationName,
    runners,
    paid: input.paid,
  };
}
