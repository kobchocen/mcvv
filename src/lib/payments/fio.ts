/**
 * Fio API (read-only token). Limit: 1 požadavek / 30 s na token (jinak HTTP 409).
 * Token je součástí URL → URL se nikdy neloguje a z chybových hlášek se token odstraňuje.
 */

export const FIO_BASE = "https://fioapi.fio.cz/v1/rest";
/** Fio bez silné autorizace vydá historii max. 90 dní zpět. */
export const FIO_MAX_HISTORY_DAYS = 89;
export const FIO_MIN_INTERVAL_MS = 31_000;

export type FioTransaction = {
  fioId: bigint;
  /** YYYY-MM-DD (den zaúčtování dle Fio). */
  date: string;
  amount: number;
  currency: string;
  vs: string | null;
  counterAccount: string | null;
  counterName: string | null;
  message: string | null;
  raw: unknown;
};

export type FioRequest = { mode: "periods"; from: string; to: string } | { mode: "last" };

export type FioResult =
  | { ok: true; transactions: FioTransaction[]; lastId: bigint | null }
  | { ok: false; kind: FioErrorKind; error: string };

/**
 * `strong_auth` = HTTP 422 „Data není možné poskytnout bez silné autorizace“ – serverová
 * zarážka /last/ je nenastavená nebo starší než 90 dní. Řeší se přes set-last-date.
 */
export type FioErrorKind = "rate_limit" | "auth" | "strong_auth" | "error";

type Column = { value: string | number | null } | null | undefined;
type RawTx = Record<string, Column>;

function col(tx: RawTx, n: number): string | number | null {
  return tx[`column${n}`]?.value ?? null;
}

function str(value: string | number | null): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

export function fioUrl(token: string, request: FioRequest): string {
  const t = encodeURIComponent(token);
  return request.mode === "last"
    ? `${FIO_BASE}/last/${t}/transactions.json`
    : `${FIO_BASE}/periods/${t}/${request.from}/${request.to}/transactions.json`;
}

export function setLastDateUrl(token: string, date: string): string {
  return `${FIO_BASE}/set-last-date/${encodeURIComponent(token)}/${date}/`;
}

export function redact(text: string, token: string | undefined): string {
  if (!token) return text;
  return text.split(token).join("***").split(encodeURIComponent(token)).join("***");
}

/**
 * Řádek do konzole (Azure Log Analytics) pro neúspěšné stažení z Fio (#199). Alert e-mailem
 * jde max. 1× denně na druh, log u každého selhání. Token se pro jistotu maskuje i tady.
 */
export function fioFailureLogLine(
  failure: { kind: FioErrorKind; error: string },
  mode: FioRequest["mode"],
  token: string | undefined,
): string {
  return redact(
    `[payments] Fio fetch failed ${JSON.stringify({
      job: "payments",
      kind: failure.kind,
      mode,
      error: failure.error.slice(0, 300),
    })}`,
    token,
  );
}

export function parseFioStatement(json: unknown): {
  transactions: FioTransaction[];
  lastId: bigint | null;
} {
  const statement = (json as { accountStatement?: Record<string, unknown> })?.accountStatement;
  if (!statement) throw new Error("Neočekávaná odpověď Fio (chybí accountStatement)");
  const info = (statement.info ?? {}) as { idLastDownload?: number | null; idTo?: number | null };
  const list = (statement.transactionList as { transaction?: RawTx[] } | null)?.transaction ?? [];
  const transactions = list.map((tx): FioTransaction => {
    const id = col(tx, 22);
    if (id === null) throw new Error("Pohyb bez ID");
    return {
      fioId: BigInt(id),
      date: String(col(tx, 0) ?? "").slice(0, 10),
      amount: Number(col(tx, 1) ?? 0),
      currency: str(col(tx, 14)) ?? "",
      vs: str(col(tx, 5)),
      counterAccount: [str(col(tx, 2)), str(col(tx, 3))].filter(Boolean).join("/") || null,
      counterName: str(col(tx, 10)),
      message: str(col(tx, 16)) ?? str(col(tx, 7)),
      raw: tx,
    };
  });
  const last = info.idTo ?? info.idLastDownload ?? null;
  return { transactions, lastId: last === null ? null : BigInt(last) };
}

