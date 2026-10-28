/**
 * E-mail uživateli o změně role (#191) – čisté funkce (bez DB, sítě a Next.js), testovatelné.
 * Texty jsou v `RoleChangeMail` (cs/en), šablona je stejná jako u ostatních transakčních
 * e-mailů (`renderTransactionalEmail`). Odeslání nesmí změnu role zablokovat: chyby se jen
 * vrátí jako výsledek „failed“.
 */
import { renderTransactionalEmail } from "@/lib/mail/layout";
import type { UserRole } from "@/lib/auth/roles";

export type RoleChangeMailOutcome = "sent" | "queued" | "failed" | "skipped";

export const ROLE_CHANGE_MAIL_OUTCOMES: readonly RoleChangeMailOutcome[] = [
  "sent",
  "queued",
  "failed",
  "skipped",
];

export function isRoleChangeMailOutcome(value: unknown): value is RoleChangeMailOutcome {
  return (
    typeof value === "string" && (ROLE_CHANGE_MAIL_OUTCOMES as readonly string[]).includes(value)
  );
}

/** Klíče překladů v namespace `RoleChangeMail`. */
export type RoleChangeMailKey =
  | "subject"
  | "greeting"
  | "changed"
  | "effect"
  | "after"
  | `role_${UserRole}`
  | `about_${UserRole}`
  | `action_${UserRole}`;

export type RoleChangeMailTranslate = (
  key: RoleChangeMailKey,
  values?: Record<string, string>,
) => string;

/** Sekce webu, kterou nová role otevírá (bez locale). */
export function roleHomePath(role: UserRole): string {
  switch (role) {
    case "admin":
    case "organizer":
      return "/admin";
    case "timing":
      return "/admin/den-zavodu";
    case "splitmaker":
      return "/mezicasy";
    case "race_office":
      return "/kancelar";
    default:
      return "/prihlasky";
  }
}

export function roleChangeMailUrl(site: string, locale: string, role: UserRole): string {
  const lang = locale === "en" ? "en" : "cs";
  return `${site.replace(/\/$/, "")}/${lang}${roleHomePath(role)}`;
}

export type RoleChange = {
  email: string;
  name: string;
  from: UserRole;
  to: UserRole;
};

/** E-mail jen při skutečné změně role. */
export function shouldSendRoleChangeMail(change: Pick<RoleChange, "from" | "to">): boolean {
  return change.from !== change.to;
}

export function renderRoleChangeMail(input: {
  change: RoleChange;
  locale: string;
  site: string;
  t: RoleChangeMailTranslate;
}): { subject: string; html: string; text: string } {
  const { change, t } = input;
  const locale = input.locale === "en" ? "en" : "cs";
  const from = t(`role_${change.from}`);
  const to = t(`role_${change.to}`);
  const subject = t("subject", { role: to }).slice(0, 300);
  const name = change.name.trim();
  const { html, text } = renderTransactionalEmail({
    subject,
    locale,
    site: input.site,
    paragraphs: [
      t("greeting", { name: name || change.email }),
      t("changed", { email: change.email, from, to }),
      t(`about_${change.to}`),
      t("effect"),
    ],
    action: {
      label: t(`action_${change.to}`),
      url: roleChangeMailUrl(input.site, locale, change.to),
    },
    after: [t("after")],
  });
  return { subject, html, text };
}

export type RoleChangeMailDeps = {
  /** Přeloží texty pro daný jazyk. */
  translator: (locale: string) => Promise<RoleChangeMailTranslate>;
  /** Zařadí e-mail do fronty a zkusí ho odeslat (respektuje denní limit). */
  send: (mail: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }) => Promise<"sent" | "queued" | "failed">;
  site: string;
  /** Mimo produkci: e-mail jde místo uživatele na tuto adresu (STG má kopii reálných e-mailů). */
  redirectTo?: string | null;
  onError?: (error: unknown) => void;
};

/**
 * Vyrenderuje a odešle e-mail o změně role. Nikdy nevyhazuje: chyba → „failed“,
 * beze změny role → „skipped“.
 */
export async function deliverRoleChangeMail(
  change: RoleChange,
  locale: string,
  deps: RoleChangeMailDeps,
): Promise<RoleChangeMailOutcome> {
  if (!shouldSendRoleChangeMail(change) || !change.email.trim()) return "skipped";
  try {
    const t = await deps.translator(locale);
    const mail = renderRoleChangeMail({ change, locale, site: deps.site, t });
    const redirected = Boolean(deps.redirectTo);
    return await deps.send({
      ...mail,
      to: redirected ? deps.redirectTo! : change.email,
      subject: redirected
        ? `[TEST – pro ${change.email.replace(/@.*/, "@…")}] ${mail.subject}`.slice(0, 300)
        : mail.subject,
    });
  } catch (error) {
    deps.onError?.(error);
    return "failed";
  }
}
