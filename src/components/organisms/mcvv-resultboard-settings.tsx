"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/routing";
import { saveResultboardAction } from "@/lib/live/resultboard-actions";
import {
  RESULTBOARD_AUTO_COLUMNS,
  RESULTBOARD_COLUMNS,
  RESULTBOARD_MAX_MONITORS,
  DEFAULT_MONITOR_NAMES,
  autoAssign,
  defaultMonitorFor,
  layoutColumns,
  monitorOf,
  orderedCategories,
  type ResultboardConfig,
} from "@/lib/live/resultboard-core";
import type { PointKey } from "@/lib/live/speaker-core";

export type SettingsCategory = { id: string; name: string; entries: number };

type Props = Readonly<{
  initial: ResultboardConfig;
  categories: SettingsCategory[];
  partners: { id: number; name: string }[];
}>;

const seg =
  "h-8 min-w-10 rounded-md border border-race-line px-2 text-sm font-medium transition-colors";
const segOn = "border-race-accent bg-race-accent text-white";
const small = "text-xs text-race-muted";
const field = "grid gap-1 text-sm";

/**
 * Nastavení resultboardu na `/admin/den-zavodu/zive` (Q143, mockup „nastaveni“): počet TV,
 * názvy, sloupce, přiřazení a pořadí kategorií (i „Rozdělit automaticky“), zobrazení,
 * upozornění „nový lídr“ a partneři. Uloží se celé jako JSON (server ho znovu ověří).
 */
