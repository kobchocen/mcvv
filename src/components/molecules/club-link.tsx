import type { ReactNode } from "react";

import { Link } from "@/i18n/routing";
import { clubLinkSlug } from "@/lib/clubs/core";

export type ClubLinkProps = {
  /** Club name to show (the row's own name in that edition). */
  name?: string | null;
  /** Resolved profile slug (/kluby/[slug]) when the page has the club index. */
  slug?: string | null;
  /** Club id (cis_klub.id, varchar(8)); after a merge the data holds the main id. */
  id?: string | null;
  className?: string;
  /** Link text instead of the name (e.g. "Profil" in the admin); without a club nothing renders. */
  children?: ReactNode;
};

/**
 * Club name as a link to the club profile (#196) – one component for every place a club is
 * shown. Without a club (empty id, placeholder name) the name stays plain text.
 */
export function ClubLink({ name, slug, id, className, children }: ClubLinkProps) {
  const label = name?.trim() || "—";
  const target = label === "—" ? null : clubLinkSlug({ slug, id, name: label });
  if (!target) {
    return children ? null : <>{label}</>;
  }
  return (
    <Link
      href={{ pathname: "/kluby/[slug]", params: { slug: target } } as never}
      className={className ?? "underline-offset-2 hover:text-race-accent hover:underline"}
    >
      {children ?? label}
    </Link>
  );
}
