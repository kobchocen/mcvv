import {
  ClipboardCheck,
  Flag,
  Mountain,
  Route,
  ShieldCheck,
  Trees,
  Trophy,
  Users,
} from "lucide-react";

import { RaceInfoCard, SectionHeader } from "@/components/molecules";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

const storyIcons = [Mountain, Route, Trees];
const factIcons = [ClipboardCheck, Flag, Users, Trophy];

export type McvvOverviewSectionProps = {
  content: McvvHomepageContent["overview"];
};

export function McvvOverviewSection({ content }: McvvOverviewSectionProps) {
  return (
    <section id="about" className="bg-race-forest px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <SectionHeader
              eyebrow={content.eyebrow}
              title={content.title}
              titleClassName="max-w-xl"
            />
            <div className="mt-6 grid gap-4 text-base leading-7 text-race-muted">
              {content.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            {content.cards.map((card, index) => (
              <RaceInfoCard
                key={card.title}
                icon={storyIcons[index] ?? ShieldCheck}
                title={card.title}
                description={card.description}
              />
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {content.facts.map((fact, index) => (
            <RaceInfoCard
              key={fact.title}
              icon={factIcons[index] ?? ShieldCheck}
              title={fact.title}
              description={fact.description}
              className="bg-race-surface py-4"
            />
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {content.actions.map((action) => {
            const isContact = action.href === "/kontakt";
            return (
              <Button
                key={action.href}
                asChild
                variant={isContact ? "default" : "outline"}
                className={
                  isContact
                    ? "h-10 bg-race-accent px-4 font-display text-sm font-semibold text-white hover:bg-race-accent-hover"
                    : "h-10 border-race-line bg-race-surface px-4 font-display text-sm font-semibold text-foreground hover:bg-race-accent hover:text-white"
                }
              >
                <Link
                  href={
                    action.href as
                      | "/prihlasky"
                      | "/program"
                      | "/pokyny"
                      | "/startovka"
                      | "/results"
                      | "/kontakt"
                  }
                >
                  {action.label}
                </Link>
              </Button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
