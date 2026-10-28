"use client";

import { useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Text potvrzovacího tlačítka (výchozí „Potvrdit“). */
  confirmLabel?: ReactNode;
  /** Text tlačítka zpět (výchozí „Zrušit“). */
  cancelLabel?: ReactNode;
  /** Nebezpečná / nevratná akce = červené potvrzovací tlačítko. */
  destructive?: boolean;
  /** Probíhá akce: potvrzovací tlačítko je zablokované a ukazuje „Pracuji…“. */
  pending?: boolean;
  onConfirm: () => void;
  /** Volitelný obsah pod popisem (seznam dopadů apod.). */
  children?: ReactNode;
};

/**
 * Potvrzovací dialog v designu webu (#185) – náhrada `window.confirm()`.
 * Radix Dialog: zachycení fokusu, Esc / klik mimo = zrušit, na mobilu přes celou šířku.
 * Fokus po otevření dostane tlačítko „Zrušit“, aby Enter omylem nespustil nevratnou akci.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  pending = false,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const t = useTranslations("ConfirmDialog");
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
        data-testid="confirm-dialog"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription className="whitespace-pre-line">{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{t("srDescription")}</DialogDescription>
          )}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
            className="border-race-line bg-race-surface"
          >
            {cancelLabel ?? t("cancel")}
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            data-testid="confirm-dialog-confirm"
            className={cn(
              "font-display font-semibold text-white",
              destructive
                ? "bg-red-700 hover:bg-red-800"
                : "bg-race-accent-solid hover:bg-race-accent-solid-hover",
            )}
          >
            {pending ? t("working") : (confirmLabel ?? t("confirm"))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type ConfirmSubmitButtonProps = Omit<ComponentProps<typeof Button>, "type" | "onClick"> & {
  /** Nadpis dialogu. */
  title: ReactNode;
  /**
   * Text dialogu, nebo funkce, která ho sestaví z aktuálního formuláře.
   * Vrátí-li funkce `null`, formulář se neodešle a dialog se neotevře (např. beze změny).
   */
  description?: ReactNode | ((form: HTMLFormElement) => ReactNode | null);
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  destructive?: boolean;
};

/**
 * Odesílací tlačítko formuláře s potvrzením (#185). Funguje i uvnitř serverových
 * komponent s `<form action={serverAction}>`: nejdřív ověří povinná pole formuláře,
 * otevře dialog a po potvrzení formulář odešle přes `requestSubmit()` – včetně
 * `name`/`value` tlačítka (submitter), takže serverová akce dostane stejná data jako dřív.
 */
export function ConfirmSubmitButton({
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  name,
  value,
  disabled,
  children,
  ...buttonProps
}: ConfirmSubmitButtonProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<ReactNode>(null);
  const { pending } = useFormStatus();

  const onTrigger = () => {
    const form = triggerRef.current?.form;
    if (!form || !form.reportValidity()) return;
    const resolved = typeof description === "function" ? description(form) : description;
    if (resolved === null) return;
    setText(resolved);
    setOpen(true);
  };

  const onConfirm = () => {
    setOpen(false);
    const form = triggerRef.current?.form;
    if (form && submitRef.current) form.requestSubmit(submitRef.current);
  };

  return (
    <>
      <Button
        {...buttonProps}
        ref={triggerRef}
        type="button"
        disabled={disabled || pending}
        aria-haspopup="dialog"
        onClick={onTrigger}
      >
        {children}
      </Button>
      <button ref={submitRef} type="submit" name={name} value={value} hidden tabIndex={-1} />
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={text}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        destructive={destructive}
        pending={pending}
        onConfirm={onConfirm}
      />
    </>
  );
}
