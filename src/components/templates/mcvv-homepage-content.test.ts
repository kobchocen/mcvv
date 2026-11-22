import assert from "node:assert/strict";
import { test } from "node:test";

import { withFooterYear, type McvvHomepageContent } from "./mcvv-homepage-content";

const footer: McvvHomepageContent["footer"] = {
  description: "d",
  copyright: "c",
  made: "m",
  columns: [
    {
      title: "Stats",
      links: [
        { label: "Archive", href: "/results" },
        { label: "Latest edition", href: "/results/{year}" },
      ],
    },
  ],
};

test("withFooterYear replaces the last-edition placeholder", () => {
  const result = withFooterYear(footer, 2025);
  assert.deepEqual(result.columns[0]?.links, [
    { label: "Archive", href: "/results" },
    { label: "Latest edition", href: "/results/2025" },
  ]);
});

test("withFooterYear hides the last-edition link when the year is unknown", () => {
  const result = withFooterYear(footer, null);
  assert.deepEqual(result.columns[0]?.links, [{ label: "Archive", href: "/results" }]);
});
