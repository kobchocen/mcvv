import { defineRouting } from "next-intl/routing";

export default defineRouting({
  locales: ["cs", "en"],
  defaultLocale: "cs",
  localePrefix: "always",
  pathnames: {
    "/": "/",
  },
});
