import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import sharp from "sharp";

import {
  BANNER_ERROR_MESSAGES,
  DEFAULT_BANNER_LINK,
  NEWSLETTER_BANNER_PRESETS,
  bannerChoiceValue,
  campaignBanner,
  normalizeBannerAlt,
  normalizeBannerLink,
  parseBannerChoice,
} from "./banner";
import { bannerResponseHeaders } from "./banner-http";
import { processBannerImage } from "./banner-image";
import { renderNewsletter } from "./core";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const none = { bannerImageId: null, bannerPreset: null, bannerAlt: null, bannerLink: null };

async function image(
  width: number,
  height: number,
  format: "png" | "jpeg" | "webp",
  alpha = false,
) {
  const base = sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: alpha ? { r: 15, g: 42, b: 28, alpha: 0.5 } : { r: 226, g: 83, b: 28 },
    },
  });
  return format === "png"
    ? base.png().toBuffer()
    : format === "jpeg"
      ? base.jpeg().toBuffer()
      : base.webp().toBuffer();
}

describe("newsletter banner – choice, alt and link", () => {
  it("parses the banner select value", () => {
    assert.deepEqual(parseBannerChoice(""), { kind: "none" });
    assert.deepEqual(parseBannerChoice("preset:mcvv-2026"), { kind: "preset", key: "mcvv-2026" });
    assert.deepEqual(parseBannerChoice("image:42"), { kind: "image", id: 42 });
    assert.equal(parseBannerChoice("preset:neexistuje"), null);
    assert.equal(parseBannerChoice("image:0"), null);
    assert.equal(parseBannerChoice("image:99999"), null);
    assert.equal(parseBannerChoice("image:1 OR 1=1"), null);
    assert.equal(bannerChoiceValue({ ...none, bannerImageId: 7 }), "image:7");
    assert.equal(bannerChoiceValue({ ...none, bannerPreset: "mcvv-2026" }), "preset:mcvv-2026");
    assert.equal(bannerChoiceValue({ ...none, bannerPreset: "smazany" }), "");
  });

  it("defaults the link to mcvv.org and accepts only http(s) without credentials", () => {
    assert.equal(normalizeBannerLink(""), DEFAULT_BANNER_LINK);
    assert.equal(normalizeBannerLink("  "), DEFAULT_BANNER_LINK);
    assert.equal(
      normalizeBannerLink("https://mcvv.org/cs/prihlasky"),
      "https://mcvv.org/cs/prihlasky",
    );
    assert.equal(normalizeBannerLink("javascript:alert(1)"), null);
    assert.equal(normalizeBannerLink("mcvv.org"), null);
    assert.equal(normalizeBannerLink("https://user:pass@mcvv.org"), null);
    assert.equal(normalizeBannerLink(`https://mcvv.org/${"a".repeat(600)}`), null);
    assert.equal(normalizeBannerAlt("  Pozvánka \n 2026 "), "Pozvánka 2026");
  });

  it("builds an absolute URL for the e-mail and a relative one for the admin preview", () => {
    const uploaded = { ...none, bannerImageId: 12, bannerAlt: "Pozvánka", bannerLink: "" };
    assert.deepEqual(campaignBanner(uploaded, "https://mcvv.org/"), {
      src: "https://mcvv.org/api/newsletter-banner?id=12",
      alt: "Pozvánka",
      href: "https://mcvv.org",
    });
    assert.equal(campaignBanner(uploaded, "")?.src, "/api/newsletter-banner?id=12");
    const preset = campaignBanner({ ...none, bannerPreset: "mcvv-2026" }, "https://mcvv.org");
    assert.equal(preset?.src, "https://mcvv.org/images/newsletter/banner-2026.png");
    assert.match(preset?.alt ?? "", /34\. Malá cena Velké Verandy/);
    assert.equal(campaignBanner(none, "https://mcvv.org"), null);
    // Nahraný banner bez alt textu se nevykreslí (formulář ho bez alt neuloží).
    assert.equal(campaignBanner({ ...none, bannerImageId: 3 }, "https://mcvv.org"), null);
  });

  it("every preset file exists in public/ and is 1200 × 400 (3:1)", async () => {
    for (const preset of NEWSLETTER_BANNER_PRESETS) {
      const file = join(ROOT, "public", preset.path);
      assert.ok(existsSync(file), preset.path);
      const meta = await sharp(readFileSync(file)).metadata();
      assert.deepEqual([meta.width, meta.height, meta.format], [1200, 400, "png"], preset.path);
      assert.ok(readFileSync(file).length < 300 * 1024, "banner should stay small for e-mail");
    }
  });
  it("banner source keeps Czech diacritics readable and uses the agreed copy", () => {
    const html = readFileSync(join(ROOT, "scripts/newsletter-banner/banner-2026.html"), "utf8");
    assert.equal(html, html.normalize("NFC"));
    assert.doesNotMatch(html, /[\u0300-\u036f]/);
    assert.match(html, /subset=latin,latin-ext/);
    // Při malé výšce řádku sahá čárka nad É (2. řádek) k účaří 1. řádku a čte se jako „MALÁ, CENA“.
    const h1 = /h1 \{[^}]*?(\d+)px\/([\d.]+) Oswald/.exec(html);
    assert.ok(
      h1 && Number(h1[2]) >= 1.45,
      "headline line-height must leave clear room for accents",
    );
    // Údaje jsou svislý seznam; 4 300 m s nezlomitelnou mezerou, „lesní kros“ samostatně.
    const items = [...html.matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1]);
    assert.deepEqual(items, ["Choceň – Velká Veranda", "4\u00a0300 m", "lesní kros"]);
    assert.match(html, /flex-direction: column/);
    assert.doesNotMatch(html, /4,3 km/);
    const preset = NEWSLETTER_BANNER_PRESETS.find((p) => p.key === "mcvv-2026");
    assert.match(preset?.alt ?? "", /4\u00a0300 m, lesní kros/);
  });
});

