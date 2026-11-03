import { saveEditionSlots } from "@/lib/admin/edition-slots";
import { formatStartClock } from "@/lib/date/race-schedule";
import { pragueLocalInput, type Slot, type SlotType } from "@/lib/slots/core";
import { AdminField } from "@/components/organisms/mcvv-admin-field";
import { Button } from "@/components/ui/button";

export type EditionSlotsCopy = {
  title: string;
  intro: string;
  stored: string;
  defaults: string;
  saved: string;
  issues: string[];
  slotTitle: Record<SlotType, string>;
  slotHint: Record<SlotType, string>;
  active: string;
  from: string;
  to: string;
  feeAdult: string;
  feeYouth: string;
  payWithin: string;
  payUntil: string;
  payMail: string;
  officeOpens: string;
  onsiteUntil: string;
  save: string;
};

/** Sekce „Termíny a startovné“ ročníku (samostatný formulář pod hlavním formulářem). */
export function McvvAdminEditionSlots({
  editionId,
  slots,
  stored,
  settings,
  copy,
}: {
  editionId: number;
  slots: Slot[];
  /** Termíny jsou uložené v DB (jinak se ukazují výchozí hodnoty z uzávěrky). */
  stored: boolean;
  settings: {
    standardPayUntil: Date | null;
    standardPayMailS: number;
    officeOpensS: number;
    onsiteUntilS: number;
  };
  copy: EditionSlotsCopy;
}) {
  return (
    <form
      action={saveEditionSlots}
      className="mt-12 grid max-w-3xl gap-6 border-t border-race-line pt-8"
    >
      <input type="hidden" name="id" value={editionId} />
      <div className="grid gap-2">
        <h2 className="font-display text-2xl font-bold text-foreground dark:text-white">
          {copy.title}
        </h2>
        <p className="text-sm text-race-muted">{copy.intro}</p>
        <p className="text-sm text-race-muted">{stored ? copy.stored : copy.defaults}</p>
        {copy.saved ? <p className="text-sm text-race-accent">{copy.saved}</p> : null}
        {copy.issues.length > 0 ? (
          <ul className="list-disc pl-5 text-sm text-red-600 dark:text-red-400" role="alert">
            {copy.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {slots.map((slot) => (
        <fieldset key={slot.type} className="grid gap-4 rounded-md border border-race-line p-4">
          <legend className="px-1 font-display font-semibold">{copy.slotTitle[slot.type]}</legend>
          <p className="text-sm text-race-muted">{copy.slotHint[slot.type]}</p>
          {slot.type === "early" || slot.type === "late" ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`slot_${slot.type}_active`}
                defaultChecked={slot.active}
                className="size-4"
              />
              {copy.active}
            </label>
          ) : null}
          {slot.type === "onsite" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField
                name="officeOpens"
                label={copy.officeOpens}
                defaultValue={formatStartClock(settings.officeOpensS)}
              />
              <AdminField
                name="onsiteUntil"
                label={copy.onsiteUntil}
                defaultValue={formatStartClock(settings.onsiteUntilS)}
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField
                name={`slot_${slot.type}_from`}
                label={copy.from}
                type="datetime-local"
                defaultValue={pragueLocalInput(slot.from)}
              />
              <AdminField
                name={`slot_${slot.type}_to`}
                label={copy.to}
                type="datetime-local"
                defaultValue={pragueLocalInput(slot.to)}
              />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <AdminField
              name={`slot_${slot.type}_adult`}
              label={copy.feeAdult}
              type="number"
              defaultValue={slot.feeAdult}
            />
            <AdminField
              name={`slot_${slot.type}_youth`}
              label={copy.feeYouth}
              type="number"
              defaultValue={slot.feeYouth}
            />
            {slot.type === "late" ? (
              <AdminField
                name="slot_late_payMin"
                label={copy.payWithin}
                type="number"
                defaultValue={slot.payWithinMinutes ?? ""}
              />
            ) : null}
          </div>
          {slot.type === "standard" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField
                name="standardPayUntil"
                label={copy.payUntil}
                type="datetime-local"
                defaultValue={pragueLocalInput(settings.standardPayUntil)}
              />
              <AdminField
                name="standardPayMail"
                label={copy.payMail}
                defaultValue={formatStartClock(settings.standardPayMailS)}
              />
            </div>
          ) : null}
        </fieldset>
      ))}
      <Button
        type="submit"
        className="h-11 w-fit bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
      >
        {copy.save}
      </Button>
    </form>
  );
}
