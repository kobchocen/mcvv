import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { requireStaff } from "@/lib/admin/staff";
import { prisma } from "@/lib/db/client";
import { McvvAdminHomeLink } from "@/components/organisms";
import { Button } from "@/components/ui/button";
import { Link, type Locale } from "@/i18n/routing";

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export const metadata: Metadata = { title: "Newsletter" };

const STATUS_LABELS: Record<string, string> = {
  draft: "Koncept",
  test_sent: "Test odeslán",
  sending: "Odesílá se",
  sent: "Odesláno",
};

export default async function AdminNewsletterPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  await requireStaff();
  const rows = await prisma.newsletterCampaign.findMany({
    orderBy: { id: "desc" },
    include: { createdBy: { select: { name: true } }, _count: { select: { recipients: true } } },
  });
  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <McvvAdminHomeLink label="Administrace" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
            Newsletter
          </h1>
          <Button
            asChild
            className="h-10 bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
          >
            <Link href="/admin/newsletter/novy">Nová kampaň</Link>
          </Button>
        </div>
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                <th className="py-2 pr-4">Předmět</th>
                <th className="py-2 pr-4">Stav</th>
                <th className="py-2 pr-4">Příjemci</th>
                <th className="py-2 pr-4">Autor</th>
                <th className="py-2 pr-4">Vytvořeno</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-race-muted">
                    Zatím žádná kampaň.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-race-line/40">
                  <td className="py-2.5 pr-4 font-medium">
                    <Link
                      href={{ pathname: "/admin/newsletter/[id]", params: { id: String(row.id) } }}
                      className="text-race-accent hover:underline"
                    >
                      {row.subject}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4">{STATUS_LABELS[row.status]}</td>
                  <td className="py-2.5 pr-4">{row._count.recipients || "—"}</td>
                  <td className="py-2.5 pr-4">{row.createdBy?.name ?? "—"}</td>
                  <td className="py-2.5 pr-4">{row.createdAt.toLocaleString("cs-CZ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
