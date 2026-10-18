"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  sendNewsletterBatchAction,
  sendNewsletterTest,
  startNewsletter,
  type ActionState,
} from "@/lib/newsletter/actions";
import type { RecipientCounts } from "@/lib/newsletter/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const buttonClass =
  "h-10 bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover";

function Message({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p
      className={
        state.ok
          ? "text-sm text-emerald-600 dark:text-emerald-400"
          : "text-sm text-red-600 dark:text-red-400"
      }
      role="status"
    >
      {state.message}
    </p>
  );
}

export function McvvNewsletterTestForm({ id, defaultTo }: { id: number; defaultTo: string }) {
  const [state, action, pending] = useActionState(sendNewsletterTest, null);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <Label htmlFor="to">Testovací e-mail</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="to"
          name="to"
          type="email"
          required
          defaultValue={defaultTo}
          className="max-w-sm bg-race-surface"
        />
        <Button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Odesílám…" : "Odeslat test"}
        </Button>
      </div>
      <Message state={state} />
    </form>
  );
}

export function McvvNewsletterStartForm({ id, count }: { id: number; count: number }) {
  const [state, action, pending] = useActionState(startNewsletter, null);
  const [typed, setTyped] = useState("");
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm">
        E-mail dostane <strong>{count}</strong> adres. Akci nelze vrátit. Pro potvrzení opište počet
        příjemců:
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          name="confirmCount"
          inputMode="numeric"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="max-w-32 bg-race-surface"
          aria-label="Počet příjemců"
        />
        <Button type="submit" disabled={pending || typed !== String(count)} className={buttonClass}>
          {pending ? "Zařazuji…" : `Odeslat ${count} příjemcům`}
        </Button>
      </div>
      <Message state={state} />
    </form>
  );
}

export function McvvNewsletterProgress({
  id,
  initial,
  active,
  pauseMs,
}: {
  id: number;
  initial: RecipientCounts;
  active: boolean;
  pauseMs: number;
}) {
  const [counts, setCounts] = useState(initial);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);
  const processed = counts.sent + counts.failed + counts.skipped;
  const percent = counts.total ? Math.round((processed / counts.total) * 100) : 0;

  async function run() {
    stop.current = false;
    setRunning(true);
    setError(null);
    try {
      for (;;) {
        if (stop.current) break;
        const outcome = await sendNewsletterBatchAction(id);
        setCounts(outcome.counts);
        if (outcome.error) setError(outcome.error);
        if (outcome.done) {
          window.location.reload();
          break;
        }
        if (outcome.paused) break;
        await new Promise((r) => setTimeout(r, outcome.retryAfterMs || pauseMs));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    const timer = active ? setTimeout(() => void run(), 0) : undefined;
    return () => {
      clearTimeout(timer);
      stop.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-3">
      <div className="h-3 w-full max-w-xl bg-race-line/40">
        <div className="h-3 bg-race-accent transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-sm">
        {percent} % · odesláno {counts.sent} · chyby {counts.failed} · přeskočeno (odhlášení){" "}
        {counts.skipped} · čeká {counts.pending + counts.sending} · celkem {counts.total}
      </p>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {active ? (
        running ? (
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() => (stop.current = true)}
          >
            Pozastavit
          </Button>
        ) : (
          <Button type="button" className={`${buttonClass} w-fit`} onClick={() => void run()}>
            Pokračovat v odesílání
          </Button>
        )
      ) : null}
      {active ? (
        <p className="text-xs text-race-muted">
          Odesílá se po dávkách z tohoto okna. Po zavření lze kdykoli pokračovat – nikomu nepřijde
          e-mail dvakrát.
        </p>
      ) : null}
    </div>
  );
}
