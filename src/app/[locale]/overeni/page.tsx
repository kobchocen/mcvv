import { redirect } from "next/navigation";
import { siteLocale } from "@/lib/i18n/locale";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}>;

// Legacy link format (/{locale}/overeni?token=…) — verification itself runs in
// the route handler, which can set the session cookie.
export default async function VerifyPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { token } = await searchParams;
  const query = new URLSearchParams({ locale: siteLocale(locale) });
  if (token) {
    query.set("token", token);
  }
  redirect(`/api/auth/verify?${query.toString()}`);
}

export const dynamic = "force-dynamic";
