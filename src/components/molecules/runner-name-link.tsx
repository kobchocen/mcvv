import { Link } from "@/i18n/routing";
import { flagEmoji, listFlag } from "@/lib/runner/nationality";

export type RunnerNameLinkProps = {
  id?: string | null;
  name?: string | null;
  /**
   * Státní příslušnost (#200, ISO kód). Ve výpisech se vlaječka ukáže jen u jiného než
   * domácího státu (CZ), aby seznamy nebyly přeplněné.
   */
  nationality?: string | null;
};

export function RunnerNameFlag({ code }: { code?: string | null }) {
  const flag = listFlag(code);
  if (!flag) {
    return null;
  }
  return (
    <span className="ml-1.5 font-normal" role="img" aria-label={flag} title={flag}>
      {flagEmoji(flag)}
    </span>
  );
}

export function RunnerNameLink({ id, name, nationality }: RunnerNameLinkProps) {
  const label = name?.trim() || "—";
  if (!id) {
    return <>{label}</>;
  }
  return (
    <>
      <Link
        href={{ pathname: "/bezec/[id]", params: { id } } as never}
        className="font-semibold text-race-accent underline-offset-2 hover:underline"
      >
        {label}
      </Link>
      <RunnerNameFlag code={nationality} />
    </>
  );
}
