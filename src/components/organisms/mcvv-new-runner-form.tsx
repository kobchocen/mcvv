"use client";

import { useActionState, useMemo, useState } from "react";

import { defaultCategory, eligibleCategoriesFor } from "@/lib/entries/category";
import { addNewRunner, type AddRunnerState } from "@/lib/entries/actions";
import { McvvClubCombobox } from "@/components/organisms/mcvv-club-combobox";
import {
  NationalitySelect,
  type NationalityField,
} from "@/components/molecules/nationality-select";
import { HOME_COUNTRY } from "@/lib/runner/nationality";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CategoryOption = { id: string; name: string; sex: string; age: number };

export function McvvNewRunnerForm({
  year,
  registrationId,
  categories,
  clubListId,
  defaultClubName,
  nationality: nationalityField,
  copy,
}: {
  year: number;
  /** null = přihláška ještě neexistuje, založí se s prvním běžcem. */
  registrationId: number | null;
  categories: CategoryOption[];
  /** Id společné nabídky klubů (`McvvClubDatalist`). */
  clubListId: string;
  defaultClubName: string;
  /** Státní příslušnost (#200); výchozí domácí stát, lze zvolit „neuvedeno“. */
  nationality: NationalityField;
  copy: {
    firstName: string;
    lastName: string;
    birthYear: string;
    sex: string;
    sexPlaceholder: string;
    sexRequired: string;
    categoryPlaceholder: string;
    male: string;
    female: string;
    category: string;
    club: string;
    clubOptional: string;
    clubHint: string;
    add: string;
    ambiguous: string;
    taken: string;
    invalid: string;
  };
}) {
  // All fields are controlled so that React's automatic form reset after a server action
  // does not wipe the user's input on a validation/server error. Clear only on success.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  // No default: the runner id encodes the sex, so the user must choose explicitly (#103).
  const [sex, setSex] = useState<"" | "M" | "F">("");
  const [birthYear, setBirthYear] = useState("");
  const [categoryChoice, setCategoryChoice] = useState("");
  const [nationality, setNationality] = useState<string>(HOME_COUNTRY);
  const [state, action] = useActionState(
    async (prev: AddRunnerState, formData: FormData): Promise<AddRunnerState> => {
      const result = await addNewRunner(prev, formData);
      if (result.ok) {
        setFirstName("");
        setLastName("");
        setBirthYear("");
        setSex("");
        setCategoryChoice("");
        setNationality(HOME_COUNTRY);
      }
      return result;
    },
    {} as AddRunnerState,
  );
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
    () => (sex && Number.isFinite(born) ? eligibleCategoriesFor(born, sex, year, categories) : []),
    [born, categories, sex, year],
  );
  const defaultCategoryId = useMemo(() => {
    return defaultCategory(eligible)?.id ?? "";
  }, [eligible]);
  const categoryId = eligible.some((category) => category.id === categoryChoice)
    ? categoryChoice
    : defaultCategoryId;

  // Without a sex the browser's required-field validation explains what is missing.
  const canSubmit = sex === "" || eligible.length > 0;

  return (
    <form action={action} className="mt-6 grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="registrationId" value={registrationId ?? 0} />
      <div className="grid gap-1.5">
        <Label htmlFor="lastName">{copy.lastName}</Label>
        <Input
          id="lastName"
          name="lastName"
          required
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          className="h-10 bg-race-surface"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="firstName">{copy.firstName}</Label>
        <Input
          id="firstName"
          name="firstName"
          required
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          className="h-10 bg-race-surface"
        />
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
          required
          value={sex}
          aria-invalid={state.error === "sex" ? true : undefined}
          onChange={(event) =>
            setSex(event.target.value === "F" ? "F" : event.target.value === "M" ? "M" : "")
          }
          className={`h-10 border border-race-line bg-race-surface px-3 ${sex ? "" : "text-race-muted"}`}
        >
          <option value="" disabled>
            {copy.sexPlaceholder}
          </option>
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
          value={categoryId}
          onChange={(event) => setCategoryChoice(event.target.value)}
          className="h-10 border border-race-line bg-race-surface px-3"
        >
          {eligible.length === 0 ? (
            <option value="" disabled>
              {copy.categoryPlaceholder}
            </option>
          ) : null}
          {eligible.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="nationality">{nationalityField.label}</Label>
        <NationalitySelect
          id="nationality"
          field={nationalityField}
          value={nationality}
          onChange={setNationality}
          describedBy="nationality-hint"
        />
        {nationalityField.hint ? (
          <p id="nationality-hint" className="text-xs text-race-muted">
            {nationalityField.hint}
          </p>
        ) : null}
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        {/* Klub je nepovinný (#204): štítek i nápověda to říkají výslovně. */}
        <Label htmlFor="clubName">
          {copy.club}
          <span className="font-normal text-race-muted">{copy.clubOptional}</span>
        </Label>
        <input type="hidden" name="clubName" value={club} />
        <McvvClubCombobox
          id="clubName"
          value={club}
          onChange={setClub}
          listId={clubListId}
          describedBy="clubName-hint"
          className="h-10"
        />
        <p id="clubName-hint" className="text-xs text-race-muted">
          {copy.clubHint}
        </p>
      </div>
      {state.error === "sex" ? (
        <p className="sm:col-span-2 text-sm text-destructive">{copy.sexRequired}</p>
      ) : null}
      {state.error === "ambiguous" ? (
        <p className="sm:col-span-2 text-sm text-destructive">{copy.ambiguous}</p>
      ) : null}
      {state.error === "taken" ? (
        <p className="sm:col-span-2 text-sm text-destructive">{copy.taken}</p>
      ) : null}
      {state.error === "invalid" ? (
        <p className="sm:col-span-2 text-sm text-destructive">{copy.invalid}</p>
      ) : null}
      <Button
        type="submit"
        disabled={!canSubmit}
        className="h-10 w-fit bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
      >
        {copy.add}
      </Button>
    </form>
  );
}
