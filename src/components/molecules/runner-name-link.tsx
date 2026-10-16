import { Link } from "@/i18n/routing";

export type RunnerNameLinkProps = {
  id?: string | null;
  name?: string | null;
};

export function RunnerNameLink({ id, name }: RunnerNameLinkProps) {
  const label = name?.trim() || "—";
  if (!id) {
    return <>{label}</>;
  }
  return (
    <Link
      href={{ pathname: "/bezec/[id]", params: { id } } as never}
      className="font-semibold text-race-accent underline-offset-2 hover:underline"
    >
      {label}
    </Link>
  );
}
