import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { LOGO_REASON_KEYS, logoErrorMessage, logoReasonKey } from "./logo-error";

const copy = (key: string) => `[${key}]`;

describe("partner logo error message", () => {
  it("is empty unless the upload was rejected", () => {
    assert.equal(logoErrorMessage(undefined, "svg-entities", copy), undefined);
    assert.equal(logoErrorMessage("ok", undefined, copy), undefined);
  });

  it("always shows the friendly message, plus the specific reason when known", () => {
    assert.equal(logoErrorMessage("invalid", undefined, copy), "[partnersLogoInvalid]");
    assert.equal(logoErrorMessage("invalid", "constructor", copy), "[partnersLogoInvalid]");
    assert.equal(
      logoErrorMessage("invalid", "svg-entities", copy),
      "[partnersLogoInvalid] [partnersLogoReasonSvgEntities]",
    );
    assert.equal(logoReasonKey("__proto__"), null);
  });

  it("has a translation for every reason in every locale", () => {
    for (const locale of ["cs", "en"]) {
      const url = new URL(`../../i18n/locales/${locale}/common.json`, import.meta.url);
      const admin = (JSON.parse(readFileSync(url, "utf8")) as { Admin: Record<string, string> })
        .Admin;
      for (const key of [...Object.values(LOGO_REASON_KEYS), "partnersErrorTitle"]) {
        assert.ok(admin[key], `${locale}: ${key}`);
      }
    }
  });
});
