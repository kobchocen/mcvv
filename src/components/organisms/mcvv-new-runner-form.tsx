"use client";

import { useActionState, useMemo, useState } from "react";

import { defaultCategory, eligibleCategoriesFor } from "@/lib/entries/category";
import { addNewRunner, type AddRunnerState } from "@/lib/entries/actions";
import { McvvClubCombobox, type ClubOption } from "@/components/organisms/mcvv-club-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CategoryOption = { id: string; name: string; sex: string; age: number };

export function McvvNewRunnerForm({
  year,
  registrationId,
  categories,
  clubs,
  defaultClubName,
  copy,
}: {
  year: number;
  registrationId: number;
  categories: CategoryOption[];
  clubs: ClubOption[];
  defaultClubName: string;
  copy: {
    firstName: string;
    lastName: string;
    birthYear: string;
    sex: string;
    male: string;
    female: string;
    category: string;
    club: string;
    add: string;
    ambiguous: string;
    taken: string;
  };
}) {
  const [state, action] = useActionState(addNewRunner, {} as AddRunnerState);
  const [sex, setSex] = useState<"M" | "F">("M");
  const [birthYear, setBirthYear] = useState("");
  const born = Number.parseInt(birthYear, 10);
  // Keep the club field in sync with the application name (default) after it is saved,
  // unless the user already typed a different club.
  const [club, setClub] = useState(defaultClubName);
  const [syncedDefault, setSyncedDefault] = useState(defaultClubName);
  if (defaultClubName !== syncedDefault) {
    setSyncedDefault(defaultClubName);
    if (!club.trim() || club.trim() === syncedDefault.trim()) {
      setClub(defaultClubName);
    }
  }
  const eligible = useMemo(
    () => (Number.isFinite(born) ? eligibleCategoriesFor(born, sex, year, categories) : []),
    [born, categories, sex, year],
  );
  const defaultCategoryId = useMemo(() => {
    return defaultCategory(eligible)?.id ?? "";
  }, [eligible]);

  return (
    <form action={action} className="mt-6 grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="registrationId" value={registrationId} />
      <div className="grid gap-1.5">
        <Label htmlFor="lastName">{copy.lastName}</Label>
        <Input id="lastName" name="lastName" required className="h-10 bg-race-surface" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="firstName">{copy.firstName}</Label>
        <Input id="firstName" name="firstName" required className="h-10 bg-race-surface" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="birthYear">{copy.birthYear}</Label>
        <Input
          id="birthYear"
          name="birthYear"
          type="number"
          required
          value={birthYear}
          onChange={(event) => setBirthYear(event.target.value)}
          className="h-10 bg-race-surface"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sex">{copy.sex}</Label>
        <select
          id="sex"
          name="sex"
          value={sex}
          onChange={(event) => setSex(event.target.value === "F" ? "F" : "M")}
          className="h-10 border border-race-line bg-race-surface px-3"
        >
          <option value="M">{copy.male}</option>
          <option value="F">{copy.female}</option>
        </select>
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="categoryId">{copy.category}</Label>
        <select
          id="categoryId"
          name="categoryId"
          required
          key={defaultCategoryId}
          defaultValue={defaultCategoryId}
          className="h-10 border border-race-line bg-race-surface px-3"
        >
          {eligible.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="clubName">{copy.club}</Label>
        <input type="hidden" name="clubName" value={club} />
        <McvvClubCombobox
          id="clubName"
          clubs={clubs}
          value={club}
          onChange={setClub}
          listId="new-runner-club"
          className="h-10"
        />
      </div>
      {state.error === "ambiguous" ? (
        <p className="sm:col-span-2 text-sm text-destructive">{copy.ambiguous}</p>
      ) : null}
      {state.error === "taken" ? (
        <p className="sm:col-span-2 text-sm text-destructive">{copy.taken}</p>
      ) : null}
      <Button
        type="submit"
        disabled={eligible.length === 0}
        className="h-10 w-fit bg-race-accent font-display font-semibold text-white hover:bg-race-accent-hover"
      >
        {copy.add}
      </Button>
    </form>
  );
}
