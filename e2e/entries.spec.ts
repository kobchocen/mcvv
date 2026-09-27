import { expect, test, type Page } from "@playwright/test";

const user = process.env.E2E_USER ?? "";
const pass = process.env.E2E_PASS ?? "";

test.beforeEach(() => {
  test.skip(!user || !pass, "Chybí E2E_USER / E2E_PASS");
});

async function login(page: Page) {
  await page.goto("/cs/prihlaseni", { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(user);
  await page.locator("#password").fill(pass);
  await page.locator('form button[type="submit"]').click();
  await Promise.race([
    page.waitForURL((url) => !url.pathname.includes("/prihlaseni"), { timeout: 20000 }),
    page.locator("p.text-destructive").waitFor({ timeout: 20000 }),
  ]).catch(() => {});
  expect(page.url(), "login má opustit /prihlaseni").not.toMatch(/prihlaseni/);
}

test("přihlášený vidí Moji přihlášku", async ({ page }) => {
  await login(page);
  await page.goto("/cs/prihlasky", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Moje přihláška" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Přihlášení" })).toHaveCount(0);
});

test("startovka se otevře", async ({ page }) => {
  await page.goto("/cs/startovka", { waitUntil: "domcontentloaded" });
  expect(page.url()).toMatch(/startovka/);
  await expect(page.locator("h1")).toBeVisible();
});
