"use client";

import { useFormStatus } from "react-dom";
import { LogOut } from "lucide-react";

import { logoutHome } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

function LogoutSubmit({
  label,
  pendingLabel,
  className,
}: {
  label: string;
  pendingLabel: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="icon"
      disabled={pending}
      className={className}
      aria-label={pending ? pendingLabel : label}
      title={pending ? pendingLabel : label}
    >
      {pending ? (
        <Spinner className="size-[18px]" />
      ) : (
        <LogOut className="size-[18px]" aria-hidden="true" />
      )}
      <span className="sr-only">{pending ? pendingLabel : label}</span>
    </Button>
  );
}

export function McvvLogoutButton({
  label,
  pendingLabel,
  className,
}: {
  label: string;
  pendingLabel: string;
  className: string;
}) {
  return (
    <form action={logoutHome}>
      <LogoutSubmit label={label} pendingLabel={pendingLabel} className={cn(className)} />
    </form>
  );
}
