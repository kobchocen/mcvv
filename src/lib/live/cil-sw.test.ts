import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

/**
 * Service worker stanic v cíli (#366): stránka /{locale}/cil jde otevřít bez signálu,
 * API (hlavně /api/live/finish) se nikdy necachuje.
 */
type Handler = (event: Record<string, unknown>) => void;

function loadWorker() {
  const handlers: Record<string, Handler> = {};
  const self = {
    location: new URL("https://dev.mcvv.org/cil-sw.js"),
    registration: { scope: "https://dev.mcvv.org/cs/cil" },
    addEventListener: (type: string, handler: Handler) => {
      handlers[type] = handler;
    },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
  const source = readFileSync(new URL("../../../public/cil-sw.js", import.meta.url), "utf8");
  vm.runInNewContext(source, {
    self,
    URL,
    Promise,
    caches: {
      open: () => Promise.resolve({ put: () => undefined, add: () => Promise.resolve() }),
      match: () => Promise.resolve(undefined),
      keys: () => Promise.resolve([]),
    },
    fetch: () => Promise.reject(new Error("offline")),
  });
  return handlers;
}

function handles(url: string, mode = "navigate", method = "GET"): boolean {
  const { fetch } = loadWorker();
  let responded = false;
  fetch({
    request: { url, mode, method },
    respondWith: (value: Promise<unknown>) => {
      responded = true;
      void Promise.resolve(value).catch(() => undefined);
    },
  });
  return responded;
}

test("stránka cíle se obsluhuje ze service workeru ve všech jazycích", () => {
  for (const locale of ["cs", "en", "de", "pl", "uk"]) {
    assert.equal(handles(`https://dev.mcvv.org/${locale}/cil`), true, locale);
  }
  assert.equal(handles("https://dev.mcvv.org/cs/cil/"), true);
});

test("API cíle a hodin se nikdy necachuje", () => {
  assert.equal(handles("https://dev.mcvv.org/api/live/finish", "cors", "GET"), false);
  assert.equal(handles("https://dev.mcvv.org/api/live/finish", "cors", "POST"), false);
  assert.equal(handles("https://dev.mcvv.org/api/live/clock", "cors"), false);
});

test("jiné stránky a cizí domény service worker nechává být", () => {
  assert.equal(handles("https://dev.mcvv.org/cs/admin"), false);
  assert.equal(handles("https://dev.mcvv.org/cs/cilovka"), false);
  assert.equal(handles("https://example.com/cs/cil"), false);
});

test("statické soubory Next.js jdou z cache", () => {
  assert.equal(handles("https://dev.mcvv.org/_next/static/chunks/app.js", "no-cors"), true);
});
