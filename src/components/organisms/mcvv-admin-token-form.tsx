"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import type { CreateTokenState } from "@/lib/live/admin-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  action: (previous: CreateTokenState, formData: FormData) => Promise<CreateTokenState>;
  defaultFrom: string;
  defaultUntil: string;
};

/** Vytvoření API klíče zařízení – klíč se ukáže jen jednou, v DB je jen jeho hash. */
export function McvvAdminTokenForm({ action, defaultFrom, defaultUntil }: Props) {
  const t = useTranslations("LiveResults");
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <div className="grid gap-4">
      {state.token ? (
        <div
          role="status"
          className="grid gap-2 border border-race-accent bg-race-accent/10 p-3 text-sm"
        >
          <p className="font-semibold">{t("tokenCreated", { label: state.label ?? "" })}</p>
          <code
            data-testid="new-token"
            className="select-all break-all bg-race-surface p-2 font-mono text-xs"
          >
            {state.token}
          </code>
          <p className="text-race-muted">{t("tokenOnce")}</p>
        </div>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {t(`tokenError.${state.error}` as never)}
        </p>
      ) : null}
      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="token-label">{t("tokenLabel")}</Label>
          <Input
            id="token-label"
            name="label"
            maxLength={64}
            required
            placeholder={t("tokenLabelPlaceholder")}
            className="h-10 bg-race-surface"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="token-splits">{t("tokenSplits")}</Label>
          <Input
            id="token-splits"
            name="splits"
            defaultValue="9"
            maxLength={8}
            className="h-10 bg-race-surface"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="token-author">{t("tokenAuthor")}</Label>
          <Input
            id="token-author"
            name="author"
            defaultValue="LuM"
            maxLength={8}
            className="h-10 bg-race-surface"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="token-from">{t("tokenFrom")}</Label>
          <Input
            id="token-from"
            name="validFrom"
            type="datetime-local"
            defaultValue={defaultFrom}
            className="h-10 bg-race-surface"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="token-until">{t("tokenUntil")}</Label>
          <Input
            id="token-until"
            name="validUntil"
            type="datetime-local"
            defaultValue={defaultUntil}
            className="h-10 bg-race-surface"
          />
        </div>
        <Button
          type="submit"
          disabled={pending}
          className="h-10 w-fit bg-race-accent-solid font-semibold text-white hover:bg-race-accent-solid-hover"
        >
          {t("tokenCreate")}
        </Button>
      </form>
    </div>
  );
}
