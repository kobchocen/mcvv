import { Link } from "@/i18n/routing";

export type ClubNameLinkProps = {
  /** Profile slug (/kluby/[slug]); without it the name is plain text. */
  slug?: string | null;
  name?: string | null;
  className?: string;
};

export function ClubNameLink({ slug, name, className }: ClubNameLinkProps) {
  const label = name?.trim() || "—";
  if (!slug || label === "—") {
    return <>{label}</>;
  }
  return (
    <Link
      href={{ pathname: "/kluby/[slug]", params: { slug } } as never}
      className={className ?? "underline-offset-2 hover:text-race-accent hover:underline"}
    >
      {label}
    </Link>
  );
}