export function McvvResultboardSettings({ initial, categories, partners }: Props) {
  const t = useTranslations("ResultboardSettings");
  const [cfg, setCfg] = useState<ResultboardConfig>(() => {
    // výchozí rozdělení se zapíše explicitně, ať je v tabulce vidět
    const assign = { ...initial.assign };
    for (const c of categories) assign[c.id] ??= monitorOf(initial, c);
    return {
      ...initial,
      assign,
      order: orderedCategories(categories, initial.order).map((c) => c.id),
    };
  });
  const n = cfg.monitors.length;
  const ordered = useMemo(() => orderedCategories(categories, cfg.order), [categories, cfg.order]);
  const entries = (c: { id: string }) => categories.find((x) => x.id === c.id)?.entries ?? 0;
  const set = (patch: Partial<ResultboardConfig>) => setCfg((c) => ({ ...c, ...patch }));

  const setMonitors = (count: number) =>
    setCfg((c) => {
      const monitors = Array.from(
        { length: count },
        (_, i) => c.monitors[i] ?? { name: DEFAULT_MONITOR_NAMES[i], columns: null },
      );
      const assign = Object.fromEntries(
        Object.entries(c.assign).map(([id, tv]) => [id, tv > count ? (tv ? 1 : 0) : tv]),
      );
      return { ...c, monitors, assign };
    });
  const move = (id: string, dir: -1 | 1) =>
    setCfg((c) => {
      const order = ordered.map((x) => x.id);
      const i = order.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= order.length) return c;
      [order[i], order[j]] = [order[j], order[i]];
      return { ...c, order };
    });
  const hidden = new Set(ordered.filter((c) => cfg.assign[c.id] === 0).map((c) => c.id));
  const tvOf = (id: string) => {
    const tv = cfg.assign[id] ?? 1;
    return tv > n ? 1 : tv;
  };
  const togglePoint = (k: PointKey) =>
    setCfg((c) => {
      const has = c.leader.points.includes(k);
      const points = (["m1", "m2", "fin"] as const).filter((p) =>
        p === k ? !has : c.leader.points.includes(p),
      );
      return { ...c, leader: { ...c.leader, points } };
    });

  const perTv = Array.from({ length: n }, (_, i) => {
    const list = ordered.filter((c) => tvOf(c.id) === i + 1);
    return { list, runners: list.reduce((sum, c) => sum + c.entries, 0) };
  });

  return (
    <form action={saveResultboardAction} className="grid gap-6" data-testid="resultboard-settings">
      <input type="hidden" name="config" value={JSON.stringify(cfg)} />

      <div className="grid gap-3">
        <h3 className="font-semibold">{t("monitorsTitle")}</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>{t("monitorsCount")}</span>
          {Array.from({ length: RESULTBOARD_MAX_MONITORS }, (_, i) => i + 1).map((k) => (
            <button
              key={k}
              type="button"
              className={`${seg} ${k === n ? segOn : ""}`}
              onClick={() => setMonitors(k)}
              aria-pressed={k === n}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {cfg.monitors.map((m, i) => (
            <div key={i} className="grid gap-2 rounded-md border border-race-line/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-semibold">{t("tv", { n: i + 1 })}</span>
                <Link
                  href={{ pathname: "/resultboard/[tv]", params: { tv: String(i + 1) } }}
                  target="_blank"
                  className="text-xs font-medium text-race-accent hover:underline"
                >
                  /resultboard/{i + 1} ↗
                </Link>
              </div>
              <label className={field}>
                <span>{t("monitorName")}</span>
                <Input
                  value={m.name}
                  maxLength={40}
                  onChange={(e) =>
                    set({
                      monitors: cfg.monitors.map((x, j) =>
                        j === i ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="mr-1">{t("columns")}</span>
                {[null, ...RESULTBOARD_COLUMNS].map((c) => (
                  <button
                    key={String(c)}
                    type="button"
                    className={`${seg} ${m.columns === c ? segOn : ""}`}
                    aria-pressed={m.columns === c}
                    onClick={() =>
                      set({
                        monitors: cfg.monitors.map((x, j) => (j === i ? { ...x, columns: c } : x)),
                      })
                    }
                  >
                    {c === null ? t("columnsAuto") : c}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{t("categoriesTitle")}</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => set({ assign: autoAssign(ordered, entries, n, hidden) })}
              data-testid="resultboard-auto"
            >
              {t("autoSplit")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                set({
                  order: categories.map((c) => c.id),
                  assign: Object.fromEntries(
                    categories.map((c) => [c.id, defaultMonitorFor(c, n)]),
                  ),
                })
              }
            >
              {t("defaultSplit")}
            </Button>
          </div>
        </div>
        <p className={small}>{t("categoriesHint")}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-race-muted">
                <th className="py-1 pr-2">{t("colOrder")}</th>
                <th className="py-1 pr-2">{t("colCategory")}</th>
                <th className="py-1 pr-2 text-right">{t("colEntries")}</th>
                <th className="py-1">{t("colTv")}</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((c, i) => {
                const tv = cfg.assign[c.id] === 0 ? 0 : tvOf(c.id);
                return (
                  <tr key={c.id} className="border-t border-race-line/40">
                    <td className="py-1 pr-2 whitespace-nowrap">
                      <button
                        type="button"
                        className="px-1 disabled:opacity-30"
                        disabled={i === 0}
                        onClick={() => move(c.id, -1)}
                        aria-label={t("up", { name: c.name })}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="px-1 disabled:opacity-30"
                        disabled={i === ordered.length - 1}
                        onClick={() => move(c.id, 1)}
                        aria-label={t("down", { name: c.name })}
                      >
                        ↓
                      </button>
                    </td>
                    <td className="py-1 pr-2">{c.name}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{c.entries}</td>
                    <td className="py-1">
                      <div className="flex flex-wrap gap-1">
                        {[...Array.from({ length: n }, (_, k) => k + 1), 0].map((k) => (
                          <button
                            key={k}
                            type="button"
                            className={`${seg} h-7 ${tv === k ? segOn : ""}`}
                            aria-pressed={tv === k}
                            onClick={() => set({ assign: { ...cfg.assign, [c.id]: k } })}
                          >
                            {k === 0 ? t("hide") : t("tvShort", { n: k })}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 sm:grid-cols-2" data-testid="resultboard-preview">
          {perTv.map(({ list, runners }, i) => {
            const cols = layoutColumns(
              list,
              entries,
              cfg.monitors[i].columns ?? RESULTBOARD_AUTO_COLUMNS,
            );
            return (
              <div key={i} className="grid gap-1">
                <div className={small}>
                  {t("previewTv", { n: i + 1, cats: list.length, runners })}
                </div>
                <div className="flex aspect-video gap-0.5 rounded border border-race-line/60 bg-race-deep p-0.5">
                  {cols.map((col) => (
                    <div key={col.map((c) => c.id).join()} className="flex flex-1 flex-col gap-0.5">
                      {col.map((c) => (
                        <div
                          key={c.id}
                          className="min-h-0 overflow-hidden rounded-sm bg-race-forest-2 px-1 text-[10px] leading-tight"
                          style={{ flex: `${c.entries + 3} 1 0` }}
                        >
                          {c.name} <span className="text-race-muted">{c.entries}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  {cols.length === 0 ? (
                    <div className="m-auto text-xs text-race-muted">{t("previewEmpty")}</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3">
        <h3 className="font-semibold">{t("displayTitle")}</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={field}>
            <span>{t("fixedTop")}</span>
            <Input
              type="number"
              min={1}
              max={10}
              value={cfg.fixedTop}
              onChange={(e) => set({ fixedTop: Number(e.target.value) || 1 })}
            />
          </label>
          <label className={field}>
            <span>{t("scrollSpeed")}</span>
            <Input
              type="number"
              min={0.2}
              max={3}
              step={0.1}
              value={cfg.scrollRowsPerS}
              onChange={(e) => set({ scrollRowsPerS: Number(e.target.value) || 0.8 })}
            />
          </label>
          <label className={field}>
            <span>{t("scrollPause")}</span>
            <Input
              type="number"
              min={0}
              max={30}
              value={cfg.scrollPauseS}
              onChange={(e) => set({ scrollPauseS: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {(["showRunning", "showWaiting", "showDns"] as const).map((key) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                checked={cfg[key]}
                onChange={(e) => set({ [key]: e.target.checked })}
              />
              {t(key)}
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        <h3 className="font-semibold">{t("leaderTitle")}</h3>
        <p className={small}>{t("leaderHint")}</p>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4"
              checked={cfg.leader.speaker}
              onChange={(e) => set({ leader: { ...cfg.leader, speaker: e.target.checked } })}
            />
            {t("leaderSpeaker")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4"
              checked={cfg.leader.resultboard}
              onChange={(e) => set({ leader: { ...cfg.leader, resultboard: e.target.checked } })}
            />
            {t("leaderResultboard")}
          </label>
          <span className="text-race-muted">{t("leaderPoints")}</span>
          {(["m1", "m2", "fin"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                checked={cfg.leader.points.includes(k)}
                onChange={() => togglePoint(k)}
              />
              {t(`point.${k}`)}
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        <h3 className="font-semibold">{t("partnersTitle")}</h3>
        <div className="flex flex-wrap items-end gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4"
              checked={cfg.partners.show}
              onChange={(e) => set({ partners: { ...cfg.partners, show: e.target.checked } })}
            />
            {t("partnersShow")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4"
              checked={cfg.partners.qr}
              onChange={(e) => set({ partners: { ...cfg.partners, qr: e.target.checked } })}
            />
            {t("partnersQr")}
          </label>
          <label className={field}>
            <span>{t("partnersRotate")}</span>
            <Input
              type="number"
              min={3}
              max={60}
              className="w-24"
              value={cfg.partners.rotateS}
              onChange={(e) =>
                set({ partners: { ...cfg.partners, rotateS: Number(e.target.value) || 8 } })
              }
            />
          </label>
          <label className={field}>
            <span>{t("partnersFixed")}</span>
            <select
              className="h-9 rounded-md border border-race-line bg-transparent px-2"
              value={cfg.partners.fixedId === null ? "" : String(cfg.partners.fixedId)}
              onChange={(e) =>
                set({
                  partners: {
                    ...cfg.partners,
                    fixedId: e.target.value === "" ? null : Number(e.target.value),
                  },
                })
              }
            >
              <option value="">{t("partnersFixedAuto", { name: partners[0]?.name ?? "–" })}</option>
              <option value="0">{t("partnersFixedNone")}</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={small}>{t("partnersHint")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-10 font-semibold" data-testid="resultboard-save">
          {t("save")}
        </Button>
        <span className={small}>{t("saveHint")}</span>
      </div>
    </form>
  );
}
