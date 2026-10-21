import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decodeWindows1250,
  encodeWindows1250,
  transliterateToWindows1250,
  unencodableChars,
} from "./windows-1250";

const CZECH = "ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽáčďéěíňóřšťúůýž";

describe("windows-1250", () => {
  it("round-trips Czech letters and matches the platform decoder", () => {
    const bytes = encodeWindows1250(CZECH);
    assert.equal(bytes.length, [...CZECH].length);
    assert.equal(decodeWindows1250(bytes), CZECH);
    assert.equal(new TextDecoder("windows-1250").decode(bytes), CZECH);
  });
  it("matches the platform decoder for every defined byte", () => {
    const platform = new TextDecoder("windows-1250");
    for (let byte = 0; byte < 256; byte += 1) {
      if ([0x81, 0x83, 0x88, 0x90, 0x98].includes(byte)) {
        assert.throws(() => decodeWindows1250(Uint8Array.of(byte)), RangeError);
        continue;
      }
      const char = platform.decode(Uint8Array.of(byte));
      assert.equal(decodeWindows1250(Uint8Array.of(byte)), char, `byte ${byte}`);
      assert.deepEqual([...encodeWindows1250(char)], [byte], `char ${char}`);
    }
  });
  it("refuses characters outside windows-1250", () => {
    assert.throws(() => encodeWindows1250("ș"), RangeError);
    assert.deepEqual(unencodableChars("Ionuț Ștefan ț"), ["ț", "Ș"]);
  });
  it("transliterates only what cannot be written", () => {
    assert.equal(transliterateToWindows1250("Žluťoučký ș"), "Žluťoučký s");
    assert.equal(transliterateToWindows1250("c\u030C"), "č");
    assert.equal(transliterateToWindows1250("😀"), "?");
  });
});
