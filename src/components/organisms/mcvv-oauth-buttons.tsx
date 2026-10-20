function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5 shrink-0">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

export function McvvOauthButtons({
  locale,
  next,
  google,
  apple,
  copy,
  prominent = false,
}: {
  locale: string;
  next?: string | null;
  google: boolean;
  apple: boolean;
  copy: { google: string; apple: string; googleHint?: string };
  /** Login page: Google first and large (most runners have Gmail and skip the password). */
  prominent?: boolean;
}) {
  if (!google && !apple) {
    return null;
  }
  const suffix = next ? `&next=${encodeURIComponent(next)}` : "";
  const base =
    "inline-flex items-center justify-center border border-race-line bg-race-surface font-display text-sm font-semibold hover:bg-race-forest-2";
  return (
    <div className={prominent ? "grid gap-2" : "mt-4 grid gap-2"}>
      {google ? (
        <a
          href={`/api/auth/google?locale=${locale}${suffix}`}
          className={
            prominent
              ? "inline-flex h-12 items-center justify-center gap-3 rounded-md border border-neutral-300 bg-white px-4 font-display text-base font-semibold text-neutral-900 shadow-sm transition hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-race-accent"
              : `${base} h-11`
          }
        >
          {prominent ? <GoogleMark /> : null}
          {copy.google}
        </a>
      ) : null}
      {prominent && google && copy.googleHint ? (
        <p className="text-center text-xs text-race-muted">{copy.googleHint}</p>
      ) : null}
      {apple ? (
        <a href={`/api/auth/apple?locale=${locale}${suffix}`} className={`${base} h-11`}>
          {copy.apple}
        </a>
      ) : null}
    </div>
  );
}
