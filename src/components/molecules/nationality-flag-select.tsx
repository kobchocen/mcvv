"use client";

import { useState } from "react";

import { CountryFlag } from "@/components/atoms/country-flag";
import {
  NationalitySelect,
  type NationalityField,
} from "@/components/molecules/nationality-select";

/**
 * Výběr státu s vlaječkou: nativní select (klávesnice, čtečky) a vedle obrázek vlaječky
 * právě zvoleného státu. Vlaječky jsou obrázky – v <option> by je prohlížeč nevykreslil.
 */
export function NationalityFlagSelect({
  id,
  name = "nationality",
  field,
  defaultValue = "",
  className,
}: {
  id: string;
  name?: string;
  field: NationalityField;
  defaultValue?: string;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <span className="inline-flex items-center gap-2" data-testid={`${id}-picker`}>
      <span className="inline-flex w-5 justify-center" aria-hidden="true">
        <CountryFlag code={value} className="h-3.5" />
      </span>
      <NationalitySelect
        id={id}
        name={name}
        field={field}
        value={value}
        onChange={setValue}
        className={className}
      />
    </span>
  );
}
