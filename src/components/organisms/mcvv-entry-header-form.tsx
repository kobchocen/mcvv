"use client";

import { useState } from "react";

import { saveEntryHeader } from "@/lib/entries/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

  return (
    <form action={saveEntryHeader} className="grid max-w-xl gap-4">
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
        <Button
          type="submit"
          disabled={!dirty}
          className="h-10 w-fit bg-race-accent font-display font-semibold text-white hover:bg-race-accent-hover disabled:opacity-50"
        >
          {dirty ? copy.save : copy.saved}
        </Button>
      ) : null}
    </form>
  );
}
