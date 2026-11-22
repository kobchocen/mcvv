import type { Edition } from "@prisma/client";
import type { ReactNode } from "react";

import { saveEdition } from "@/lib/admin/editions";
import { dateInputValue } from "@/lib/admin/parse";
import { AdminField } from "@/components/organisms/mcvv-admin-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  COURSE_TAG_EMOJI,
  COURSE_TAGS,
  parseCourseTags,
  parseWeatherKind,
  WEATHER_EMOJI,
  WEATHER_KINDS,
  type CourseTag,
  type WeatherKind,
} from "@/lib/editions/weather";

export function McvvAdminEditionForm({
  edition,
  copy,
  children,
}: {
  /** Další sekce formuláře (model startu ročníku). */
  children?: ReactNode;
  edition?: Partial<Edition> & { id?: number };
  copy: {
    date: string;
    reg: string;
    weather: string;
    temp: string;
    weatherKind: string;
    weatherNone: string;
    courseTags: string;
    tempHint: string;
    kindLabel: (kind: WeatherKind) => string;
    tagLabel: (tag: CourseTag) => string;
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
        <div className="grid gap-1.5">
          <Label htmlFor="weatherKind">{copy.weatherKind}</Label>
          <select
            id="weatherKind"
            name="weatherKind"
            defaultValue={parseWeatherKind(edition?.weatherKind) ?? ""}
            className="h-10 border border-race-line bg-race-surface px-2 text-sm"
          >
            <option value="">{copy.weatherNone}</option>
            {WEATHER_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {WEATHER_EMOJI[kind]} {copy.kindLabel(kind)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <AdminField
            name="temp"
            label={copy.temp}
            type="number"
            defaultValue={edition?.temp ?? ""}
          />
          <p className="text-xs text-race-muted">{copy.tempHint}</p>
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{copy.courseTags}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {COURSE_TAGS.map((tag) => (
            <label key={tag} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="courseTags"
                value={tag}
                defaultChecked={parseCourseTags(edition?.courseTags).includes(tag)}
                className="size-4"
              />
              {COURSE_TAG_EMOJI[tag]} {copy.tagLabel(tag)}
            </label>
          ))}
        </div>
      </fieldset>
      <AdminField name="weather" label={copy.weather} defaultValue={edition?.weather ?? ""} />
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
      {children}
      <Button
        type="submit"
        className="h-11 w-fit bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
      >
        {copy.save}
      </Button>
    </form>
  );
}
