import Link from "next/link";

/** HTTP 403 – účet je přihlášený, ale jeho role na tuto stránku nebo akci nemá oprávnění. */
export default function Forbidden() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center gap-4 px-6 py-16">
      <p className="font-display text-sm font-semibold uppercase tracking-wide text-race-muted">
        403
      </p>
      <h1 className="font-display text-3xl font-bold">Přístup odepřen</h1>
      <p className="text-base leading-7 text-race-muted">
        Vaše role na tuto část administrace nemá oprávnění. / Your role is not allowed to open this
        part of the administration.
      </p>
      <p className="flex flex-wrap gap-4 text-sm font-medium">
        <Link href="/cs/admin/den-zavodu" className="text-race-accent hover:underline">
          Den závodu
        </Link>
        <Link href="/cs" className="text-race-accent hover:underline">
          Úvodní stránka
        </Link>
      </p>
    </main>
  );
}
