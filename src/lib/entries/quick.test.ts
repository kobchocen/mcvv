import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildQuickList,
  compareQuick,
  QUICK_RUNNER_ID,
  quickLabels,
  splitQuickHidden,
  withLastClub,
} from "./quick";

test("quick list is sorted by surname, then first name, Czech collation", () => {
  const list = buildQuickList([
    { id: "19900001", name: "Čermák Petr" },
    { id: "19900002", name: "Chalupa Adam" },
    { id: "19900003", name: "Hruška Jan" },
    { id: "19900004", name: "Cibulka Zdeněk" },
    { id: "19900005", name: "Cibulka Adam" },
    { id: "19900006", name: "Šťastný Ivo" },
    { id: "19900007", name: "Sýkora Ota" },
  ]);
  // Czech: C < Č < H < Ch < S < Š
  assert.deepEqual(
    list.map((row) => row.name),
    [
      "Cibulka Adam",
      "Cibulka Zdeněk",
      "Čermák Petr",
      "Hruška Jan",
      "Chalupa Adam",
      "Sýkora Ota",
      "Šťastný Ivo",
    ],
  );
});

test("same runner id is listed once; namesakes stay separate, ordered by birth year", () => {
  const list = buildQuickList([
    { id: "20150002", name: "Komárek Josef" },
    { id: "19800025", name: "Komárek Josef" },
    { id: "19800025", name: "Komárek Josef" },
    { id: "19700001", name: "Adámek Karel" },
  ]);
  assert.deepEqual(list, [
    { id: "19700001", name: "Adámek Karel" },
    { id: "19800025", name: "Komárek Josef" },
    { id: "20150002", name: "Komárek Josef" },
  ]);
});

test("quick add prefills the club id from the runner's latest registration", () => {
  const runners = [
    { id: "19900001", name: "Čermák Petr" },
    { id: "19900002", name: "Chalupa Adam" },
    { id: "19900003", name: "Hruška Jan" },
  ];
  const list = withLastClub(runners, [
    { runnerId: "19900001", year: 2023, clubId: "CHC", clubName: "K.O.B. Choceň" },
    { runnerId: "19900001", year: 2025, clubId: "412", clubName: "Běžci Vysoké Mýto" },
    { runnerId: "19900002", year: 2025, clubId: "000", clubName: "" },
    { runnerId: "19900002", year: 2024, clubId: "CHC", clubName: "K.O.B. Choceň" },
  ]);
  assert.deepEqual(list, [
    { id: "19900001", name: "Čermák Petr", clubId: "412", clubName: "Běžci Vysoké Mýto" },
    { id: "19900002", name: "Chalupa Adam", clubId: "CHC", clubName: "K.O.B. Choceň" },
    { id: "19900003", name: "Hruška Jan" },
  ]);
});

test("hidden runners are split off the quick list, order kept, unknown ids ignored", () => {
  const list = buildQuickList([
    { id: "19800025", name: "Komárek Josef" },
    { id: "20150002", name: "Komárek Josef" },
    { id: "19685008", name: "Barcalová Iva" },
  ]);
  const { visible, hidden } = splitQuickHidden(list, ["20150002", "19990001"]);
  assert.deepEqual(
    visible.map((row) => row.id),
    ["19685008", "19800025"],
  );
  assert.deepEqual(
    hidden.map((row) => row.id),
    ["20150002"],
  );
  assert.deepEqual(splitQuickHidden(list, []).hidden, []);
});

test("namesakes (same name, different runner) get the birth year in the label", () => {
  const labels = quickLabels([
    { id: "19800025", name: "Komárek Josef" },
    { id: "20150002", name: "Komárek Josef " },
    { id: "19685008", name: "Barcalová Iva" },
  ]);
  assert.equal(labels.get("19800025"), "Komárek Josef (1980)");
  assert.equal(labels.get("20150002"), "Komárek Josef (2015)");
  assert.equal(labels.get("19685008"), "Barcalová Iva");
});

test("compareQuick matches buildQuickList order (client re-sorts after undo)", () => {
  const rows = [
    { id: "20150002", name: "Komárek Josef" },
    { id: "19685008", name: "Barcalová Iva" },
    { id: "19800025", name: "Komárek Josef" },
  ];
  assert.deepEqual([...rows].sort(compareQuick), buildQuickList(rows));
});

test("quick runner id: birth year + 4 characters", () => {
  assert.ok(QUICK_RUNNER_ID.test("19800025"));
  assert.ok(QUICK_RUNNER_ID.test("1979Q904"));
  assert.ok(!QUICK_RUNNER_ID.test("1980002"));
  assert.ok(!QUICK_RUNNER_ID.test("1980002' OR 1=1"));
  assert.ok(!QUICK_RUNNER_ID.test("abcd0001"));
});
