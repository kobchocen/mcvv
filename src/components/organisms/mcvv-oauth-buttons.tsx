export function McvvOauthButtons({
  locale,
  next,
  google,
  apple,
  copy,
}: {
  locale: string;
  next?: string | null;
  google: boolean;
  apple: boolean;
  copy: { google: string; apple: string };
}) {
  if (!google && !apple) {
    return null;
  }
  const suffix = next ? `&next=${encodeURIComponent(next)}` : "";
  return (
    <div className="mt-4 grid gap-2">
      {google ? (
        <a
          href={`/api/auth/google?locale=${locale}${suffix}`}
          className="inline-flex h-11 items-center justify-center border border-race-line bg-race-surface font-display text-sm font-semibold hover:bg-race-forest-2"
        >
          {copy.google}
        </a>
      ) : null}
      {apple ? (
        <a
          href={`/api/auth/apple?locale=${locale}${suffix}`}
          className="inline-flex h-11 items-center justify-center border border-race-line bg-race-surface font-display text-sm font-semibold hover:bg-race-forest-2"
        >
          {copy.apple}
        </a>
      ) : null}
    </div>
  );
}
