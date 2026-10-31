/** Jeden `<datalist>` na stránku pro našeptávač „spolu s“ v dialogu spec. startu. */
export function McvvAdminPartnerDatalist({
  id,
  options,
}: {
  id: string;
  options: { runnerId: string; value: string }[];
}) {
  return (
    <datalist id={id}>
      {options.map((option) => (
        <option key={option.runnerId} value={option.value} />
      ))}
    </datalist>
  );
}
