import assert from "node:assert/strict";
import { test } from "node:test";
import { createTranslator } from "next-intl";

import routing from "../../../next-intl.config";
import cs from "../../i18n/locales/cs/common.json";
import en from "../../i18n/locales/en/common.json";
import {
  isPublicPhoto,
  parsePhotoId,
  photoPermalinkBase,
  photoPermalinkPath,
  photoShareMetadata,
} from "./share";

test("permalink path is locale-prefixed and registered in next-intl pathnames", () => {
  assert.equal(photoPermalinkPath("cs", 5039), "/cs/fotogalerie/foto/5039");
  assert.equal(photoPermalinkPath("en", 7), "/en/fotogalerie/foto/7");
  assert.equal(`${photoPermalinkBase("cs")}5039`, photoPermalinkPath("cs", 5039));
  assert.ok("/fotogalerie/foto/[id]" in (routing.pathnames ?? {}));
});

test("only canonical positive integer ids are accepted (others → 404)", () => {
  assert.equal(parsePhotoId("5039"), 5039);
  assert.equal(parsePhotoId("1"), 1);
  for (const raw of ["", "0", "-1", "05039", "12a", "1.5", "1e3", " 12", "99999999999"]) {
    assert.equal(parsePhotoId(raw), null, raw);
  }
});

test("unpublished or missing photos are not public (permalink 404)", () => {
  assert.equal(isPublicPhoto({ hasImage: true }), true);
  assert.equal(isPublicPhoto({ hasImage: false }), false);
  assert.equal(isPublicPhoto(null), false);
  assert.equal(isPublicPhoto(undefined), false);
});

// The copy uses a non-breaking space ("z ročníku"), so derive it from the messages.
const CS_ALT = cs.PhotoGallery.photoAlt.replace("{year}", "2014");

function meta(locale: "cs" | "en", photo = { id: 5039, year: 2014, width: 589, height: 800 }) {
  const t = createTranslator({
    locale,
    messages: locale === "cs" ? cs : en,
    namespace: "PhotoGallery",
  });
  return photoShareMetadata({
    base: "https://mcvv.org",
    locale,
    locales: ["cs", "en"],
    photo,
    title: t("shareTitle", { year: photo.year }),
    description: t("shareDescription", { year: photo.year }),
    alt: t("photoAlt", { year: photo.year }),
    siteName: "Malá cena Velké Verandy",
  });
}

test("Open Graph + Twitter meta: photo image, year title, canonical permalink", () => {
  const m = meta("cs");
  assert.deepEqual(m.title, { absolute: "Malá cena Velké Verandy 2014 – fotogalerie" });
  const og = m.openGraph as Record<string, unknown>;
  assert.equal(og.title, "Malá cena Velké Verandy 2014 – fotogalerie");
  assert.equal(og.url, "https://mcvv.org/cs/fotogalerie/foto/5039");
  assert.equal(og.type, "website");
  assert.equal(og.locale, "cs_CZ");
  assert.equal(og.siteName, "Malá cena Velké Verandy");
  assert.match(String(og.description), /2014/);
  assert.deepEqual(og.images, [
    {
      url: "https://mcvv.org/api/fotka?id=5039",
      width: 589,
      height: 800,
      alt: CS_ALT,
      type: "image/jpeg",
    },
  ]);
  const tw = m.twitter as Record<string, unknown>;
  assert.equal(tw.card, "summary_large_image");
  assert.deepEqual(tw.images, [{ url: "https://mcvv.org/api/fotka?id=5039", alt: CS_ALT }]);
  assert.equal(m.alternates?.canonical, "https://mcvv.org/cs/fotogalerie/foto/5039");
  assert.deepEqual(m.alternates?.languages, {
    cs: "https://mcvv.org/cs/fotogalerie/foto/5039",
    en: "https://mcvv.org/en/fotogalerie/foto/5039",
  });
});

test("English meta and unknown dimensions (no width/height emitted)", () => {
  const m = meta("en", { id: 12, year: 1997, width: null, height: null } as never);
  const og = m.openGraph as Record<string, unknown>;
  assert.equal(og.title, "Malá cena Velké Verandy 1997 – photo gallery");
  assert.equal(og.locale, "en_US");
  assert.deepEqual(og.images, [
    {
      url: "https://mcvv.org/api/fotka?id=12",
      alt: "Photo from the 1997 edition",
      type: "image/jpeg",
    },
  ]);
});

test("share meta never carries runner names or free-text descriptions", () => {
  // The builder only takes id/year/size: nothing else from the photo row can leak.
  const json = JSON.stringify(meta("cs"));
  for (const forbidden of ["debugText", "runner", "Novák"]) {
    assert.ok(!json.includes(forbidden), forbidden);
  }
});
