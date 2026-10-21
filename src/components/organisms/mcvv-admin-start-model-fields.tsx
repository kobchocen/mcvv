import { AdminField } from "@/components/organisms/mcvv-admin-field";
import type { BibRange, ChampionBibs } from "@/lib/race/start-settings";
import {
  formatClock,
  startSeriesForBib,
  startTimeForBib,
  type StartModel,
} from "@/lib/race/start-time";

export type McvvAdminStartModelCopy = {
  heading: string;
  hint: string;
  zero: string;
  interval: string;
  secondStart: string;
  championMen: string;
  championWomen: string;
  rangesHeading: string;
  rangesHint: string;
  colCategory: string;
  colFrom: string;
  colTo: string;
  colStart: string;
  colTimes: string;
  series: (n: number) => string;
  errors: string[];
};

/** Sekce „Model startu“ ve formuláři ročníku (#114). */
export function McvvAdminStartModelFields({
  model,
  champions,
  ranges,
  categories,
  copy,
}: {
  model: StartModel;
  champions: ChampionBibs;
  ranges: BibRange[];
  categories: { id: string; name: string }[];
  copy: McvvAdminStartModelCopy;
}) {
  const rangeById = new Map(ranges.map((range) => [range.categoryId, range]));
  return (
    <fieldset className="grid gap-4 border border-race-line/55 bg-race-surface/40 p-4 sm:p-5">
      <legend className="px-1 font-display text-lg font-semibold text-foreground dark:text-white">
        {copy.heading}
      </legend>
      <p className="text-sm leading-6 text-race-muted">{copy.hint}</p>
      {copy.errors.length > 0 ? (
        <ul
          role="alert"
          className="grid gap-1 border-l-4 border-red-600 bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
        >
          {copy.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <AdminField
          name="startZero"
          label={copy.zero}
          defaultValue={formatClock(model.zeroSeconds)}
        />
        <AdminField
          name="startInterval"
          label={copy.interval}
          type="number"
          defaultValue={model.intervalSeconds}
        />
        <AdminField
          name="secondStartFrom"
          label={copy.secondStart}
          type="number"
          defaultValue={model.secondStartFrom}
        />
        <AdminField
          name="championBibMen"
          label={copy.championMen}
          type="number"
          defaultValue={champions.men ?? ""}
        />
        <AdminField
          name="championBibWomen"
          label={copy.championWomen}
          type="number"
          defaultValue={champions.women ?? ""}
        />
      </div>
      <div>
        <p className="font-display text-base font-semibold text-foreground dark:text-white">
          {copy.rangesHeading}
        </p>
        <p className="mt-1 text-sm text-race-muted">{copy.rangesHint}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                <th className="py-2 pr-3">{copy.colCategory}</th>
                <th className="py-2 pr-3">{copy.colFrom}</th>
                <th className="py-2 pr-3">{copy.colTo}</th>
                <th className="py-2 pr-3">{copy.colStart}</th>
                <th className="py-2">{copy.colTimes}</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => {
                const range = rangeById.get(category.id);
                return (
                  <tr key={category.id} className="border-b border-race-line/40">
                    <td className="py-1.5 pr-3">
                      <span className="font-semibold">{category.id}</span> {category.name}
                    </td>
                    <td className="py-1.5 pr-3">
                      <input
                        aria-label={`${category.id} ${copy.colFrom}`}
                        name={`range_${category.id}_from`}
                        type="number"
                        min={1}
                        defaultValue={range?.bibFrom ?? ""}
                        className="h-9 w-24 border border-race-line bg-race-surface px-2"
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input
                        aria-label={`${category.id} ${copy.colTo}`}
                        name={`range_${category.id}_to`}
                        type="number"
                        min={1}
                        defaultValue={range?.bibTo ?? ""}
                        className="h-9 w-24 border border-race-line bg-race-surface px-2"
                      />
                    </td>
                    <td className="py-1.5 pr-3 text-race-muted">
                      {range ? copy.series(startSeriesForBib(model, range.bibFrom)) : ""}
                    </td>
                    <td className="py-1.5 tabular-nums text-race-muted">
                      {range
                        ? `${startTimeForBib(model, range.bibFrom)} – ${startTimeForBib(model, range.bibTo)}`
                        : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </fieldset>
  );
}
