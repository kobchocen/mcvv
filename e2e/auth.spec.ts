import { expect, test } from "@playwright/test";

const user = process.env.E2E_USER ?? "";
const pass = process.env.E2E_PASS ?? "";

test.beforeEach(() => {
  test.skip(!user || !pass, "Chybí E2E_USER / E2E_PASS");
});

test("bez přihlášení /prihlasky žádá účet", async ({ page }) => {
  await page.goto("/cs/prihlasky", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Moje přihláška" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Přihlášení" })).toBeVisible();
});

test("špatné heslo neotevře účet", async ({ page }) => {
  await page.goto("/cs/prihlaseni", { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(user);
  await page.locator("#password").fill("toto-neni-heslo");
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/prihlaseni/);
  await expect(page.locator("p.text-destructive")).toBeVisible();
});

test("přihlášení otevře Moji přihlášku a odhlášení vrátí ven", async ({ page }) => {
  await page.goto("/cs/prihlaseni", { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(user);
  await page.locator("#password").fill(pass);
  await page.locator('form button[type="submit"]').click();
  await Promise.race([
    page.waitForURL((url) => !url.pathname.includes("/prihlaseni"), { timeout: 20000 }),
    page.locator("p.text-destructive").waitFor({ timeout: 20000 }),
    page.getByRole("button", { name: /ověř/i }).waitFor({ timeout: 20000 }),
  ]).catch(() => {});
  console.log("po loginu url:", page.url());
  console.log(
    "po loginu text:",
    (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300),
  );
  expect(page.url(), "login má opustit /prihlaseni").not.toMatch(/prihlaseni/);
  await page.goto("/cs/prihlasky", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Moje přihláška" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Přihlášení" })).toHaveCount(0);
  await page.getByRole("button", { name: "Odhlásit se" }).click();
  await page.waitForURL(/\/(cs|en)\/?$/, { timeout: 15000 });
});
