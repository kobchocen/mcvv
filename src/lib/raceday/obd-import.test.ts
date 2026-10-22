import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { encodeWindows1250 } from "@/lib/encoding/windows-1250";

import {
  decodeObdFile,
  ObdDecodeError,
  parseClubsFile,
  parseRaceFile,
  parseRunnersFile,
  splitObdLines,
} from "./obd-csv";
import {
  clubKey,
  planPresentationImport,
  planResultsImport,
  presentationHasChanges,
  type PresentationSnapshot,
  type ResultsSnapshot,
} from "./obd-import";

/* Syntetická data (žádní skuteční účastníci). */
const YEAR = 2026;
const CATEGORIES = new Set(["H", "D", "M"]);

const cp1250 = (text: string) => encodeWindows1250(text.replace(/\n/g, "\r\n"));
const lines = (text: string) => splitObdLines(decodeObdFile(cp1250(text)).text);

function presentationSnapshot(overrides: Partial<PresentationSnapshot> = {}): PresentationSnapshot {
  return {
    year: YEAR,
    runners: new Map([
      ["90000001", "Testová Žofie"],
      ["90000002", "Příkladný Šimon"],
    ]),
    clubsThisYear: new Map([[clubKey("TST"), { id: "TST", name: "Testovací klub" }]]),
    clubsOtherYears: new Map([[clubKey("OLD"), { id: "OLD", name: "Starý klub" }]]),
    registrationBibs: new Map<string, number | null>([
      ["90000001", 601],
      ["90000002", null],
    ]),
    currentStart: [],
    ...overrides,
  };
}

describe("decodeObdFile", () => {
  it("reads windows-1250 as written by OBD", () => {
    const decoded = decodeObdFile(cp1250("90000001;Řeřicha Ďáblík\n"));
    assert.equal(decoded.encoding, "windows-1250");
    assert.equal(decoded.text, "90000001;Řeřicha Ďáblík\r\n");
  });

  it("detects UTF-8 with and without BOM", () => {
    const utf8 = new TextEncoder().encode("90000001;Řeřicha\n");
    assert.equal(decodeObdFile(utf8).encoding, "utf-8");
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);
    assert.deepEqual(decodeObdFile(bom), { text: "90000001;Řeřicha\n", encoding: "utf-8-bom" });
  });

  it("rejects bytes undefined in windows-1250", () => {
    assert.throws(() => decodeObdFile(new Uint8Array([0x41, 0x81, 0x42])), ObdDecodeError);
  });

  it("plain ASCII stays windows-1250", () => {
    assert.equal(decodeObdFile(cp1250("a;b\n")).encoding, "windows-1250");
  });
});

describe("splitObdLines", () => {
  it("skips blank lines, keeps line numbers, unquotes fields", () => {
    assert.deepEqual(splitObdLines('\r\n90000001;"Testová ""Žofka"""\r\n\r\nX;Y\r\n'), [
      { line: 2, fields: ["90000001", 'Testová "Žofka"'] },
      { line: 4, fields: ["X", "Y"] },
    ]);
  });
});

describe("dictionary files", () => {
  it("parses cis_bezec and reports invalid rows", () => {
    const parsed = parseRunnersFile(
      lines(
        "90000003;Nová Věra\n1234;Krátký\n90000004;\n90000003;Znovu\n90000005;" + "x".repeat(51),
      ),
    );
    assert.deepEqual(parsed.rows, [{ line: 1, id: "90000003", name: "Nová Věra" }]);
    assert.deepEqual(
      parsed.errors.map((error) => [error.line, error.code]),
      [
        [2, "runner_id"],
        [3, "name_empty"],
        [4, "duplicate_id"],
        [5, "name_long"],
      ],
    );
  });

  it("parses cis_klub incl. club 000 with an empty name", () => {
    const parsed = parseClubsFile(
      lines("000;\nNEW;Nový oddíl\ntst;Duplicitní\nTST;Testovací klub\nTOOLONGID;x"),
    );
    assert.deepEqual(
      parsed.rows.map((row) => row.id),
      ["000", "NEW", "tst"],
    );
    assert.deepEqual(
      parsed.errors.map((error) => error.code),
      ["duplicate_id", "club_id"],
    );
  });
});

