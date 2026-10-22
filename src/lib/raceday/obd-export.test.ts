import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  bib3,
  buildObdExportText,
  findEncodingIssues,
  firstClubRows,
  longClubIds,
  phpLooseEquals,
  phpTrim,
  renderObdExport,
  startWarnings,
  timeConv,
  withTransliteratedNames,
  type ObdExportData,
} from "./obd-export";

const fixture = (name: string) => new URL(`./__fixtures__/${name}`, import.meta.url);
const data = JSON.parse(readFileSync(fixture("obd-synthetic.json"), "utf8")) as ObdExportData;

describe("OBD export – byte-for-byte with legacy prihl2obd.php", () => {
  it("TXT equals the echoed legacy output (windows-1250)", () => {
    const expected = readFileSync(fixture("obd-synthetic.legacy-txt.bin"));
    const actual = Buffer.from(renderObdExport(data, "txt").bytes);
    assert.equal(actual.toString("hex"), expected.toString("hex"));
  });

  it("HTML equals the whole legacy page (windows-1250)", () => {
    const expected = readFileSync(fixture("obd-synthetic.legacy-html.bin"));
    const file = renderObdExport(data, "html");
    assert.equal(Buffer.from(file.bytes).toString("hex"), expected.toString("hex"));
    assert.equal(file.contentType, "text/html; charset=windows-1250");
    assert.equal(file.filename, "prihl2obd-2026.html");
  });

  it("writes Czech letters as single windows-1250 bytes", () => {
    const bytes = renderObdExport(
      {
        year: 2026,
        categories: [{ id: "A", name: "muži", record: 885 }],
        clubs: [],
        runners: [],
        starts: [],
      },
      "txt",
    ).bytes;
    // "ž" = 0x9E in windows-1250
    assert.ok(Buffer.from(bytes).includes(Buffer.from([0x6d, 0x75, 0x9e, 0x69])));
  });
});

describe("legacy helpers", () => {
  it("timeConv matches PHP floor/sprintf", () => {
    assert.equal(timeConv(0), "0:00");
    assert.equal(timeConv(59), "0:59");
    assert.equal(timeConv(60), "1:00");
    assert.equal(timeConv(885), "14:45");
    assert.equal(timeConv(6000), "100:00");
  });
  it("bib3 matches sprintf('%03d')", () => {
    assert.equal(bib3(5), "005");
    assert.equal(bib3(99), "099");
    assert.equal(bib3(601), "601");
    assert.equal(bib3(1000), "1000");
  });
  it("phpTrim trims only PHP whitespace", () => {
    assert.equal(phpTrim(" \tA\n\0\x0B"), "A");
    assert.equal(phpTrim("\u00a0A\u00a0"), "\u00a0A\u00a0");
  });
  it("phpLooseEquals compares numeric strings as numbers", () => {
    assert.ok(phpLooseEquals("010", "10"));
    assert.ok(phpLooseEquals("10", "1e1"));
    assert.ok(!phpLooseEquals("CHC", "chc"));
    assert.ok(!phpLooseEquals("000", ""));
  });
  it("one #oddily line per club id (newest year first in input)", () => {
    assert.deepEqual(
      firstClubRows(data.clubs).map((row) => row.id),
      ["000", "010", "CHC", "LPU", "ÚOL", "ZZZ"],
    );
    assert.match(buildObdExportText(data), /\nCHC;K\.O\.B\. Choceň\n/);
  });
});

describe("encoding issues", () => {
  const broken: ObdExportData = {
    year: 2026,
    categories: [],
    clubs: [{ id: "ABC", name: "Klub ș €" }],
    runners: [
      { id: "20000001", name: "Ştefan Ionuț" },
      { id: "20000002", name: "Tanaka 田中" },
    ],
    starts: [],
  };
  it("lists records that cannot be written (no silent '?')", () => {
    const issues = findEncodingIssues(broken);
    assert.deepEqual(
      issues.map((issue) => [issue.section, issue.id, issue.chars]),
      [
        ["oddily", "ABC", ["ș"]],
        ["bezci", "20000001", ["ț"]],
        ["bezci", "20000002", ["田", "中"]],
      ],
    );
    assert.throws(() => renderObdExport(broken, "txt"), RangeError);
  });
  it("replacement drops unsupported diacritics only on request", () => {
    const fixed = withTransliteratedNames(broken);
    assert.equal(fixed.runners[0]!.name, "Ştefan Ionut");
    assert.equal(fixed.clubs[0]!.name, "Klub s €");
    assert.equal(fixed.runners[1]!.name, "Tanaka ??");
    assert.doesNotThrow(() => renderObdExport(fixed, "txt"));
    assert.deepEqual(findEncodingIssues(data), []);
  });
});

describe("start list warnings", () => {
  it("reports duplicate bibs and cancelled entries", () => {
    const warnings = startWarnings(data.starts, new Set(["20105004"]));
    assert.deepEqual(warnings, [
      { kind: "cancelled_registration", bib: 100, runnerId: "20105004" },
      { kind: "duplicate_bib", bib: 5, runnerIds: ["19900002", "19805001"] },
    ]);
  });
});

describe("club ids longer than 3 characters (#104, varchar(8))", () => {
  it("today's data (fixture) has none – export bytes unchanged", () => {
    assert.deepEqual(longClubIds(data), []);
  });

  it("an id 1000+ is written as it is, but reported so the export can stop", () => {
    const withLong: ObdExportData = {
      ...data,
      clubs: [...data.clubs, { id: "1000", name: "Nový klub" }],
      starts: [
        ...data.starts,
        { runnerId: "19900001", clubId: "1000", categoryId: "A", year: data.year, bib: 999 },
      ],
    };
    assert.deepEqual(longClubIds(withLong), ["1000"]);
    const text = buildObdExportText(withLong);
    assert.match(text, /\n1000;Nový klub\n/);
    assert.match(text, /\n19900001;1000;A;\d+;999\n$/);
  });
});