export async function fetchFio(
  token: string,
  request: FioRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<FioResult> {
  try {
    const response = await fetchImpl(fioUrl(token, request), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(60_000),
    });
    if (response.status === 409) {
      return { ok: false, kind: "rate_limit", error: "Fio 409 – limit 1 dotaz / 30 s" };
    }
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        kind: "auth",
        error: `Fio ${response.status} – token neplatný nebo expirovaný`,
      };
    }
    if (!response.ok) {
      const body = redact((await response.text()).slice(0, 200), token);
      if (response.status === 422 && (request.mode === "last" || /autorizac/i.test(body))) {
        return { ok: false, kind: "strong_auth", error: `Fio 422: ${body}` };
      }
      // Fio vrací pro neplatný/expirovaný token i 500 s textem o tokenu.
      const kind = /token/i.test(body) ? "auth" : "error";
      return { ok: false, kind, error: `Fio ${response.status}: ${body}` };
    }
    return { ok: true, ...parseFioStatement(await response.json()) };
  } catch (error) {
    return {
      ok: false,
      kind: "error",
      error: redact(`Fio: ${String(error).slice(0, 200)}`, token),
    };
  }
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Období posledních `days` dní (oříznuto na limit Fio). */
export function periodsWindow(now: Date, days: number): { from: string; to: string } {
  const span = Math.min(days, FIO_MAX_HISTORY_DAYS);
  return { from: isoDate(new Date(now.getTime() - span * 86_400_000)), to: isoDate(now) };
}

/**
 * Výběr dotazu. `last` (serverová zarážka Fio) jen v režimu "last" a když předchozí běh
 * doběhl v pořádku a dnes už proběhla kontrolní `periods` (7 dní) – jinak `periods`,
 * které je idempotentní (unikátní fio_id) a dožene případný výpadek.
 */
export function chooseRequest(input: {
  mode: "last" | "periods";
  now: Date;
  lastRunOk: boolean;
  lastPeriodsDay: string | null;
  catchUpDays?: number;
}): FioRequest {
  const window = periodsWindow(input.now, input.catchUpDays ?? 7);
  if (input.mode === "periods") return { mode: "periods", ...window };
  if (!input.lastRunOk || input.lastPeriodsDay !== isoDate(input.now)) {
    return { mode: "periods", ...window };
  }
  return { mode: "last" };
}

/** Nastaví serverovou zarážku Fio pro /last/ na daný den (YYYY-MM-DD). */
export async function setFioLastDate(
  token: string,
  date: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; kind: FioErrorKind; error: string }> {
  try {
    const response = await fetchImpl(setLastDateUrl(token, date), {
      signal: AbortSignal.timeout(60_000),
    });
    if (response.ok) return { ok: true };
    const body = redact((await response.text()).slice(0, 200), token);
    const kind =
      response.status === 409
        ? "rate_limit"
        : response.status === 401 || response.status === 403
          ? "auth"
          : "error";
    return { ok: false, kind, error: `Fio set-last-date ${response.status}: ${body}` };
  } catch (error) {
    return {
      ok: false,
      kind: "error",
      error: redact(`Fio set-last-date: ${String(error).slice(0, 200)}`, token),
    };
  }
}

export type StrongAuthHealResult =
  /** Zarážka nastavena a hned staženo `periods` za stejné okno. */
  | { status: "healed"; request: FioRequest; result: FioResult }
  /** Zarážka nastavena, na opakování v tomto běhu nezbývá čas (limit 30 s) → příští běh. */
  | { status: "cursor_set"; date: string }
  /** set-last-date selhalo → alert jako dřív. */
  | { status: "failed"; error: string };

const sleepReal = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Samooprava po 422 (silná autorizace) z /last/: počká na limit Fio, nastaví zarážku na
 * `now - catchUpDays` a – pokud to časový rozpočet běhu dovolí – po dalším intervalu stáhne
 * `periods` za totéž okno. Mezi dotazy vždy dodrží FIO_MIN_INTERVAL_MS.
 */
export async function healStrongAuth(input: {
  token: string;
  now: Date;
  catchUpDays?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Kolik ms smí běh celkem čekat kvůli limitu Fio (default 75 s, cron má maxDuration 120 s). */
  waitBudgetMs?: number;
  /** Volá se těsně před každým dotazem na Fio (pro uložení času posledního dotazu). */
  onRequest?: (at: Date) => Promise<void> | void;
}): Promise<StrongAuthHealResult> {
  const sleep = input.sleep ?? sleepReal;
  const fetchImpl = input.fetchImpl ?? fetch;
  const budget = input.waitBudgetMs ?? 75_000;
  const window = periodsWindow(input.now, input.catchUpDays ?? 7);
  let waited = 0;
  if (budget < FIO_MIN_INTERVAL_MS) {
    return { status: "failed", error: "Fio 422: nedostatek času na set-last-date v tomto běhu" };
  }
  await sleep(FIO_MIN_INTERVAL_MS);
  waited += FIO_MIN_INTERVAL_MS;
  await input.onRequest?.(new Date(input.now.getTime() + waited));
  const set = await setFioLastDate(input.token, window.from, fetchImpl);
  if (!set.ok) return { status: "failed", error: set.error };
  if (waited + FIO_MIN_INTERVAL_MS > budget) return { status: "cursor_set", date: window.from };
  await sleep(FIO_MIN_INTERVAL_MS);
  waited += FIO_MIN_INTERVAL_MS;
  await input.onRequest?.(new Date(input.now.getTime() + waited));
  const request: FioRequest = { mode: "periods", ...window };
  return { status: "healed", request, result: await fetchFio(input.token, request, fetchImpl) };
}
