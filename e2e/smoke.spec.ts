import { expect, test } from "@playwright/test";

test("veřejné stránky odpovídají", async ({ page }) => {
  const paths = [
    "/cs",
    "/cs/program",
    "/cs/pokyny",
    "/cs/kontakt",
    "/cs/results",
    "/cs/fotogalerie",
    "/cs/prihlasky",
    "/cs/prihlaseni",
    "/cs/startovka",
    "/en",
    "/healthz",
  ];
  for (const path of paths) {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.ok(), path).toBeTruthy();
  }
});

test("výsledky otevřou ročník a běžce", async ({ page }) => {
  await page.goto("/cs/results", { waitUntil: "domcontentloaded" });
  await page.locator('a[href*="results?year="]').first().click();
  await expect(page).toHaveURL(/year=/);
  await page.locator('a[href*="/bezec/"]').first().click();
  await expect(page).toHaveURL(/\/bezec\//);
});
