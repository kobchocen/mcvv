"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { saveNewsletterDraft, type SaveNewsletterResult } from "@/lib/newsletter/actions";
import {
  NEWSLETTER_YEAR_OPTIONS,
  changedNewsletterFields,
  snapshotFromForm,
  snapshotFromValues,
} from "@/lib/newsletter/form-state";
import { AdminField } from "@/components/organisms/mcvv-admin-field";
import {
  McvvNewsletterBannerFields,
  McvvUnsavedNotice,
  useNewsletterDraft,
} from "@/components/organisms/mcvv-admin-newsletter-banner";
import { Button } from "@/components/ui/button";
import {
  McvvSaveStatus,
  saveButtonState,
  type SaveFeedback,
} from "@/components/organisms/mcvv-admin-newsletter-save";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

export type NewsletterFormValues = {
  id?: number;
  subject: string;
  body: string;
  audienceUsers: boolean;
  audienceYears: number;
  excludeCurrentEntrants: boolean;
  /** "" | "preset:<klíč>" | "image:<id>" (viz parseBannerChoice). */
  banner: string;
  bannerAlt: string;
  bannerLink: string;
};

export function McvvAdminNewsletterForm({
  values,
  audienceHints,
  bannerOptions,
}: {
  values: NewsletterFormValues;
  bannerOptions: { value: string; label: string }[];
  audienceHints: {
    users: number;
    years: Record<number, number>;
    currentEntrants: { year: number; count: number };
  };
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const shared = useNewsletterDraft();
  const isNew = !values.id;
  const saved = useMemo(() => snapshotFromValues(values), [values]);
  const [changes, setChanges] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<SaveFeedback>(null);
  const dirty = changes.length > 0;
  const publish = shared?.setChanges;

  // Neuložené změny = aktuální pole formuláře proti uložené verzi (props po uložení).
  const recheck = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    const next = changedNewsletterFields(snapshotFromForm(new FormData(form)), saved);
    setChanges((prev) => (prev.join() === next.join() ? prev : next));
  }, [saved]);

  useEffect(() => {
    recheck();
  }, [recheck, shared?.draft]);

  useEffect(() => {
    publish?.(changes);
  }, [publish, changes]);

  // Varování při odchodu ze stránky s neuloženými změnami.
  useEffect(() => {
    if (!dirty || pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    setFeedback(null);
    startTransition(async () => {
      let result: SaveNewsletterResult;
      try {
        result = await saveNewsletterDraft(data);
      } catch (error) {
        // Přesměrování nové kampaně do detailu řeší Next.js (není to chyba).
        if (isNew) throw error;
        setFeedback({ kind: "error", message: "server neodpověděl, zkuste to znovu." });
        return;
      }
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.message });
        return;
      }
      if (!result.bannerError) {
        // Uložený banner (např. nově nahraný → „image:<id>“) se propíše do polí; soubor se vyprázdní.
        const file = form.elements.namedItem("bannerFile");
        if (file instanceof HTMLInputElement) file.value = "";
        shared?.setDraft({ ...result.banner, uploadSrc: null, uploadDataUrl: null });
      }
      setFeedback({ kind: "saved", at: result.savedAt, bannerError: result.bannerError });
    });
  };

  const button = saveButtonState({ isNew, dirty, pending });

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onInput={recheck}
      onChange={recheck}
      className="grid max-w-3xl gap-4"
    >
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
      <McvvNewsletterBannerFields
        options={bannerOptions}
        initial={{ choice: values.banner, alt: values.bannerAlt, link: values.bannerLink }}
      />
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
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="excludeCurrentEntrants"
            defaultChecked={values.excludeCurrentEntrants}
            className="mt-0.5 size-4 shrink-0"
          />
          <span>
            {`Vyloučit letos přihlášené (ročník ${audienceHints.currentEntrants.year}: ${audienceHints.currentEntrants.count} adres z nezrušených přihlášek s\u00a0alespoň jedním běžcem)`}
          </span>
        </label>
        <p className="text-xs text-race-muted">
          Počty jsou unikátní platné adresy bez odhlášených. Celkové publikum (po sloučení) je vidět
          v detailu kampaně.
        </p>
      </fieldset>
      {isNew ? null : <McvvUnsavedNotice changes={changes} />}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={button.disabled}
          aria-busy={pending}
          className="h-10 w-fit bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
        >
          {pending ? <Spinner aria-hidden /> : null}
          {button.label}
        </Button>
        <McvvSaveStatus pending={pending} feedback={feedback} dirty={dirty} />
      </div>
    </form>
  );
}
