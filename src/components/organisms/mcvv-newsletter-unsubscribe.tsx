"use client";

import { useActionState } from "react";

import { unsubscribeAction } from "@/lib/newsletter/actions";
import { Button } from "@/components/ui/button";

export function McvvNewsletterUnsubscribe({ token }: { token: string }) {
  const [state, action, pending] = useActionState(unsubscribeAction, null);
  if (state === "unsubscribed" || state === "already") {
    return (
      <p className="text-lg">
        {state === "unsubscribed"
          ? "Hotovo. Z odběru novinek MCVV jste odhlášeni."
          : "Z odběru jste již byli odhlášeni dříve."}{" "}
        Další newslettery vám nepošleme.
      </p>
    );
  }
  if (state === "invalid") {
    return (
      <p className="text-lg text-red-600 dark:text-red-400">Odkaz pro odhlášení je neplatný.</p>
    );
  }
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-lg">Opravdu už nechcete dostávat novinky o závodě MCVV e-mailem?</p>
      <Button
        type="submit"
        disabled={pending}
        className="h-11 w-fit bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
      >
        {pending ? "Odhlašuji…" : "Odhlásit z odběru"}
      </Button>
    </form>
  );
}
