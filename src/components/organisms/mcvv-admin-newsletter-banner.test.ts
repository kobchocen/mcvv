import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { campaignBanner } from "../../lib/newsletter/banner";
import { renderNewsletterPreview } from "../../lib/newsletter/core";
import {
  BannerDraftContext,
  McvvNewsletterBannerDraftProvider,
  McvvNewsletterBannerFields,
  McvvNewsletterBannerThumbnail,
  McvvNewsletterEmailPreview,
  bannerDraftDirty,
  type TextDraft,
} from "./mcvv-admin-newsletter-banner";

const ORIGIN = "https://mcvv.org";
const OPTIONS = [
  { value: "", label: "Bez banneru" },
  {
    value: "preset:mcvv-2026",
    label: "Připravený: MCVV 2026 – pozvánka (34. ročník, 6. 12. 2026)",
  },
  { value: "image:7", label: "Nahraný #7 (2026): Pozvánka" },
];
const none = { bannerImageId: null, bannerPreset: null, bannerAlt: null, bannerLink: null };

/** Uložený stav: provider začíná z uloženého banneru, formulář i náhled ho sdílí. */
function page(saved: { choice: string; alt: string; link: string }) {
  const draft = saved;
  const fields = { ...none, bannerPreset: saved.choice.replace(/^preset:/, "") || null };
  return renderToStaticMarkup(
    createElement(
      McvvNewsletterBannerDraftProvider,
      { initial: draft },
      createElement(McvvNewsletterEmailPreview, {
        subject: "Předmět",
        body: "Ahoj",
        origin: ORIGIN,
        savedPreview: campaignBanner(fields, ""),
        savedEmail: campaignBanner(fields, ORIGIN),
      }),
      createElement(McvvNewsletterBannerFields, { options: OPTIONS, initial: draft }),
    ),
  );
}

function srcdoc(html: string): string {
  const match = /<iframe[^>]*srcDoc="([^"]*)"/i.exec(html);
  assert.ok(match, "iframe with srcdoc");
  return match[1]
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

test("selected preset: thumbnail under the select and banner in the e-mail preview", () => {
  const html = page({ choice: "preset:mcvv-2026", alt: "", link: "" });
  assert.match(
    html,
    /<figure data-slot="banner-thumbnail"[^>]*><img src="\/images\/newsletter\/banner-2026\.png"/,
  );
  assert.match(html, /Připravený: MCVV 2026 – pozvánka/);
  const doc = srcdoc(html);
  const expected = renderNewsletterPreview({
    subject: "Předmět",
    body: "Ahoj",
    origin: ORIGIN,
    banner: campaignBanner({ ...none, bannerPreset: "mcvv-2026" }, ""),
  }).html;
  assert.equal(doc, expected, "preview iframe = e-mail template");
  assert.match(doc, /<img src="\/images\/newsletter\/banner-2026\.png"/);
  assert.match(html, /Banner v e-mailu: <code[^>]*>https:\/\/mcvv\.org\/images\/newsletter/);
  assert.doesNotMatch(html, /banner-draft-hint/, "saved state needs no hint");
});

test("no banner: no image in the preview and a clear note under the select", () => {
  const html = page({ choice: "", alt: "", link: "" });
  assert.doesNotMatch(srcdoc(html), /<img /);
  assert.match(html, /Bez banneru – e-mail začne výchozí tmavou hlavičkou MCVV/);
  assert.match(html, /Bez banneru v hlavičce\./);
});

function unsaved(
  saved: { choice: string; alt: string; link: string },
  draft: { choice: string; alt: string; link: string; uploadSrc?: string; uploadDataUrl?: string },
  text: TextDraft = null,
) {
  return renderToStaticMarkup(
    createElement(
      BannerDraftContext.Provider,
      { value: { draft, saved, setDraft: () => {}, text } },
      createElement(McvvNewsletterEmailPreview, {
        subject: "Předmět",
        body: "Ahoj",
        origin: ORIGIN,
        savedPreview: null,
        savedEmail: null,
      }),
    ),
  );
}

test("an unsaved selection is rendered live into the e-mail preview with a hint", () => {
  const empty = { choice: "", alt: "", link: "" };
  const html = unsaved(empty, { ...empty, choice: "preset:mcvv-2026" });
  assert.match(srcdoc(html), /<img src="\/images\/newsletter\/banner-2026\.png"/);
  assert.match(html, /data-slot="banner-draft-hint"/);
  assert.match(html, /Náhled ukazuje neuložené změny \(banner\)/);
});

test("a new local file is previewed before upload (data: URL in the sandboxed iframe)", () => {
  const empty = { choice: "preset:mcvv-2026", alt: "", link: "" };
  const file = { ...empty, alt: "Pozvánka", uploadSrc: "blob:http://x/1" };
  const html = unsaved(empty, { ...file, uploadDataUrl: "data:image/png;base64,AAAA" });
  assert.match(srcdoc(html), /<img src="data:image\/png;base64,AAAA"[^>]*alt="Pozvánka"/);
  // Než se soubor přečte, náhled neukazuje dočasně starý výběr (preset).
  assert.doesNotMatch(srcdoc(unsaved(empty, file)), /banner-2026\.png/);
  assert.match(html, /nový obrázek, po uložení na adrese/);
});

test("an unsaved banner that would fail to save keeps the saved one and says why", () => {
  const empty = { choice: "", alt: "", link: "" };
  const html = unsaved(empty, { ...empty, uploadSrc: "blob:http://x/1" });
  assert.doesNotMatch(srcdoc(html), /<img /);
  assert.match(html, /Banner z formuláře nejde uložit: Banner musí mít alt text/);
});

test("unsaved subject and text are rendered live with the same template", () => {
  const empty = { choice: "", alt: "", link: "" };
  const html = unsaved(empty, empty, { subject: "Nový předmět", body: "# Nadpis\n\n**tučně**" });
  const doc = srcdoc(html);
  assert.equal(
    doc,
    renderNewsletterPreview({
      subject: "Nový předmět",
      body: "# Nadpis\n\n**tučně**",
      origin: ORIGIN,
      banner: null,
    }).html,
  );
  assert.match(doc, /<strong>tučně<\/strong>/);
  assert.match(html, /Náhled ukazuje neuložené změny \(text\)/);
  // Stejný text jako uložený = žádná výzva k uložení.
  assert.doesNotMatch(unsaved(empty, empty, { subject: "Předmět", body: "Ahoj" }), /draft-hint/);
});

test("dirty detection ignores whitespace-only changes", () => {
  const saved = { choice: "", alt: "", link: "" };
  assert.equal(bannerDraftDirty(saved, saved), false);
  assert.equal(bannerDraftDirty({ ...saved, choice: "preset:mcvv-2026" }, saved), true);
  assert.equal(bannerDraftDirty({ ...saved, alt: " " }, saved), false);
  assert.equal(bannerDraftDirty({ ...saved, uploadSrc: "blob:x" }, saved), true);
});

test("thumbnail of a new local file uses its object URL", () => {
  const html = renderToStaticMarkup(
    createElement(McvvNewsletterBannerThumbnail, {
      src: "blob:http://localhost:3000/abc",
      caption: "Nový soubor banner.png (120 kB)",
    }),
  );
  assert.match(html, /<img src="blob:http:\/\/localhost:3000\/abc"/);
  assert.match(html, /Nový soubor banner\.png/);
});