describe("newsletter banner – template", () => {
  const banner = {
    src: "https://mcvv.org/api/newsletter-banner?id=5",
    alt: 'A "B" <C>',
    href: "https://mcvv.org",
  };

  it("renders a linked, responsive image in the header and escapes alt", () => {
    const mail = renderNewsletter({
      subject: "S",
      body: "Ahoj",
      unsubscribeUrl: "https://mcvv.org/cs/newsletter/odhlasit?token=x",
      siteUrl: "https://mcvv.org",
      banner,
    });
    const header = mail.html.indexOf("Malá cena Velké Verandy</span>");
    const img = mail.html.indexOf('<img src="https://mcvv.org/api/newsletter-banner?id=5"');
    const body = mail.html.indexOf('<p style="margin:0 0 16px">Ahoj');
    assert.ok(header > 0 && img > header && body > img, "banner sits between brand bar and body");
    assert.match(mail.html, /<a href="https:\/\/mcvv\.org"[^>]*><img [^>]*width="600"/);
    assert.match(mail.html, /width:100%;max-width:600px;height:auto/);
    assert.match(mail.html, /alt="A &quot;B&quot; &lt;C&gt;"/);
    assert.doesNotMatch(mail.html, /data:image|base64|cid:/);
    assert.match(mail.text, /^A "B" <C>\nhttps:\/\/mcvv\.org\n/);
  });

  it("renders no banner row without a banner", () => {
    const mail = renderNewsletter({
      subject: "S",
      body: "Ahoj",
      unsubscribeUrl: "u",
      siteUrl: "https://mcvv.org",
    });
    assert.doesNotMatch(mail.html, /<img /);
  });

  it("serves the public image cross-origin (webmail) with a long immutable cache", () => {
    const headers = bannerResponseHeaders("image/png", 10);
    assert.equal(headers["Cross-Origin-Resource-Policy"], "cross-origin");
    assert.match(headers["Cache-Control"], /immutable/);
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
  });

  it("the public route only serves newsletter-type webimages", () => {
    const route = readFileSync(join(ROOT, "src/app/api/newsletter-banner/route.ts"), "utf8");
    assert.match(route, /type: \{ desc: NEWSLETTER_BANNER_TYPE \}/);
  });
});

describe("newsletter banner – upload processing", () => {
  it("downsizes a large PNG with transparency to 1200 px PNG", async () => {
    const out = await processBannerImage(await image(2400, 800, "png", true));
    assert.ok(out.ok);
    assert.deepEqual([out.type, out.width, out.height], ["image/png", 1200, 400]);
  });

  it("converts JPEG and WebP without transparency to JPEG and never enlarges", async () => {
    const webp = await processBannerImage(await image(1800, 600, "webp"));
    assert.ok(webp.ok);
    assert.deepEqual([webp.type, webp.width, webp.height], ["image/jpeg", 1200, 400]);
    const small = await processBannerImage(await image(800, 300, "jpeg"));
    assert.ok(small.ok);
    assert.deepEqual([small.type, small.width, small.height], ["image/jpeg", 800, 300]);
  });

  it("rejects empty, oversized, non-image, too narrow and too tall uploads", async () => {
    assert.deepEqual(await processBannerImage(new Uint8Array()), { ok: false, error: "empty" });
    assert.deepEqual(await processBannerImage(new Uint8Array(1024 * 1024 + 1)), {
      ok: false,
      error: "too_large",
    });
    assert.deepEqual(await processBannerImage(Buffer.from("<svg></svg>")), {
      ok: false,
      error: "type",
    });
    assert.deepEqual(await processBannerImage(await image(500, 200, "png")), {
      ok: false,
      error: "too_small",
    });
    assert.deepEqual(await processBannerImage(await image(800, 1600, "png")), {
      ok: false,
      error: "invalid",
    });
    const broken = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64),
    ]);
    assert.deepEqual(await processBannerImage(broken), { ok: false, error: "invalid" });
    for (const key of [
      "empty",
      "too_large",
      "type",
      "too_small",
      "invalid",
      "alt",
      "link",
      "choice",
    ]) {
      assert.ok(BANNER_ERROR_MESSAGES[key as keyof typeof BANNER_ERROR_MESSAGES]);
    }
  });
});
