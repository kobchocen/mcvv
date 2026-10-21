"use client";

import { useState, useTransition } from "react";

import { saveAccountPromotion } from "@/lib/entries/actions";
import { Button } from "@/components/ui/button";

/** Souhlas se zasíláním informací e-mailem na účtu (i bez přihlášky a po uzávěrce). */
export function McvvAccountPromotionForm({
  noMail,
  copy,
}: {
  noMail: boolean;
  copy: { noMail: string; save: string; saved: string };
}) {
  const [value, setValue] = useState(noMail);
  const [saved, setSaved] = useState(noMail);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = value !== saved;

  // onSubmit (ne `action`): formulářová akce by po uložení vrátila zaškrtávátko do výchozího stavu.
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const next = value;
    startTransition(async () => {
      await saveAccountPromotion(formData);
      setSaved(next);
      setJustSaved(true);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="noMail"
          value="N"
          checked={value}
          onChange={(event) => setValue(event.target.checked)}
        />
        {copy.noMail}
      </label>
      <Button
        type="submit"
        variant="outline"
        disabled={!dirty || pending}
        className="h-9 border-race-line bg-race-surface disabled:opacity-50"
      >
        {copy.save}
      </Button>
      <span role="status" aria-live="polite" className="text-sm font-medium text-race-accent">
        {justSaved && !dirty ? `${copy.saved} ✓` : ""}
      </span>
    </form>
  );
}
