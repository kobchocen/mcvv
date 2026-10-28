import type { CountryOption } from "@/lib/runner/nationality";

/** Data pro výběr státní příslušnosti (#200), připravená na serveru (názvy podle jazyka). */
export type NationalityField = {
  label: string;
  /** Text prázdné volby („neuvedeno“). */
  unknown: string;
  hint?: string;
  common: CountryOption[];
  other: CountryOption[];
};

/** Select státní příslušnosti: časté státy nahoře, oddělovač, pak ostatní abecedně. */
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
      value={value}
      defaultValue={value === undefined ? defaultValue : undefined}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      aria-describedby={describedBy}
      className={className ?? "h-10 border border-race-line bg-race-surface px-3"}
    >
      <option value="">{field.unknown}</option>
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