describe("race files", () => {
  const context = { year: YEAR, categoryIds: CATEGORIES };

  it("start.csv: bezec;klub;kateg;rok;cislo", () => {
    const parsed = parseRaceFile(
      "start",
      lines(
        [
          "90000001;TST;D;2026;601",
          "90000002;TST;H;2026;601",
          "90000003;TST;X;2026;7",
          "90000004;TST;H;2025;8",
          "90000005;TST;H;2026;0",
          "90000001;TST;D;2026;9",
          "90000006;TST;H",
        ].join("\n"),
      ),
      context,
    );
    assert.equal(parsed.rows.length, 1);
    assert.deepEqual(
      parsed.errors.map((error) => error.code),
      ["duplicate_bib", "category", "year", "bib", "duplicate_runner", "columns"],
    );
  });

  it("kon_vysl.csv: bezec;rok;klub;kateg;time (same time allowed twice)", () => {
    const parsed = parseRaceFile(
      "kon_vysl",
      lines("90000001;2026;TST;D;1234\n90000002;2026;TST;H;1234\n90000003;2026;TST;H;1,5"),
      context,
    );
    assert.deepEqual(
      parsed.rows.map((row) => [row.runnerId, row.clubId, row.categoryId, row.value]),
      [
        ["90000001", "TST", "D", 1234],
        ["90000002", "TST", "H", 1234],
      ],
    );
    assert.deepEqual(
      parsed.errors.map((error) => error.code),
      ["time"],
    );
  });
});

describe("planPresentationImport", () => {
  const context = { year: YEAR, categoryIds: CATEGORIES };

  it("adds new runners/clubs, copies old-year clubs, builds start with names", () => {
    const runners = parseRunnersFile(
      lines("90000001;Testová Žofie\n90000003;Nová Věra\n90000002;Přejmenovaný"),
    );
    const clubs = parseClubsFile(lines("TST;Testovací klub\nNEW;Nový oddíl"));
    const starts = parseRaceFile(
      "start",
      lines("90000001;TST;D;2026;602\n90000003;NEW;D;2026;603\n90000002;OLD;H;2026;604"),
      context,
    );
    const plan = planPresentationImport(presentationSnapshot(), {
      runners: runners.rows,
      clubs: clubs.rows,
      starts: starts.rows,
    });
    assert.deepEqual(plan.errors, []);
    assert.deepEqual(plan.newRunners, [{ id: "90000003", name: "Nová Věra" }]);
    assert.deepEqual(plan.runnerNameDiffs, [
      { id: "90000002", current: "Příkladný Šimon", file: "Přejmenovaný" },
    ]);
    assert.deepEqual(plan.newClubs, [{ id: "NEW", name: "Nový oddíl" }]);
    assert.deepEqual(plan.copiedClubs, [{ id: "OLD", name: "Starý klub" }]);
    assert.ok(plan.start);
    assert.deepEqual(plan.start.bibChanges, [{ runnerId: "90000001", from: 601, to: 602 }]);
    assert.deepEqual(plan.start.walkIns, ["90000003"]);
    assert.deepEqual(
      plan.start.rows.map((row) => [row.bib, row.runnerName, row.clubName]),
      [
        [602, "Testová Žofie", "Testovací klub"],
        [603, "Nová Věra", "Nový oddíl"],
        [604, "Příkladný Šimon", "Starý klub"],
      ],
    );
    assert.equal(presentationHasChanges(plan), true);
  });

  it("is idempotent: the same files against the imported state change nothing", () => {
    const starts = parseRaceFile("start", lines("90000001;TST;D;2026;601"), context);
    const plan = planPresentationImport(
      presentationSnapshot({
        currentStart: [
          {
            runnerId: "90000001",
            clubId: "TST",
            categoryId: "D",
            bib: 601,
            runnerName: "Testová Žofie",
            clubName: "Testovací klub",
          },
        ],
      }),
      { runners: parseRunnersFile(lines("90000001;Testová Žofie")).rows, starts: starts.rows },
    );
    assert.equal(plan.start?.unchanged, true);
    assert.equal(presentationHasChanges(plan), false);
  });

  it("reports unknown runners and clubs; the hash follows the current start list", () => {
    const starts = parseRaceFile(
      "start",
      lines("90000009;TST;H;2026;10\n90000001;ZZZ;D;2026;11"),
      context,
    );
    const plan = planPresentationImport(presentationSnapshot(), { starts: starts.rows });
    assert.deepEqual(
      plan.errors.map((error) => error.code),
      ["unknown_runner", "unknown_club"],
    );
    const again = planPresentationImport(presentationSnapshot(), { starts: starts.rows });
    assert.equal(plan.hash, again.hash);
    const other = planPresentationImport(
      presentationSnapshot({
        currentStart: [
          {
            runnerId: "90000002",
            clubId: "TST",
            categoryId: "H",
            bib: 5,
            runnerName: null,
            clubName: null,
          },
        ],
      }),
      { starts: starts.rows },
    );
    assert.notEqual(plan.hash, other.hash);
  });
});

