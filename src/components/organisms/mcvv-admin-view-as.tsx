import { VIEW_AS_ROUTE } from "@/lib/admin/view-as-core";

type RoleOption = Readonly<{ value: string; label: string }>;

/**
 * Pruh náhledu „Náhled jako …“ nad administrací (jen během náhledu). Ukončení je obyčejný
 * POST na `/api/admin/view-as` – jediný zápis, který proxy v náhledu pustí.
 */
export function McvvAdminViewAsBar({
  locale,
  title,
  readOnly,
  stop,
}: Readonly<{ locale: string; title: string; readOnly: string; stop: string }>) {
  return (
    <div
      role="status"
      data-testid="view-as-bar"
      className="sticky top-0 z-30 border-b-2 border-amber-500 bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100 print:hidden"
    >
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm">
        <p className="font-semibold">{title}</p>
        <p>{readOnly}</p>
        <form method="post" action={VIEW_AS_ROUTE} className="ml-auto">
          <input type="hidden" name="intent" value="stop" />
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            className="h-9 border border-amber-700 bg-white px-3 font-semibold text-amber-950 hover:bg-amber-50 dark:bg-amber-900 dark:text-amber-50"
          >
            {stop}
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Plovoucí pruh náhledu mimo administraci (`/resultboard`, `/prihlasky` – kam náhled role bez
 * rozcestníku přesměruje). `position: fixed` vlevo dole, takže nemění rozvržení stránky ani TV;
 * na tisk se neukáže. Zobrazuje se jen během aktivního náhledu admina (viz `viewAsBarCopy`).
 */
export function McvvViewAsFloatingBar({
  locale,
  title,
  readOnly,
  stop,
}: Readonly<{ locale: string; title: string; readOnly: string; stop: string }>) {
  return (
    <div
      role="status"
      data-testid="view-as-floating"
      className="fixed bottom-3 left-3 z-[100] max-w-[calc(100vw-1.5rem)] border-2 border-amber-500 bg-amber-100 text-amber-950 shadow-lg dark:bg-amber-950 dark:text-amber-100 print:hidden"
    >
      <div className="flex items-center gap-3 px-3 py-2 text-sm">
        <p className="min-w-0">
          <span className="block font-semibold">{title}</span>
          <span className="block text-xs opacity-80">{readOnly}</span>
        </p>
        <form method="post" action={VIEW_AS_ROUTE} className="shrink-0">
          <input type="hidden" name="intent" value="stop" />
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            className="h-9 border border-amber-700 bg-white px-3 font-semibold text-amber-950 hover:bg-amber-50 dark:bg-amber-900 dark:text-amber-50"
          >
            {stop}
          </button>
        </form>
      </div>
    </div>
  );
}

/** Výběr rolí pro náhled (stránka Uživatelé, jen admin mimo náhled). */
export function McvvAdminViewAsForm({
  locale,
  roles,
  copy,
  empty,
}: Readonly<{
  locale: string;
  roles: readonly RoleOption[];
  copy: Readonly<{ title: string; intro: string; mode: string; submit: string; empty: string }>;
  empty: boolean;
}>) {
  return (
    <section
      id="nahled"
      data-testid="view-as-form"
      className="mt-8 scroll-mt-16 border border-race-line/60 bg-race-surface/40 p-4"
    >
      <h2 className="font-display text-lg font-semibold">{copy.title}</h2>
      <p className="mt-1 max-w-3xl text-sm text-race-muted">{copy.intro}</p>
      <p className="mt-1 text-xs text-race-muted">{copy.mode}</p>
      {empty ? (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {copy.empty}
        </p>
      ) : null}
      <form method="post" action={VIEW_AS_ROUTE} className="mt-3 grid gap-3">
        <input type="hidden" name="intent" value="start" />
        <input type="hidden" name="locale" value={locale} />
        <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
          {roles.map((role) => (
            <label key={role.value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="role" value={role.value} className="size-4" />
              {role.label}
            </label>
          ))}
        </fieldset>
        <button
          type="submit"
          className="h-10 w-fit bg-race-accent-solid px-4 font-display font-semibold text-white hover:bg-race-accent-solid-hover"
        >
          {copy.submit}
        </button>
      </form>
    </section>
  );
}
