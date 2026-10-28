"use client";

import { ConfirmSubmitButton } from "@/components/molecules/confirm-dialog";
import { changeUserRole } from "@/lib/admin/users";
import { fillTemplate } from "@/lib/format/template";

export type McvvAdminRoleFormProps = {
  userId: number;
  userName: string;
  currentRole: string;
  roles: { value: string; label: string }[];
  /** Šablona potvrzení s {name} a {role}. */
  confirmTemplate: string;
  /** Nadpis potvrzovacího dialogu. */
  confirmTitle: string;
  /** Text potvrzovacího tlačítka v dialogu. */
  confirmButton: string;
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
  confirmTitle,
  confirmButton,
  submitLabel,
  selectLabel,
  back,
  disabled,
}: McvvAdminRoleFormProps) {
  /** Text dialogu podle vybrané role; beze změny role se nic neodesílá (null). */
  const describe = (form: HTMLFormElement) => {
    const role = new FormData(form).get("role");
    if (role === currentRole) return null;
    const label = roles.find((item) => item.value === role)?.label ?? String(role);
    return fillTemplate(confirmTemplate, { name: userName, role: label });
  };

  return (
    <form action={changeUserRole} className="flex items-center gap-2">
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
      <ConfirmSubmitButton
        variant="outline"
        disabled={disabled}
        title={confirmTitle}
        description={describe}
        confirmLabel={confirmButton}
        className="h-9 border-race-line bg-race-surface"
      >
        {submitLabel}
      </ConfirmSubmitButton>
    </form>
  );
}
