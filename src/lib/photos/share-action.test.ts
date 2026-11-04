import assert from "node:assert/strict";
import { test } from "node:test";

import { sharePhotoLink, type ShareEnvironment } from "./share-action";

const LINK = { url: "https://mcvv.org/cs/fotogalerie/foto/5039", title: "MCVV 2014" };

function env(over: Partial<ShareEnvironment> = {}) {
  const calls = { share: [] as ShareData[], copy: [] as string[] };
  const value: ShareEnvironment = {
    coarsePointer: true,
    share: async (data) => {
      calls.share.push(data);
    },
    writeText: async (text) => {
      calls.copy.push(text);
    },
    ...over,
  };
  return { value, calls };
}

test("mobile: native share sheet with the permalink, no clipboard", async () => {
  const { value, calls } = env();
  assert.equal(await sharePhotoLink(LINK, value), "shared");
  assert.deepEqual(calls.share, [{ url: LINK.url, title: LINK.title }]);
  assert.deepEqual(calls.copy, []);
});

test("mobile: closing the share sheet is a cancel (no copy, no toast)", async () => {
  const abort = Object.assign(new Error("closed"), { name: "AbortError" });
  const { value, calls } = env({
    share: async () => {
      throw abort;
    },
  });
  assert.equal(await sharePhotoLink(LINK, value), "cancelled");
  assert.deepEqual(calls.copy, []);
});

test("mobile: share failure or canShare=false falls back to copying", async () => {
  const failing = env({
    share: async () => {
      throw new Error("NotAllowedError");
    },
  });
  assert.equal(await sharePhotoLink(LINK, failing.value), "copied");
  assert.deepEqual(failing.calls.copy, [LINK.url]);

  const refused = env({ canShare: () => false });
  assert.equal(await sharePhotoLink(LINK, refused.value), "copied");
  assert.deepEqual(refused.calls.share, []);
});

test("desktop: copies the link even when Web Share exists", async () => {
  const { value, calls } = env({ coarsePointer: false });
  assert.equal(await sharePhotoLink(LINK, value), "copied");
  assert.deepEqual(calls.share, []);
  assert.deepEqual(calls.copy, [LINK.url]);
});

test("no Web Share (mobile Firefox…): clipboard; no clipboard either → failed", async () => {
  const noShare = env({ share: undefined });
  assert.equal(await sharePhotoLink(LINK, noShare.value), "copied");

  const nothing = env({ share: undefined, writeText: undefined });
  assert.equal(await sharePhotoLink(LINK, nothing.value), "failed");

  const denied = env({
    coarsePointer: false,
    writeText: async () => {
      throw new Error("denied");
    },
  });
  assert.equal(await sharePhotoLink(LINK, denied.value), "failed");
});
