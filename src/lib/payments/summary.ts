import { escapeHtml } from "@/lib/mail/layout";

import { REASON_LABELS, type MatchReason } from "./match";

export type SummaryRow = {
  date: string;
  amount: number;
  vs: string | null;
  counterName: string | null;
  reason: string | null;
  registrationId: number | null;
  overpaid: number;
  status: "unmatched" | "matched";
};

/** Pražský kalendářní den (YYYY-MM-DD) a hodina. */
export function pragueClock(now: Date): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/** Souhrn se posílá jednou denně od 7:00 (Praha), jen když je co hlásit. */
export function summaryDue(now: Date, rows: number): boolean {
  return rows > 0 && pragueClock(now).hour >= 7;
}

export function renderDailySummary(input: {
  rows: SummaryRow[];
  openUnmatched: number;
  adminUrl: string;
}) {
  const unmatched = input.rows.filter((r) => r.status === "unmatched");
  const overpaid = input.rows.filter((r) => r.status === "matched" && r.overpaid > 0);
  const label = (r: SummaryRow) =>
    r.reason ? (REASON_LABELS[r.reason as MatchReason | "interrupted"] ?? r.reason) : "";
  const line = (r: SummaryRow) =>
    `${r.date}  ${r.amount} Kč  VS ${r.vs ?? "-"}  ${r.counterName ?? ""}${r.status === "unmatched" ? `  – ${label(r)}` : `  – přihláška ${r.registrationId}, přeplatek ${r.overpaid} Kč`}`;
  const text = [
    `Nové nespárované platby: ${unmatched.length} (celkem otevřených: ${input.openUnmatched})`,
    ...unmatched.map(line),
    "",
    `Nové přeplatky k vrácení po závodě: ${overpaid.length}`,
    ...overpaid.map(line),
    "",
    `Vyřešit v administraci: ${input.adminUrl}`,
  ].join("\n");
  const list = (rows: SummaryRow[]) =>
    rows.length
      ? `<ul>${rows.map((r) => `<li>${escapeHtml(line(r))}</li>`).join("")}</ul>`
      : "<p>–</p>";
  const html = `<p><strong>Nové nespárované platby: ${unmatched.length}</strong> (celkem otevřených: ${input.openUnmatched})</p>${list(unmatched)}<p><strong>Nové přeplatky k vrácení po závodě: ${overpaid.length}</strong></p>${list(overpaid)}<p><a href="${escapeHtml(input.adminUrl)}">Vyřešit v administraci</a></p>`;
  return {
    subject: `MCVV platby: ${unmatched.length} nespárovaných, ${overpaid.length} přeplatků`,
    text,
    html,
  };
}
