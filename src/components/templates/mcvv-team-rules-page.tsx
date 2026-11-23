import { McvvFooter, McvvPublicNavbar } from "@/components/organisms";
import { Link } from "@/i18n/routing";
import { MAIN_POINTS, OTHER_POINTS } from "@/lib/teams/scoring";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

export type McvvTeamRulesCopy = {
  eyebrow: string;
  title: string;
  lead: string;
  sectionTeam: string;
  teamDef: string;
  entryDuty: string;
  noClub: string;
  sectionScoring: string;
  scoringRules: string;
  otherCats: string;
  mainCats: string;
  place: string;
  points: string;
  sum: string;
  sectionRanking: string;
  rankingRules: string;
  sectionTie: string;
  tieRules: string;
  sectionPrize: string;
  announcement: string;
  prizeWaiver: string;
  officialPublish: string;
  historyLink: string;
  historyLinkNote: string;
};

export type McvvTeamRulesPageProps = {
  brand: McvvHomepageContent["brand"];
  nav: McvvHomepageContent["nav"];
  footer: McvvHomepageContent["footer"];
  copy: McvvTeamRulesCopy;
};

function PointsTable({
  title,
  values,
  placeLabel,
  pointsLabel,
}: {
  title: string;
  values: readonly number[];
  placeLabel: string;
  pointsLabel: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-race-line/50 bg-race-surface">
      <h3 className="px-4 pt-3 font-display text-base font-semibold text-foreground dark:text-white">
        {title}
      </h3>
      <table className="mt-2 w-full text-sm">
        <thead className="text-xs font-semibold uppercase tracking-wide text-race-dim">
          <tr>
            <th className="px-4 py-2 text-left">{placeLabel}</th>
            {values.map((_, index) => (
              <th key={index} className="px-2 py-2 text-right tabular-nums">
                {index + 1}.
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-race-line/40">
            <td className="px-4 py-2 font-medium">{pointsLabel}</td>
            {values.map((value, index) => (
              <td
                key={index}
                className="px-2 py-2 text-right font-display font-semibold tabular-nums"
              >
                {value}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function McvvTeamRulesPage({ brand, nav, footer, copy }: McvvTeamRulesPageProps) {
  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvPublicNavbar content={{ brand, nav }} variant="solid" />
      <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-4xl">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent">
            {copy.eyebrow}
          </p>
          <h1 className="mt-4 font-display text-5xl font-bold text-foreground dark:text-white sm:text-6xl">
            {copy.title}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-race-muted">{copy.lead}</p>

          <section className="mt-12">
            <h2 className="font-display text-3xl font-bold">{copy.sectionTeam}</h2>
            <div className="mt-4 space-y-3 text-base leading-7 text-foreground dark:text-white/90">
              <p>{copy.teamDef}</p>
              <p>{copy.entryDuty}</p>
              <p>{copy.noClub}</p>
            </div>
          </section>

          <section className="mt-12">
            <h2 className="font-display text-3xl font-bold">{copy.sectionScoring}</h2>
            <p className="mt-4 text-base leading-7">{copy.scoringRules}</p>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <PointsTable
                title={copy.otherCats}
                values={OTHER_POINTS}
                placeLabel={copy.place}
                pointsLabel={copy.points}
              />
              <PointsTable
                title={copy.mainCats}
                values={MAIN_POINTS}
                placeLabel={copy.place}
                pointsLabel={copy.points}
              />
            </div>
            <p className="mt-4 text-base leading-7">{copy.sum}</p>
          </section>

          <section className="mt-12">
            <h2 className="font-display text-3xl font-bold">{copy.sectionRanking}</h2>
            <p className="mt-4 text-base leading-7">{copy.rankingRules}</p>
          </section>

          <section className="mt-12">
            <h2 className="font-display text-3xl font-bold">{copy.sectionTie}</h2>
            <p className="mt-4 text-base leading-7">{copy.tieRules}</p>
          </section>

          <section className="mt-12">
            <h2 className="font-display text-3xl font-bold">{copy.sectionPrize}</h2>
            <p className="mt-4 text-base leading-7">
              {copy.announcement} {copy.prizeWaiver}
            </p>
            <p className="mt-3 text-base leading-7">{copy.officialPublish}</p>
          </section>

          <p className="mt-12 border-t border-race-line/50 pt-6 text-sm">
            <Link
              href={{ pathname: "/statistiky/[slug]", params: { slug: "tymy" } }}
              className="font-semibold text-race-accent hover:underline"
            >
              {copy.historyLink}
            </Link>
            <span className="text-race-muted"> · {copy.historyLinkNote}</span>
          </p>
        </div>
      </section>
      <McvvFooter content={{ brand, footer }} />
    </main>
  );
}
