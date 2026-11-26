import assert from "node:assert/strict";
import { test } from "node:test";

import {
  groupPublicEntrants,
  resolveClubAmongEntrants,
  uniqueClubsFromEntrants,
  type PublicEntrant,
} from "./club-entrants-core";

function entrant(overrides: Partial<PublicEntrant> = {}): PublicEntrant {
  return {
    categoryId: "M",
    categorySort: 1,
    categoryName: "Muži",
    id: "19900101AAAA",
    name: "Jan Novák",
    nationality: "CZE",
    birth: "1990",
    club: "K.O.B. Choceň",
    clubId: "CHC",
    starts: 5,
    newbie: false,
    record: 1500,
    ...overrides,
  };
}

test("uniqueClubsFromEntrants keeps one row per club id and skips placeholders", () => {
  const clubs = uniqueClubsFromEntrants([
    entrant(),
    entrant({ id: "19910101BBBB", name: "Petr Svoboda" }),
    entrant({
      id: "20000101CCCC",
      name: "Adam Bezklubu",
      club: "-",
      clubId: "000",
      categoryId: "Z",
    }),
    entrant({
      id: "19920101DDDD",
      name: "Eva Nová",
      club: "OK Lokomotiva",
      clubId: "LOK",
      categoryId: "Z",
      categorySort: 2,
      categoryName: "Ženy",
    }),
  ]);
  assert.deepEqual(clubs.map((club) => club.clubId).sort(), ["CHC", "LOK"]);
  const chc = clubs.find((club) => club.clubId === "CHC");
  assert.equal(chc?.canonical, "chc-k-o-b-chocen");
});

test("resolveClubAmongEntrants accepts canonical, stale name part and name-only slug", () => {
  const clubs = uniqueClubsFromEntrants([
    entrant(),
    entrant({ club: "OK Lokomotiva", clubId: "LOK" }),
  ]);

  assert.equal(resolveClubAmongEntrants("chc-k-o-b-chocen", clubs)?.clubId, "CHC");
  assert.equal(resolveClubAmongEntrants("chc-stary-nazev", clubs)?.canonical, "chc-k-o-b-chocen");
  assert.equal(resolveClubAmongEntrants("k-o-b-chocen", clubs)?.clubId, "CHC");
  assert.equal(resolveClubAmongEntrants("kob chocen", clubs)?.clubId, "CHC");
  assert.equal(resolveClubAmongEntrants("neznamy-klub", clubs), null);
  assert.equal(resolveClubAmongEntrants("   ", clubs), null);
});

test("groupPublicEntrants sorts categories and runners and keeps public fields only", () => {
  const categories = groupPublicEntrants(
    [
      entrant({
        id: "19920101DDDD",
        name: "Eva Nová",
        club: "OK Lokomotiva",
        clubId: "LOK",
        categoryId: "Z",
        categorySort: 2,
        categoryName: "Ženy",
        starts: 1,
        newbie: false,
        record: 1600,
      }),
      entrant({ id: "19950101EEEE", name: "Petr Svoboda", starts: 0, newbie: true, record: null }),
      entrant(),
    ],
    "cs",
  );

  assert.deepEqual(
    categories.map((group) => [group.name, group.runners.map((row) => row.name)]),
    [
      ["Muži", ["Jan Novák", "Petr Svoboda"]],
      ["Ženy", ["Eva Nová"]],
    ],
  );
  assert.deepEqual(Object.keys(categories[0]!.runners[0]!).sort(), [
    "birth",
    "club",
    "clubId",
    "id",
    "name",
    "nationality",
    "newbie",
    "record",
    "starts",
  ]);
});
