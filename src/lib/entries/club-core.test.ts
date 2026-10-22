import assert from "node:assert/strict";
import { test } from "node:test";

import { buildClubOptions, type ClubOptionRow } from "./club-options";
import { resolveClubWith, type ClubStore } from "./club-core";

function memoryStore(initial: ClubOptionRow[], nextId = "646") {
  const rows = [...initial];
  const created: ClubOptionRow[] = [];
  const latest = (list: ClubOptionRow[]) => [...list].sort((a, b) => b.year - a.year)[0] ?? null;
  const store: ClubStore = {
    ensureEmptyClub: async () => "000",
    findInYear: async (id, year) => rows.find((row) => row.id === id && row.year === year) ?? null,
    findLatest: async (id) => latest(rows.filter((row) => row.id === id)),
    findInYearByName: async (year, name) =>
      rows.find((row) => row.year === year && row.name === name) ?? null,
    findLatestByName: async (name) => latest(rows.filter((row) => row.name === name)),
    options: async () => buildClubOptions(rows),
    create: async (row) => {
      rows.push(row);
      created.push(row);
    },
    nextNumericId: async () => nextId,
  };
  return { store, created };
}

const base: ClubOptionRow[] = [
  { id: "CHC", year: 2025, name: "K.O.B. Choceň" },
  { id: "216", year: 2025, name: "K.O.B. Choceň" },
  { id: "412", year: 2024, name: "Běžci Vysoké Mýto" },
  { id: "412", year: 2019, name: "Běžci VM" },
  { id: "300", year: 2026, name: "SK Letos" },
];

test("an explicit clubId wins and gets this year's row with its newest name", async () => {
  const { store, created } = memoryStore(base);
  const club = await resolveClubWith(store, "cokoli", 2026, "412");
  assert.deepEqual(club, { id: "412", name: "Běžci Vysoké Mýto", created: false });
  assert.deepEqual(created, [{ id: "412", year: 2026, name: "Běžci Vysoké Mýto" }]);
});

test("an unknown clubId is ignored and the text decides", async () => {
  const { store } = memoryStore(base);
  const club = await resolveClubWith(store, "SK Letos", 2026, "XYZ");
  assert.deepEqual(club, { id: "300", name: "SK Letos", created: false });
});

test("a choice from the list resolves to its id, also for a shared name", async () => {
  const { store, created } = memoryStore(base);
  assert.equal((await resolveClubWith(store, "K.O.B. Choceň (216)", 2026)).id, "216");
  assert.equal((await resolveClubWith(store, "běžci vysoké mýto", 2026)).id, "412");
  assert.deepEqual(
    created.map((row) => row.id),
    ["216", "412"],
  );
});

test("an old name of an id reuses that id, the year row keeps the newest name", async () => {
  const { store, created } = memoryStore(base);
  const club = await resolveClubWith(store, "Běžci VM", 2026);
  assert.deepEqual(club, { id: "412", name: "Běžci Vysoké Mýto", created: false });
  assert.equal(created.length, 1);
});

test("an existing year row is reused, nothing is created", async () => {
  const { store, created } = memoryStore(base);
  assert.deepEqual(await resolveClubWith(store, "SK Letos", 2026), {
    id: "300",
    name: "SK Letos",
    created: false,
  });
  assert.equal(created.length, 0);
});

test("a new name creates a new id and reports created", async () => {
  const { store, created } = memoryStore(base);
  const club = await resolveClubWith(store, "  Nový   oddíl ", 2026);
  assert.deepEqual(club, { id: "646", name: "Nový oddíl", created: true });
  assert.deepEqual(created, [{ id: "646", year: 2026, name: "Nový oddíl" }]);
});

test("empty text and no id means no club", async () => {
  const { store, created } = memoryStore(base);
  assert.deepEqual(await resolveClubWith(store, "  ", 2026, ""), {
    id: "000",
    name: "",
    created: false,
  });
  assert.deepEqual(await resolveClubWith(store, "", 2026, "000"), {
    id: "000",
    name: "",
    created: false,
  });
  assert.equal(created.length, 0);
});
