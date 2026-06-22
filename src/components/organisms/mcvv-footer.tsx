import { RaceBrand } from "@/components/atoms";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

export type McvvFooterProps = {
  content: Pick<McvvHomepageContent, "brand" | "footer">;
};

export function McvvFooter({ content }: McvvFooterProps) {
  return (
    <footer className="bg-race-deep px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 border-t border-race-line/55 pt-10 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <RaceBrand {...content.brand} />
            <p className="mt-5 max-w-sm text-sm leading-6 text-race-muted">
              {content.footer.description}
            </p>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            {content.footer.columns.map((column) => (
              <div key={column.title}>
                <h3 className="font-display text-sm font-semibold uppercase text-foreground dark:text-white">
                  {column.title}
                </h3>
                <ul className="mt-4 grid gap-3">
                  {column.links.map((link) => (
                    <li key={link} className="text-sm text-race-muted">
                      {link}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-race-line/55 pt-6 text-xs text-race-dim sm:flex-row sm:items-center sm:justify-between">
          <p>{content.footer.copyright}</p>
          <p>{content.footer.made}</p>
        </div>
      </div>
    </footer>
  );
}
