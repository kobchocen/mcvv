"use client";

import { useMemo, useState } from "react";

import { addNewRunner } from "@/lib/entries/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CategoryOption = { id: string; name: string; sex: string; age: number };

function isEligible(birthYear: number, sex: "M" | "F", raceYear: number, category: CategoryOption) {
  if (category.sex !== sex) {
    return false;
  }
  if (category.age === 0) {
    return true;
  }
  const cutoff = raceYear - category.age;
  if (category.age <= 20) {
    return birthYear >= cutoff;
  }
  return birthYear <= cutoff;
}

export function McvvNewRunnerForm({
  year,
  registrationId,
  categories,
  copy,
}: {
  year: number;
  registrationId: number;
  categories: CategoryOption[];
  copy: {
    firstName: string;
    lastName: string;
    birthYear: string;
    sex: string;
    male: string;
    female: string;
    category: string;
    add: string;
  };
}) {
  const [sex, setSex] = useState<"M" | "F">("M");
  const [birthYear, setBirthYear] = useState("");
  const born = Number.parseInt(birthYear, 10);
  const eligible = useMemo(
    () =>
      Number.isFinite(born)
        ? categories.filter((category) => isEligible(born, sex, year, category))
        : [],
    [born, categories, sex, year],
  );

  return (
    <form action={addNewRunner} className="mt-6 grid gap-3 sm:grid-cols-2">
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
          className="h-10 border border-race-line bg-race-surface px-3"
        >
          {eligible.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
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
