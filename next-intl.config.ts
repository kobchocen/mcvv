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
  },
});
