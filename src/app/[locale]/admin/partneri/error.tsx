"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Pojistka administrace partnerů: neočekávané selhání akce (např. formulář otevřený ze starší
 * verze aplikace, výpadek spojení) ukáže srozumitelnou hlášku místo obecné chybové stránky.
 * Odmítnuté logo sem nepadá – `savePartner` ho vrací přesměrováním s konkrétním důvodem.
 */
export default function AdminPartnersError({ error }: Readonly<{ error: Error }>) {
  const t = useTranslations("Admin");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-2xl gap-4" role="alert">
        <h1 className="font-display text-2xl font-bold text-foreground dark:text-white">
          {t("partnersErrorTitle")}
        </h1>
        <p className="text-sm text-destructive">{t("partnersErrorText")}</p>
        <Button
          type="button"
          className="h-11 w-fit bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
          onClick={() => window.location.reload()}
        >
          {t("partnersErrorRetry")}
        </Button>
      </div>
    </main>
  );
}
