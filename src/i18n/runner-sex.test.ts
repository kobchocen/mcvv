import assert from "node:assert/strict";
import { test } from "node:test";
import { createTranslator } from "next-intl";

import cs from "./locales/cs/common.json";
import en from "./locales/en/common.json";
import { runnerSex } from "../lib/stats/core";

const NBSP = "\u00a0";
const plain = (value: string) => value.replaceAll(NBSP, " ");

test("cs runner profile wording follows the runner's sex (#103)", () => {
  const t = createTranslator({ locale: "cs", messages: cs, namespace: "Runner" });
  const female = runnerSex("19835002");
  const male = runnerSex("19830002");
  assert.equal(female, "F");
  assert.equal(male, "M");

  assert.equal(t("eyebrow", { sex: female }), "Běžkyně");
  assert.equal(t("eyebrow", { sex: male }), "Běžec");
  assert.equal(plain(t("empty", { sex: female })), "Pro tuto běžkyni zatím nejsou výsledky.");
  assert.equal(plain(t("empty", { sex: male })), "Pro tohoto běžce zatím nejsou výsledky.");
  assert.equal(
    plain(t("registeredFirstStart", { sex: female, year: 2026 })),
    "Přihlášena na ročník 2026 – první start",
  );
  assert.equal(
    plain(t("registeredFirstStart", { sex: male, year: 2026 })),
    "Přihlášen na ročník 2026 – první start",
  );
});

test("en runner profile wording is unchanged", () => {
  const t = createTranslator({ locale: "en", messages: en, namespace: "Runner" });
  assert.equal(t("eyebrow", { sex: "F" }), "Runner");
  assert.equal(t("empty", { sex: "F" }), "No results for this runner yet.");
  assert.equal(
    t("registeredFirstStart", { sex: "F", year: 2026 }),
    "Registered for 2026 – first start",
  );
});
