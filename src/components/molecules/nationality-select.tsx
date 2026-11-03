import { HOME_COUNTRY, type CountryOption } from "@/lib/runner/nationality";

/** Data pro výběr státní příslušnosti (#200), připravená na serveru (názvy podle jazyka). */
export type NationalityField = {
  label: string;
  /** Text pro běžce bez uvedeného státu (jen ve výpisech; ve výběru taková volba není, Q360). */
  unknown: string;
  hint?: string;
  common: CountryOption[];
  other: CountryOption[];
};

/**
 * Select státní příslušnosti: časté státy nahoře, oddělovač, pak ostatní abecedně.
 * Stát je povinný (Q360): ve výběru není volba „neuvedeno“, bez hodnoty se předvyplní CZ.
 */
export function NationalitySelect({
  id,
  name = "nationality",
  field,
  value,
  defaultValue,
  onChange,
  className,
  describedBy,
}: {
  id: string;
  name?: string;
  field: NationalityField;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  className?: string;
  describedBy?: string;
}) {
  return (
    <select
      id={id}
      name={name}
      value={value === undefined ? undefined : value || HOME_COUNTRY}
      defaultValue={value === undefined ? defaultValue || HOME_COUNTRY : undefined}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      aria-describedby={describedBy}
      required
      className={className ?? "h-10 border border-race-line bg-race-surface px-3"}
    >
      {field.common.map((option) => (
        <option key={option.code} value={option.code}>
          {option.label}
        </option>
      ))}
      <option disabled>──────────</option>
      {field.other.map((option) => (
        <option key={option.code} value={option.code}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
