import assert from "node:assert/strict";
import { test } from "node:test";

import { buildQuickList, withLastClub } from "./quick";

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
