"use client";

import { ConfirmSubmitButton } from "@/components/molecules/confirm-dialog";
import { deleteRunnerAction } from "@/lib/admin/runner-orphan-actions";

/**
 * „Smazat běžce“ v detailu běžce – jen když nemá žádná navázaná data. Potvrzovací dialog,
 * server vazby znovu ověří v transakci (`deleteRunnerAction`).
 */
export function McvvAdminRunnerDelete({
  runnerId,
  copy,
}: {
  runnerId: string;
  copy: { trigger: string; title: string; description: string; confirm: string };
}) {
  return (
    <form action={deleteRunnerAction} className="mt-4" data-testid="runner-delete-form">
      <input type="hidden" name="runnerId" value={runnerId} />
      <ConfirmSubmitButton
        destructive
        variant="destructive"
        name="potvrzeno"
        value="ano"
        title={copy.title}
        description={copy.description}
        confirmLabel={copy.confirm}
        data-testid="runner-delete"
      >
        {copy.trigger}
      </ConfirmSubmitButton>
    </form>
  );
}
