"use client";

import type { ReactNode } from "react";
import { useLinkStatus } from "next/link";
import { useTranslations } from "next-intl";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * Obsah odkazu, který během navigace ukáže spinner a „Pracuji…“ (#192, Q248) – např.
 * „Načíst další“, kde načtení dalších návrhů chvíli trvá. Musí být uvnitř `<Link>`.
 */
export function LinkPendingLabel({
  children,
  pendingLabel,
}: {
  children: ReactNode;
  pendingLabel?: ReactNode;
}) {
  const t = useTranslations("ConfirmDialog");
  const { pending } = useLinkStatus();
  return (
    <span className="inline-flex items-center gap-2" aria-busy={pending || undefined}>
      {pending ? <Spinner className="size-4" aria-hidden /> : null}
      {pending ? (pendingLabel ?? t("working")) : children}
    </span>
  );
}

/**
 * Ponechá text odkazu a při navigaci ukáže spinner. Hodí se do kompaktního menu
 * (hlavička, odznaky statistik), kde by výměna textu poskočila v rozvržení.
 */
export function LinkPendingContents({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      aria-busy={pending || undefined}
    >
      {pending ? <Spinner className="size-3.5 shrink-0" aria-hidden /> : null}
      {children}
    </span>
  );
}
