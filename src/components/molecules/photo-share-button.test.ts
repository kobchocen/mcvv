import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import cs from "../../i18n/locales/cs/common.json";
import en from "../../i18n/locales/en/common.json";
import { initialLightboxIndex } from "./photo-gallery-grid";
import { PhotoLightbox } from "./photo-lightbox";
import { PhotoShareButtonView } from "./photo-share-button";

const labels = {
  label: cs.PhotoGallery.share,
  copiedLabel: cs.PhotoGallery.linkCopied,
  failedLabel: cs.PhotoGallery.copyFailed,
};

test("share copy exists in cs and en", () => {
  assert.equal(cs.PhotoGallery.share, "Sdílet");
  assert.equal(cs.PhotoGallery.linkCopied, "Odkaz zkopírován");
  assert.equal(en.PhotoGallery.share, "Share");
  assert.equal(en.PhotoGallery.linkCopied, "Link copied");
  assert.ok(en.PhotoGallery.copyFailed && cs.PhotoGallery.copyFailed);
});

test("share button: icon + label, live region empty until something happens", () => {
  const html = renderToStaticMarkup(
    createElement(PhotoShareButtonView, { ...labels, toast: null }),
  );
  assert.match(html, /<button type="button" data-slot="photo-share"[^>]*>.*Sdílet<\/button>/);
  assert.ok(html.includes("lucide-share2") || html.includes("lucide-share-2"), html);
  assert.match(html, /role="status" aria-live="polite"[^>]*class="sr-only"><\/span>/);
  assert.ok(!/download/i.test(html), "no download button");
});

test("toast shows 'Odkaz zkopírován' after copying, error text on failure", () => {
  const copied = renderToStaticMarkup(
    createElement(PhotoShareButtonView, { ...labels, toast: "copied" }),
  );
  assert.match(copied, /data-slot="photo-share-toast"[^>]*>Odkaz zkopírován<\/span>/);
  assert.ok(!copied.includes('class="sr-only"'));
  const failed = renderToStaticMarkup(
    createElement(PhotoShareButtonView, { ...labels, toast: "failed" }),
  );
  assert.match(failed, />Odkaz se nepodařilo zkopírovat<\/span>/);
});

test("permalink opens its photo in the lightbox (index), unknown id stays closed", () => {
  const photos = [{ id: 10 }, { id: 11 }, { id: 42 }];
  assert.equal(initialLightboxIndex(photos, 42), 2);
  assert.equal(initialLightboxIndex(photos, 10), 0);
  assert.equal(initialLightboxIndex(photos, 99), null);
  assert.equal(initialLightboxIndex(photos, undefined), null);
});

test("lightbox without share config renders no share button (runner profile)", () => {
  const html = renderToStaticMarkup(
    createElement(PhotoLightbox, {
      photos: [{ id: 1, alt: "a", title: "t" }],
      activeIndex: null,
      onActiveIndexChange: () => {},
      closeLabel: "c",
      previousLabel: "p",
      nextLabel: "n",
    }),
  );
  assert.ok(!html.includes("photo-share"));
});
