import { Link } from "@/i18n/routing";

export function McvvAdminHomeLink({ label }: { label: string }) {
  return (
    <p className="mb-4">
      <Link href="/admin" className="text-sm font-medium text-race-accent hover:underline">
        {label}
      </Link>
    </p>
  );
}
