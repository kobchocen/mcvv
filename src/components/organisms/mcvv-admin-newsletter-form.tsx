import { saveNewsletter } from "@/lib/newsletter/actions";
import { AdminField } from "@/components/organisms/mcvv-admin-field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type NewsletterFormValues = {
  id?: number;
  subject: string;
  body: string;
  audienceUsers: boolean;
  audienceYears: number;
};

export const NEWSLETTER_YEAR_OPTIONS = [0, 1, 2, 3, 5, 10, 20];

export function McvvAdminNewsletterForm({
  values,
  audienceHints,
}: {
  values: NewsletterFormValues;
  audienceHints: { users: number; years: Record<number, number> };
}) {
  return (
    <form action={saveNewsletter} className="grid max-w-3xl gap-4">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <AdminField name="subject" label="Předmět" defaultValue={values.subject} required />
      <AdminField
        name="body"
        label="Text (Markdown: # nadpis, **tučně**, - odrážka, [odkaz](https://…))"
      >
        <Textarea
          id="body"
          name="body"
          required
          defaultValue={values.body}
          className="min-h-72 bg-race-surface font-mono text-sm"
        />
      </AdminField>
      <fieldset className="grid gap-2 border border-race-line/55 p-4">
        <legend className="px-1 text-sm font-semibold">Publikum</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="audienceUsers"
            defaultChecked={values.audienceUsers}
            className="size-4"
          />
          Registrovaní uživatelé s ověřeným e-mailem ({audienceHints.users})
        </label>
        <label className="grid gap-1 text-sm">
          Účastníci z přihlášek
          <select
            name="audienceYears"
            defaultValue={values.audienceYears}
            className="h-10 max-w-sm border border-race-line bg-race-surface px-2"
          >
            {NEWSLETTER_YEAR_OPTIONS.map((years) => (
              <option key={years} value={years}>
                {years === 0
                  ? "nezahrnovat"
                  : `za posledních ${years} ${years === 1 ? "rok" : years < 5 ? "roky" : "let"} (${audienceHints.years[years] ?? 0})`}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-race-muted">
          Počty jsou unikátní platné adresy bez odhlášených. Celkové publikum (po sloučení) je vidět
          v detailu kampaně.
        </p>
      </fieldset>
      <Button
        type="submit"
        className="h-10 w-fit bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
      >
        Uložit koncept
      </Button>
    </form>
  );
}
