import type { Edition } from "@prisma/client";

import { saveEdition } from "@/lib/admin/editions";
import { dateInputValue } from "@/lib/admin/parse";
import { AdminField } from "@/components/organisms/mcvv-admin-field";
import { Button } from "@/components/ui/button";

export function McvvAdminEditionForm({
  edition,
  copy,
}: {
  edition?: Partial<Edition> & { id?: number };
  copy: {
    date: string;
    reg: string;
    interval: string;
    weather: string;
    temp: string;
    kidsMail: string;
    kidsPlace: string;
    adultMail: string;
    adultPlace: string;
    prize: (place: number) => string;
    vet: (place: number) => string;
    save: string;
  };
}) {
  return (
    <form action={saveEdition} className="grid max-w-3xl gap-4">
      {edition?.id ? <input type="hidden" name="id" value={edition.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField
          name="date"
          label={copy.date}
          type="date"
          required
          defaultValue={dateInputValue(edition?.date ?? null)}
        />
        <AdminField
          name="regDeadline"
          label={copy.reg}
          type="date"
          defaultValue={dateInputValue(edition?.regDeadline ?? null)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField name="weather" label={copy.weather} defaultValue={edition?.weather ?? ""} />
        <AdminField
          name="temp"
          label={copy.temp}
          type="number"
          defaultValue={edition?.temp ?? ""}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField
          name="startKidsMail"
          label={copy.kidsMail}
          type="number"
          defaultValue={edition?.startKidsMail ?? ""}
        />
        <AdminField
          name="startKidsPlace"
          label={copy.kidsPlace}
          type="number"
          defaultValue={edition?.startKidsPlace ?? ""}
        />
        <AdminField
          name="startAdultMail"
          label={copy.adultMail}
          type="number"
          defaultValue={edition?.startAdultMail ?? ""}
        />
        <AdminField
          name="startAdultPlace"
          label={copy.adultPlace}
          type="number"
          defaultValue={edition?.startAdultPlace ?? ""}
        />
        <AdminField
          name="startInterval"
          label={copy.interval}
          type="number"
          defaultValue={edition?.startInterval ?? ""}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <AdminField
          name="finAdult1"
          label={copy.prize(1)}
          type="number"
          defaultValue={edition?.finAdult1 ?? ""}
        />
        <AdminField
          name="finAdult2"
          label={copy.prize(2)}
          type="number"
          defaultValue={edition?.finAdult2 ?? ""}
        />
        <AdminField
          name="finAdult3"
          label={copy.prize(3)}
          type="number"
          defaultValue={edition?.finAdult3 ?? ""}
        />
        <AdminField
          name="finAdult4"
          label={copy.prize(4)}
          type="number"
          defaultValue={edition?.finAdult4 ?? ""}
        />
        <AdminField
          name="finAdult5"
          label={copy.prize(5)}
          type="number"
          defaultValue={edition?.finAdult5 ?? ""}
        />
        <AdminField
          name="finVet1"
          label={copy.vet(1)}
          type="number"
          defaultValue={edition?.finVet1 ?? ""}
        />
        <AdminField
          name="finVet2"
          label={copy.vet(2)}
          type="number"
          defaultValue={edition?.finVet2 ?? ""}
        />
        <AdminField
          name="finVet3"
          label={copy.vet(3)}
          type="number"
          defaultValue={edition?.finVet3 ?? ""}
        />
      </div>
      <Button
        type="submit"
        className="h-11 w-fit bg-race-accent font-display font-semibold text-white hover:bg-race-accent-hover"
      >
        {copy.save}
      </Button>
    </form>
  );
}
