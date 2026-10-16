import assert from "node:assert/strict";
import { test } from "node:test";

import { isPortraitMeta, pickGalleryPhotoIds } from "./gallery";

const fixed = () => 0;

test("isPortraitMeta uses stored dimensions only", () => {
  assert.equal(isPortraitMeta({ id: 1, width: 300, height: 400 }), true);
  assert.equal(isPortraitMeta({ id: 1, width: 400, height: 300 }), false);
  assert.equal(isPortraitMeta({ id: 1, width: null, height: null }), null);
});

test("pickGalleryPhotoIds prefers portrait photos", () => {
  const photos = [
    ...Array.from({ length: 8 }, (_, i) => ({ id: i + 1, width: 3, height: 4 })),
    { id: 100, width: null, height: null },
    { id: 200, width: 4, height: 3 },
  ];
  const ids = pickGalleryPhotoIds(photos, 7, fixed);
  assert.equal(ids.length, 7);
  assert.ok(ids.every((id) => id <= 8));
});

test("pickGalleryPhotoIds falls back to unknown, then landscape", () => {
  const photos = [
    { id: 1, width: 3, height: 4 },
    { id: 2, width: null, height: null },
    { id: 3, width: 4, height: 3 },
  ];
  assert.deepEqual(pickGalleryPhotoIds(photos, 2, fixed), [1, 2]);
  assert.deepEqual(pickGalleryPhotoIds(photos, 5, fixed), [1, 2, 3]);
  assert.deepEqual(pickGalleryPhotoIds([], 7, fixed), []);
});
