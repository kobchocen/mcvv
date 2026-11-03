import type { ReactNode } from "react";

import { CheckCircle2, Clock, FileDown, Lock, XCircle } from "lucide-react";

import { Link, type Locale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { registrationFee, sumPayments } from "@/lib/entries/fee-total";
import { BANK_ACCOUNT, BANK_BIC, BANK_IBAN, spdQrSvg, variableSymbol } from "@/lib/entries/spd";
import { formatDate } from "@/lib/format/date";
import { isReceiptEligible, receiptHref } from "@/lib/receipts/receipt-core";
import type { Slot, SlotType } from "@/lib/slots/core";
import { termEndLabel } from "@/lib/slots/term-end";

/** Překladač jmenného prostoru Entries (getTranslations). */
type Copy = {
  (key: string, values?: Record<string, string | number>): string;
  rich?: (key: string, values: Record<string, (chunks: ReactNode) => ReactNode>) => ReactNode;
};

type Line = {
  runnerId: string;
  entryFee: number | null;
  runner: { name: string };
  club: { name: string };
  category: { name: string; entryFee: number | null };
};

export type MyLockedEntry = {
  year: number;
  id: number;
  status: number | null;
  slot: SlotType | null;
  /** Pozdní přihláška: odeslána (zaplacená pozdní přihláška je zamčená hned, ne až koncem termínu). */
  submittedAt?: Date | null;
  lines: Line[];
  payments: { id: number; date: Date | null; amount: number | null }[];
};

export type MyEntryNavItem = {
  id: number;
  slot: SlotType | null;
  fee: number;
  paid: number;
  /** Lze přihlášku teď měnit z webu? */
  editable: boolean;
  cancelled?: boolean;
};

const PILL =
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold";
const PILL_OK = `${PILL} border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300`;
const PILL_WAIT = `${PILL} border-amber-600/40 bg-amber-600/10 text-amber-800 dark:text-amber-300`;
const PILL_MUTED = `${PILL} border-race-line bg-race-surface text-race-muted`;

export function EntryStatusPills({ item, copy }: { item: MyEntryNavItem; copy: Copy }) {
  if (item.cancelled) {
    return (
      <span className={PILL_MUTED}>
        <XCircle className="size-3.5" aria-hidden="true" />
        {copy("entryPillCancelled")}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {item.fee > 0 && item.paid >= item.fee ? (
        <span className={PILL_OK}>
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          {copy("entryPillPaid")}
        </span>
      ) : item.fee > item.paid ? (
        <span className={PILL_WAIT}>
          <Clock className="size-3.5" aria-hidden="true" />
          {copy("entryPillUnpaid")}
        </span>
      ) : null}
      {item.editable ? null : (
        <span className={PILL_MUTED}>
          <Lock className="size-3.5" aria-hidden="true" />
          {copy("entryPillLocked")}
        </span>
      )}
    </span>
  );
}

/** Přehled přihlášek ročníku (víc přihlášek na jeden e-mail – po jedné na termín). */
export function McvvMyEntriesNav({
  year,
  items,
  copy,
}: {
  year: number;
  items: MyEntryNavItem[];
  copy: Copy;
}) {
  return (
    <nav
      aria-label={copy("myEntriesTitle", { year })}
      className="rounded-[12px] border border-race-line/60 p-4"
    >
      <h2 className="font-display text-lg font-semibold">{copy("myEntriesTitle", { year })}</h2>
      <ul className="mt-3 grid gap-2 text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {item.cancelled ? (
              <span className="text-race-muted">
                {copy("entryHeading", {
                  id: item.id,
                  term: copy("entryTerm", { slot: item.slot ?? "standard" }),
                })}
              </span>
            ) : (
              <a href={`#p${item.id}`} className="font-medium text-race-accent hover:underline">
                {copy("entryHeading", {
                  id: item.id,
                  term: copy("entryTerm", { slot: item.slot ?? "standard" }),
                })}
              </a>
            )}
            <EntryStatusPills item={item} copy={copy} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Nadpis přihlášky „Přihláška č. 318 · standardní“ se stavovými štítky. */
export function EntryHeading({ item, copy }: { item: MyEntryNavItem; copy: Copy }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h2 className="font-display text-2xl font-semibold">
        {copy("entryHeading", {
          id: item.id,
          term: copy("entryTerm", { slot: item.slot ?? "standard" }),
        })}
      </h2>
      <EntryStatusPills item={item} copy={copy} />
    </div>
  );
}

/**
 * Uzavřená přihláška (termín skončil): jen čtení – běžci, platba, storno podmínky a doklad.
 * Úpravy už jen přes zprávu závodní kanceláři.
 */
export async function McvvLockedEntry({
  entry,
  slots,
  locale,
  copy,
}: {
  entry: MyLockedEntry;
  slots: Slot[];
  locale: Locale;
  copy: Copy;
}) {
  const fee = registrationFee(entry.lines);
  const paid = sumPayments(entry.payments);
  const due = fee - paid;
  const slotType = entry.slot ?? "standard";
  const end = termEndLabel(
    slots.find((slot) => slot.type === slotType),
    locale,
  );
  const qr = entry.lines.length > 0 && due > 0 ? await spdQrSvg(entry.year, entry.id, due) : null;
  const receiptReady = isReceiptEligible({
    status: entry.status,
    lineCount: entry.lines.length,
    fee,
    paid,
  });
  return (
    <section id={`p${entry.id}`} className="scroll-mt-28">
      <EntryHeading
        item={{ id: entry.id, slot: entry.slot, fee, paid, editable: false }}
        copy={copy}
      />
      {slotType === "late" && entry.submittedAt ? (
        <div className="mt-3 grid max-w-2xl gap-2 text-sm">
          <p>{copy("latePaidThanks")}</p>
          <p className="rounded-md border border-race-line/60 p-3 leading-6 text-race-muted">
            {copy.rich
              ? copy.rich("latePaidBibPending", {
                  b: (chunks) => <b className="text-foreground dark:text-white">{chunks}</b>,
                })
              : null}
          </p>
        </div>
      ) : (
        <p className="mt-2 max-w-2xl text-sm text-race-muted">
          {end ? copy("entryTermEnded", { slot: slotType, end }) : copy("entryTermEndedNoDate")}
        </p>
      )}

      <ul className="mt-4 grid gap-2 text-sm">
        {entry.lines.map((line) => (
          <li
            key={line.runnerId}
            className="grid gap-1 rounded-[12px] border border-race-line/60 p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-4"
          >
            <span className="font-medium">{line.runner.name}</span>
            <span className="text-race-muted">
              {copy("birthCol")}: {line.runnerId.slice(0, 4)}
            </span>
            <span className="text-race-muted">
              {[line.club.name, line.category.name].filter(Boolean).join(" · ")}
            </span>
            <span>{line.entryFee ?? line.category.entryFee ?? 0} Kč</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-3">
        <p className="text-sm text-race-muted">
          {copy("feeTotal")}: {fee} Kč · {copy("paid")}: {paid} Kč · {copy("due")}:{" "}
          {Math.max(0, due)} Kč
        </p>
        {qr ? (
          <div className="max-w-sm">
            <div
              className="aspect-square max-w-[16rem] bg-white p-2 [&_svg]:h-full [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            <dl className="mt-4 grid gap-1 text-sm">
              <div>
                {copy("account")}: {BANK_ACCOUNT} (Fio)
              </div>
              <div>IBAN: {BANK_IBAN}</div>
              <div>BIC: {BANK_BIC}</div>
              <div>
                {copy("vs")}: {variableSymbol(entry.year, entry.id)}
              </div>
              <div>
                {copy("due")}: {due} Kč
              </div>
            </dl>
          </div>
        ) : null}
        {receiptReady ? (
          <Button asChild variant="outline" className="h-10 w-fit border-race-line bg-race-surface">
            <a href={receiptHref(entry.year, entry.id, locale)} download>
              <FileDown className="size-4" aria-hidden="true" />
              {copy("receiptDownload")}
            </a>
          </Button>
        ) : null}
        {entry.payments.length > 0 ? (
          <ul className="text-sm text-race-muted">
            {entry.payments.map((payment) => (
              <li key={payment.id}>
                {payment.date ? formatDate(payment.date, locale) : "—"} — {payment.amount ?? 0} Kč
              </li>
            ))}
          </ul>
        ) : null}
        <p className="max-w-2xl border-l-2 border-race-line pl-3 text-sm text-race-muted">
          {slotType === "late"
            ? copy("entryLockedStornoLate")
            : copy("entryLockedStorno", { slot: slotType })}{" "}
          {copy("entryLockedFix")}{" "}
          <Link href="/kontakt" className="font-medium text-race-accent hover:underline">
            {copy("entryLockedWrite")}
          </Link>
        </p>
      </div>
    </section>
  );
}
