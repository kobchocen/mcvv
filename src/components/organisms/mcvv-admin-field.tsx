import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AdminField({
  name,
  label,
  type = "text",
  defaultValue,
  required,
  children,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string | number | null;
  required?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      {children ?? (
        <Input
          id={name}
          name={name}
          type={type}
          required={required}
          defaultValue={type === "file" ? undefined : (defaultValue ?? "")}
          className="h-10 bg-race-surface"
        />
      )}
    </div>
  );
}
