import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_START_MODEL, startModelFromEdition, startTimeForBib } from "@/lib/race/start-time";

import {
  bibCategoryLabel,
  bibGivenNameFirst,
  bibSurname,
  buildBibCard,
  buildBlankBibCard,
  parseBibList,
  parseBibPrintParams,
  participationColor,
  sortBibRows,
  veteranMinStarts,
  type BuildBibOptions,
} from "./bibs-core";

const options: BuildBibOptions = {
  mode: "all",
  year: 2026,
  model: DEFAULT_START_MODEL,
  championBibs: [400, 950],
  veterans: new Map([["19750101", 33]]),
  logoCount: 15,
};

describe("start time on the bib (legacy tiskcisel.php / #114)", () => {
  const cases: [number, string][] = [
    [1, "10:15:00"],
    [41, "10:25:00"],
    [301, "11:30:00"],
    [601, "10:15:00"],
    [641, "10:25:00"],
    [901, "11:30:00"],
  ];
  for (const [bib, time] of cases) {
    it(`bib ${bib} → ${time}`, () => assert.equal(buildBlankBibCard(bib, options).startTime, time));
  }
  it("uses the edition start model (zero, interval, 2nd start) via startTimeForBib", () => {
    const at = (edition: Parameters<typeof startModelFromEdition>[0], bib: number) =>
      buildBlankBibCard(bib, { ...options, model: startModelFromEdition(edition) }).startTime;
    assert.equal(at({ startInterval: 20 }, 4), "10:16:00");
    assert.equal(at({ startInterval: null }, 4), "10:15:45");
    const edition = { startZeroSeconds: 11 * 3600, startInterval: 30, secondStartFrom: 501 };
    assert.equal(at(edition, 501), "11:00:00");
    assert.equal(at(edition, 503), "11:01:00");
    for (const bib of [1, 77, 501, 640]) {
      assert.equal(at(edition, bib), startTimeForBib(startModelFromEdition(edition), bib));
    }
  });
});

describe("bib cards", () => {
  it("colours: veteran green with starts, champion red, otherwise black", () => {
    const row = {
      runnerId: "19750101",
      name: "Švadlena  Pavel",
      categoryId: "C",
      categoryName: "muži nad 50 let",
      birthYear: "1975",
      registrationId: 7,
    };
    const veteran = buildBibCard({ ...row, bib: 131 }, options);
    assert.equal(veteran.color, "forest");
    assert.equal(veteran.veteranStarts, 33);
    assert.equal(veteran.surname, "ŠVADLENA");
    assert.equal(veteran.fullName, "ŠVADLENA PAVEL");
    assert.equal(veteran.category, "MUŽI NAD 50 LET");
    assert.equal(veteran.birthYear, "1975");
    assert.equal(veteran.startTime, "10:47:30");
    assert.equal(veteran.logoIndex, 131 % 15);
    assert.equal(buildBibCard({ ...row, bib: 400 }, options).color, "orange");
    assert.equal(buildBibCard({ ...row, runnerId: "x", bib: 41 }, options).color, "black");
  });

  it("blank cards have no name and the title without year", () => {
    const card = buildBlankBibCard(381, { ...options, mode: "blank" });
    assert.equal(card.blank, true);
    assert.equal(card.fullName, "");
    assert.equal(card.title, "MALÁ CENA VELKÉ VERANDY");
    assert.deepEqual(card.titleColor, [0xdd, 0x11, 0x22]);
  });

  it("surname is the first word", () => {
    assert.equal(bibSurname("Nováková-Malá Jana Marie"), "NOVÁKOVÁ-MALÁ");
    assert.equal(bibSurname("Cher"), "CHER");
  });

  it("legacy order = registration, then bib", () => {
    const rows = [
      {
        bib: 50,
        runnerId: "a",
        name: "A",
        categoryId: "J",
        categoryName: "žáci",
        birthYear: null,
        registrationId: 2,
      },
      {
        bib: 300,
        runnerId: "b",
        name: "B",
        categoryId: "A",
        categoryName: "muži",
        birthYear: null,
        registrationId: 1,
      },
      {
        bib: 41,
        runnerId: "c",
        name: "C",
        categoryId: "J",
        categoryName: "žáci",
        birthYear: null,
        registrationId: 2,
      },
    ];
    assert.deepEqual(
      sortBibRows(rows, "registration").map((row) => row.bib),
      [300, 41, 50],
    );
    assert.deepEqual(
      sortBibRows(rows, "bib").map((row) => row.bib),
      [41, 50, 300],
    );
  });

  it("veteran threshold matches the statistics page (more than half of the editions)", () => {
    assert.equal(veteranMinStarts(33), 17);
    assert.equal(veteranMinStarts(34), 18);
  });
});

describe("category label and participation colours", () => {
  it("prints the category in words, uppercase", () => {
    assert.equal(bibCategoryLabel("muži nad 40 let"), "MUŽI NAD 40 LET");
    assert.equal(bibCategoryLabel("C"), "C");
  });

  it("puts the given name first on the small name line", () => {
    assert.equal(bibGivenNameFirst("Novák Jan"), "JAN NOVÁK");
    assert.equal(bibGivenNameFirst("Nováková-Malá Jana Marie"), "JANA MARIE NOVÁKOVÁ-MALÁ");
    assert.equal(bibGivenNameFirst("Cher"), "CHER");
  });

  it("colours the participation count: forest for veterans, orange for men's/women's champions", () => {
    assert.equal(participationColor(false, 35), "forest");
    assert.equal(participationColor(true, 35), "orange");
    assert.equal(participationColor(true, null), "orange");
    assert.equal(participationColor(false, null), "black");
  });
});

describe("parseBibList / parseBibPrintParams", () => {
  it("parses lists and ranges", () => {
    assert.deepEqual(parseBibList("321, 1; 41-43 41"), [1, 41, 42, 43, 321]);
    assert.deepEqual(parseBibList(""), []);
    assert.equal(parseBibList("12a"), null);
    assert.equal(parseBibList("50-40"), null);
    assert.equal(parseBibList("1-5000"), null);
  });

  it("validates request params", () => {
    const all = parseBibPrintParams(new URLSearchParams("mode=all&offset=100&limit=100"));
    assert.deepEqual(all, {
      mode: "all",
      order: "registration",
      offset: 100,
      limit: 100,
      bibs: [],
      championBibs: null,
    });
    assert.deepEqual(
      parseBibPrintParams(new URLSearchParams("mode=selected&bibs=5&red="))?.championBibs,
      [],
    );
    assert.equal(parseBibPrintParams(new URLSearchParams("mode=selected")), null);
    assert.equal(parseBibPrintParams(new URLSearchParams("mode=x")), null);
    assert.equal(parseBibPrintParams(new URLSearchParams("limit=0")), null);
  });
});
