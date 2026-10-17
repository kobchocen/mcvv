"use client";

import { useEffect, useState } from "react";

import { saveEntryHeader } from "@/lib/entries/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const SAVED_KEY = "mcvv-entry-header-saved";

export function McvvEntryHeaderForm({
  year,
  id,
  name,
  note,
  noMail,
  email,
  open,
  copy,
}: {
  year: number;
  id: number;
  name: string;
  note: string;
  noMail: boolean;
  email: string;
  open: boolean;
  copy: {
    name: string;
    email: string;
    note: string;
    noMail: string;
    save: string;
    saved: string;
  };
}) {
  const [nameValue, setNameValue] = useState(name);
  const [noteValue, setNoteValue] = useState(note);
  const [noMailValue, setNoMailValue] = useState(noMail);
  const dirty = nameValue !== name || noteValue !== note || noMailValue !== noMail;
  // The page remounts this form after a successful save (key = saved values), so the
  // transient "Uloženo ✓" flag survives the remount via sessionStorage.
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    const stamp = Number(window.sessionStorage.getItem(SAVED_KEY) ?? 0);
    if (Date.now() - stamp > 10_000) {
      return;
    }
    const show = window.setTimeout(() => setJustSaved(true), 0);
    const hide = window.setTimeout(() => {
      window.sessionStorage.removeItem(SAVED_KEY);
      setJustSaved(false);
    }, 3000);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, []);

  async function submit(formData: FormData) {
    window.sessionStorage.setItem(SAVED_KEY, String(Date.now()));
    setJustSaved(false);
    await saveEntryHeader(formData);
  }

  return (
    <form action={submit} className="grid max-w-xl gap-4">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-1.5">
        <Label htmlFor="entry-name">{copy.name}</Label>
        <Input
          id="entry-name"
          name="name"
          value={nameValue}
          onChange={(event) => setNameValue(event.target.value)}
          disabled={!open}
          className="h-10 bg-race-surface"
        />
      </div>
      <div className="grid gap-1.5">
        <Label>{copy.email}</Label>
        <Input value={email} disabled className="h-10 bg-race-surface" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="note">{copy.note}</Label>
        <Textarea
          id="note"
          name="note"
          value={noteValue}
          onChange={(event) => setNoteValue(event.target.value)}
          disabled={!open}
          className="min-h-24 bg-race-surface"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="noMail"
          value="N"
          checked={noMailValue}
          onChange={(event) => setNoMailValue(event.target.checked)}
          disabled={!open}
        />
        {copy.noMail}
      </label>
      {open ? (
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            disabled={!dirty}
            className="h-10 w-fit bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover disabled:opacity-50"
          >
            {copy.save}
          </Button>
          <span role="status" aria-live="polite" className="text-sm font-medium text-race-accent">
            {justSaved && !dirty ? `${copy.saved} ✓` : ""}
          </span>
        </div>
      ) : null}
    </form>
  );
}
