"use client";

import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { changeUserRole } from "@/lib/admin/users";

export type McvvAdminRoleFormProps = {
  userId: number;
  userName: string;
  currentRole: string;
  roles: { value: string; label: string }[];
  /** Šablona potvrzení s {name} a {role}. */
  confirmTemplate: string;
  submitLabel: string;
  selectLabel: string;
  /** Aktuální filtry (query string), aby se po uložení vrátily. */
  back: string;
  disabled?: boolean;
};

export function McvvAdminRoleForm({
  userId,
  userName,
  currentRole,
  roles,
  confirmTemplate,
  submitLabel,
  selectLabel,
  back,
  disabled,
}: McvvAdminRoleFormProps) {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const role = new FormData(event.currentTarget).get("role");
    const label = roles.find((item) => item.value === role)?.label ?? String(role);
    if (role === currentRole) {
      event.preventDefault();
      return;
    }
    const message = confirmTemplate.replace("{name}", userName).replace("{role}", label);
    if (!window.confirm(message)) {
      event.preventDefault();
    }
  }

  return (
    <form action={changeUserRole} onSubmit={onSubmit} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="back" value={back} />
      <select
        name="role"
        defaultValue={currentRole}
        aria-label={selectLabel}
        disabled={disabled}
        className="h-9 border border-race-line bg-race-surface px-2 text-sm"
      >
        {roles.map((role) => (
          <option key={role.value} value={role.value}>
            {role.label}
          </option>
        ))}
      </select>
      <Button
        type="submit"
        variant="outline"
        disabled={disabled}
        className="h-9 border-race-line bg-race-surface"
      >
        {submitLabel}
      </Button>
    </form>
  );
}
