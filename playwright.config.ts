import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "https://dev.mcvv.org",
    httpCredentials: {
      username: process.env.STG_BASIC_USER ?? "",
      password: process.env.STG_BASIC_PASS ?? "",
    },
    locale: "cs-CZ",
  },
  reporter: [["list"]],
});
