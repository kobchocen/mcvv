import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  buildResultListXml,
  competitorStatus,
  escapeXml,
  isoWithOffset,
  sexFromRunnerId,
  splitName,
  type ResultListInput,
} from "./iof-xml";

const zero = new Date("2026-12-06T09:15:00.000Z");
const start = (bib: number) =>
  new Date(zero.getTime() + 15_000 * ((bib > 600 ? bib - 600 : bib) - 1));

function sample(now = new Date("2026-12-06T10:00:00.000Z")): ResultListInput {
  return {
    eventId: "mcvv-2026",
    eventName: "Malá cena Velké Verandy 2026",
    eventStart: zero,
    splitCodes: ["1", "3"],
    createTime: new Date("2026-12-06T10:00:05.000Z"),
    now,
    classes: [
      {
        id: "A",
        name: "muži",
        sex: "M",
        competitors: [
          {
            runnerId: "19800012",
            name: "Novák Jan Petr",
            clubId: "CHC",
            clubName: "K.O.B. Choceň",
            bib: 301,
            startTime: start(301),
            splits: { "1": 245, "3": 530 },
            finishS: 862,
          },
          {
            runnerId: "19900001",
            name: "Dvořák <&> Karel",
            clubId: "000",
            clubName: null,
            bib: 302,
            startTime: start(302),
            splits: { "1": 250 },
            finishS: null,
          },
        ],
      },
      {
        id: "F",
        name: "ženy",
        sex: "F",
        competitors: [
          {
            runnerId: "19955003",
            name: "Svobodová Eva",
            clubId: "111",
            clubName: "SK Lesní běh",
            bib: 930,
            startTime: start(930),
            splits: {},
            finishS: null,
          },
        ],
      },
      { id: "K", name: "žákyně", competitors: [] },
    ],
  };
}

test("isoWithOffset uses the Prague offset (winter +01:00, summer +02:00)", () => {
  assert.equal(isoWithOffset(zero), "2026-12-06T10:15:00+01:00");
  assert.equal(isoWithOffset(new Date("2026-07-01T08:00:00Z")), "2026-07-01T10:00:00+02:00");
  assert.equal(isoWithOffset(new Date("2026-07-01T08:00:00Z"), "UTC"), "2026-07-01T08:00:00+00:00");
});

test("name, sex and escaping helpers", () => {
  assert.deepEqual(splitName(" Novák  Jan Petr "), { family: "Novák", given: "Jan Petr" });
  assert.deepEqual(splitName("Single"), { family: "Single", given: "-" });
  assert.equal(sexFromRunnerId("19955003"), "F");
  assert.equal(sexFromRunnerId("19800012"), "M");
  assert.equal(sexFromRunnerId("bad"), undefined);
  assert.equal(escapeXml(`a<b>&"c'\u0001`), "a&lt;b&gt;&amp;&quot;c&apos;");
});

test("status: finished OK, on course Active, not started Inactive", () => {
  const input = sample();
  const [finished, running] = input.classes[0].competitors;
  const waiting = input.classes[1].competitors[0];
  assert.equal(competitorStatus(finished, input.now), "OK");
  assert.equal(competitorStatus(running, input.now), "Active");
  assert.equal(competitorStatus(waiting, input.now), "Inactive"); // 930 startuje 11:37:15
  assert.equal(competitorStatus(waiting, new Date("2026-12-06T10:38:00Z")), "Active");
});

test("ResultList contains splits, finish and stable ids", () => {
  const xml = buildResultListXml(sample());
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(
    xml,
    /<ResultList xmlns="http:\/\/www.orienteering.org\/datastandard\/3.0"[^>]* iofVersion="3.0"/,
  );
  assert.match(xml, /createTime="2026-12-06T11:00:05\+01:00"/);
  assert.match(xml, /<Id type="MCVV">19800012<\/Id>/);
  assert.match(xml, /<Family>Novák<\/Family><Given>Jan Petr<\/Given>/);
  assert.match(xml, /<StartTime>2026-12-06T11:30:00\+01:00<\/StartTime>/);
  assert.match(xml, /<FinishTime>2026-12-06T11:44:22\+01:00<\/FinishTime>/);
  assert.match(xml, /<Time>862<\/Time>/);
  assert.match(
    xml,
    /<SplitTime><ControlCode>1<\/ControlCode><Time>245<\/Time><\/SplitTime>\s*<SplitTime><ControlCode>3<\/ControlCode><Time>530<\/Time><\/SplitTime>/,
  );
  assert.match(xml, /<Family>Dvořák<\/Family><Given>&lt;&amp;&gt; Karel<\/Given>/);
  // klub 000 (bez klubu) se neposílá, prázdná kategorie se vynechá
  assert.equal((xml.match(/<Organisation>/g) ?? []).length, 2);
  assert.ok(!xml.includes("žákyně"));
  assert.equal((xml.match(/<Status>OK<\/Status>/g) ?? []).length, 1);
  assert.equal((xml.match(/<Status>Active<\/Status>/g) ?? []).length, 1);
  assert.equal((xml.match(/<Status>Inactive<\/Status>/g) ?? []).length, 1);
});

function hasXmllint(): boolean {
  return spawnSync("xmllint", ["--version"]).status === 0;
}

test(
  "ResultList validates against the IOF XML 3.0 XSD",
  { skip: !hasXmllint() && "xmllint not installed" },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "mcvv-iof-"));
    try {
      const file = join(dir, "results.xml");
      writeFileSync(file, buildResultListXml(sample()));
      const xsd = join(import.meta.dirname, "fixtures", "IOF.xsd");
      const result = spawnSync("xmllint", ["--noout", "--nonet", "--schema", xsd, file], {
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