describe("planResultsImport", () => {
  const snapshot: ResultsSnapshot = {
    ...presentationSnapshot(),
    categories: new Map([
      ["D", "Ženy"],
      ["H", "Muži"],
    ]),
    startBibs: new Map([
      ["90000001", 601],
      ["90000002", 1],
    ]),
    finishTimes: new Map([[601, 1230]]),
    currentResults: [],
  };
  const context = { year: YEAR, categoryIds: new Set(snapshot.categories.keys()) };

  it("fills club names (legacy bug) and compares with finish splits", () => {
    const parsed = parseRaceFile(
      "kon_vysl",
      lines("90000001;2026;TST;D;1234\n90000002;2026;OLD;H;1500"),
      context,
    );
    const plan = planResultsImport(snapshot, parsed.rows);
    assert.deepEqual(plan.errors, []);
    assert.deepEqual(
      plan.rows.map((row) => [row.runnerName, row.clubName, row.time]),
      [
        ["Testová Žofie", "Testovací klub", 1234],
        ["Příkladný Šimon", "Starý klub", 1500],
      ],
    );
    assert.deepEqual(plan.copiedClubs, [{ id: "OLD", name: "Starý klub" }]);
    assert.deepEqual(plan.splitDiffs, [
      { runnerId: "90000001", bib: 601, official: 1234, split: 1230 },
    ]);
    assert.equal(plan.withoutSplit, 1);
    assert.deepEqual(
      plan.perCategory.map((c) => [c.categoryId, c.count]),
      [
        ["D", 1],
        ["H", 1],
      ],
    );
    assert.equal(plan.unchanged, false);
  });

  it("is idempotent against already imported results", () => {
    const parsed = parseRaceFile("kon_vysl", lines("90000001;2026;TST;D;1234"), context);
    const plan = planResultsImport(
      {
        ...snapshot,
        currentResults: [
          {
            runnerId: "90000001",
            clubId: "TST",
            categoryId: "D",
            time: 1234,
            runnerName: "Testová Žofie",
            clubName: "Testovací klub",
          },
        ],
      },
      parsed.rows,
    );
    assert.equal(plan.unchanged, true);
    assert.equal(plan.replaced, 1);
  });

  it("reports runners missing from the register and from the start list", () => {
    const parsed = parseRaceFile("kon_vysl", lines("90000077;2026;TST;H;999"), context);
    const plan = planResultsImport(snapshot, parsed.rows);
    assert.deepEqual(
      plan.errors.map((error) => error.code),
      ["unknown_runner"],
    );
  });
});
