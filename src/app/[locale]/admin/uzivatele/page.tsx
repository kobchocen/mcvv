import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { McvvAdminRoleForm } from "@/components/organisms/mcvv-admin-role-form";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/staff";
import { isUserRole, USER_ROLES, type UserRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/client";
import { formatDate } from "@/lib/format/date";
import { Link, type Locale } from "@/i18n/routing";

const PAGE_SIZE = 50;

type SearchParams = {
  role?: string;
  overeno?: string;
  q?: string;
  strana?: string;
  saved?: string;
  error?: string;
};

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "AdminUsers" });
  return { title: t("title") };
}

function roleKey(role: UserRole) {
  return `role_${role}` as const;
}

export default async function AdminUsersPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const actor = await requireAdmin();
  const copy = await getTranslations({ locale, namespace: "AdminUsers" });
  const admin = await getTranslations({ locale, namespace: "Admin" });
  const sp = await searchParams;

  const roleFilter = isUserRole(sp.role) ? sp.role : undefined;
  const verifiedFilter = sp.overeno === "ano" || sp.overeno === "ne" ? sp.overeno : undefined;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Number.parseInt(sp.strana ?? "", 10) || 1);

  const where: Prisma.UserWhereInput = {
    ...(roleFilter ? { role: roleFilter } : {}),
    ...(verifiedFilter === "ano" ? { emailVerified: { not: null } } : {}),
    ...(verifiedFilter === "ne" ? { emailVerified: null } : {}),
    ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}),
  };

  const [total, users, roleCounts, audit] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        clubName: true,
        role: true,
        emailVerified: true,
        createdAt: true,
      },
    }),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
    prisma.auditLog.findMany({
      where: { action: "user.role_change" },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const emails = users.map((user) => user.email);
  const registrationCounts = emails.length
    ? await prisma.registration.groupBy({
        by: ["email"],
        where: { email: { in: emails } },
        _count: { _all: true },
      })
    : [];
  const countByEmail = new Map<string, number>();
  for (const row of registrationCounts) {
    const key = (row.email ?? "").toLowerCase();
    countByEmail.set(key, (countByEmail.get(key) ?? 0) + row._count._all);
  }
  const roles = USER_ROLES.map((role) => ({ value: role, label: copy(roleKey(role)) }));
  const roleLabel = (role: string) => (isUserRole(role) ? copy(roleKey(role)) : role);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filterQuery: Record<string, string> = {
    ...(roleFilter ? { role: roleFilter } : {}),
    ...(verifiedFilter ? { overeno: verifiedFilter } : {}),
    ...(q ? { q } : {}),
  };
  const back = new URLSearchParams({
    ...filterQuery,
    ...(page > 1 ? { strana: String(page) } : {}),
  }).toString();
  const savedId = Number.parseInt(sp.saved ?? "", 10);
  const errorKey =
    sp.error &&
    ["invalid_role", "same_role", "self_change", "last_admin", "unverified", "not_found"].includes(
      sp.error,
    )
      ? (`error_${sp.error}` as const)
      : null;

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <McvvAdminHomeLink label={admin("title")} />
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("title")}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-race-muted">{copy("intro")}</p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-race-muted">
          {USER_ROLES.map((role) => (
            <span key={role}>
              {roleLabel(role)}:{" "}
              <strong className="text-foreground dark:text-white">
                {roleCounts.find((row) => row.role === role)?._count._all ?? 0}
              </strong>
            </span>
          ))}
        </p>

        {errorKey ? (
          <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
            {copy(errorKey)}
          </p>
        ) : Number.isFinite(savedId) ? (
          <p role="status" className="mt-4 text-sm text-race-accent">
            {copy("saved")}
          </p>
        ) : null}

        <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
          <label className="grid gap-1 text-sm">
            <span className="text-race-muted">{copy("filterRole")}</span>
            <select
              name="role"
              defaultValue={roleFilter ?? ""}
              className="h-10 border border-race-line bg-race-surface px-2"
            >
              <option value="">{copy("all")}</option>
              {roles.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-race-muted">{copy("filterVerified")}</span>
            <select
              name="overeno"
              defaultValue={verifiedFilter ?? ""}
              className="h-10 border border-race-line bg-race-surface px-2"
            >
              <option value="">{copy("all")}</option>
              <option value="ano">{copy("verifiedYes")}</option>
              <option value="ne">{copy("verifiedNo")}</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-race-muted">{copy("search")}</span>
            <input
              name="q"
              defaultValue={q}
              maxLength={80}
              className="h-10 w-64 border border-race-line bg-race-surface px-2"
            />
          </label>
          <Button type="submit" variant="outline" className="h-10 border-race-line bg-race-surface">
            {copy("filter")}
          </Button>
        </form>

        <p className="mt-4 text-sm text-race-muted">{copy("total", { count: total })}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[60rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                <th className="py-2 pr-3">{copy("colName")}</th>
                <th className="py-2 pr-3">{copy("colEmail")}</th>
                <th className="py-2 pr-3">{copy("colClub")}</th>
                <th className="py-2 pr-3">{copy("colVerified")}</th>
                <th className="py-2 pr-3">{copy("colCreated")}</th>
                <th className="py-2 pr-3">{copy("colRegistrations")}</th>
                <th className="py-2">{copy("colRole")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className={
                    user.id === savedId
                      ? "border-b border-race-line/40 bg-race-accent/10"
                      : "border-b border-race-line/40"
                  }
                  data-testid={`user-row-${user.id}`}
                >
                  <td className="py-2.5 pr-3 font-medium">{user.name}</td>
                  <td className="py-2.5 pr-3">{user.email}</td>
                  <td className="py-2.5 pr-3">{user.clubName ?? ""}</td>
                  <td className="py-2.5 pr-3">
                    {user.emailVerified ? copy("verifiedYes") : copy("verifiedNo")}
                  </td>
                  <td className="py-2.5 pr-3">{formatDate(user.createdAt, locale)}</td>
                  <td className="py-2.5 pr-3">{countByEmail.get(user.email.toLowerCase()) ?? 0}</td>
                  <td className="py-2">
                    {user.id === actor.id ? (
                      <span title={copy("selfHint")}>
                        {roleLabel(user.role)} ({copy("you")})
                      </span>
                    ) : (
                      <McvvAdminRoleForm
                        userId={user.id}
                        userName={user.name}
                        currentRole={user.role}
                        roles={roles}
                        confirmTemplate={copy.raw("confirm") as string}
                        submitLabel={copy("change")}
                        selectLabel={copy("colRole")}
                        back={back}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 ? (
          <p className="mt-4 flex flex-wrap gap-3 text-sm">
            {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
              <Link
                key={number}
                href={{
                  pathname: "/admin/uzivatele",
                  query: { ...filterQuery, strana: String(number) },
                }}
                className={
                  number === page
                    ? "font-semibold text-race-accent"
                    : "text-race-muted hover:text-foreground"
                }
              >
                {number}
              </Link>
            ))}
          </p>
        ) : null}

        <section className="mt-12">
          <h2 className="font-display text-xl font-semibold">{copy("auditTitle")}</h2>
          {audit.length === 0 ? (
            <p className="mt-2 text-sm text-race-muted">{copy("auditEmpty")}</p>
          ) : (
            <ul className="mt-3 grid gap-1 text-sm">
              {audit.map((entry) => {
                const detail = (entry.detail ?? {}) as {
                  email?: string;
                  from?: string;
                  to?: string;
                };
                return (
                  <li key={entry.id} className="text-race-muted">
                    {new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "cs-CZ", {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone: "Europe/Prague",
                    }).format(entry.createdAt)}{" "}
                    –{" "}
                    {copy("auditLine", {
                      actor: entry.actorEmail,
                      email: detail.email ?? entry.target ?? "",
                      from: roleLabel(detail.from ?? ""),
                      to: roleLabel(detail.to ?? ""),
                    })}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
