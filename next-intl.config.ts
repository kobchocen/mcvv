import { defineRouting } from "next-intl/routing";

export default defineRouting({
  locales: ["cs", "en"],
  defaultLocale: "cs",
  localePrefix: "always",
  pathnames: {
    "/": "/",
    "/program": "/program",
    "/prihlasky": "/prihlasky",
    "/pokyny": "/pokyny",
    "/startovka": "/startovka",
    "/kontakt": "/kontakt",
    "/results": "/results",
    "/statistiky/[slug]": "/statistiky/[slug]",
    "/bezec/[id]": "/bezec/[id]",
    "/fotogalerie": "/fotogalerie",
    "/prihlaseni": "/prihlaseni",
    "/admin": "/admin",
    "/admin/partneri": "/admin/partneri",
    "/admin/partneri/novy": "/admin/partneri/novy",
    "/admin/partneri/[id]": "/admin/partneri/[id]",
    "/admin/rocniky": "/admin/rocniky",
    "/admin/rocniky/novy": "/admin/rocniky/novy",
    "/admin/rocniky/[id]": "/admin/rocniky/[id]",
    "/admin/ciselniky": "/admin/ciselniky",
  },
});
