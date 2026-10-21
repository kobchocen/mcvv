import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CHANGES_MAX_AGE_MS,
  CHANGES_QUIET_MS,
  changesWindow,
  describeEntryChange,
  ENTRY_CHANGE_ACTIONS,
  entryTarget,
  groupEntryChanges,
  parseCursor,
  parseEntryTarget,
  type EntryChangeRow,
} from "./changes-core";

let seq = 0;
function row(action: string, detail: object, at = "2026-05-01T10:00:00Z", target?: string) {
  seq += 1;
  const d = detail as { year?: number; registrationId?: number };
  return {
    id: seq,
    createdAt: new Date(at),
    action,
    target: target ?? entryTarget(d.year ?? 2026, d.registrationId ?? 12),
    actorEmail: "klub@example.cz",
    detail: { year: 2026, registrationId: 12, ...detail },
  } satisfies EntryChangeRow;
}

test("pokrývá typy legacy e-mailů prihlasit.php (bez poznámky – ta je ve zprávách)", () => {
  for (const action of [
    "entry.created",
    "entry.runner_added",
    "entry.runner_removed",
    "entry.club_created",
    "entry.runner_created",
  ]) {
    assert.ok((ENTRY_CHANGE_ACTIONS as readonly string[]).includes(action), action);
  }
});

test("česky popsané změny", () => {
  assert.equal(describeEntryChange(row("entry.created", {})), "Založena nová přihláška");
  assert.equal(
    describeEntryChange(
      row("entry.runner_added", {
        runnerId: "19900012",
        runnerName: "Novák Jan",
        category: "A",
        fee: 250,
        clubName: "SK Choceň",
      }),
    ),
    "Přihlášen závodník: Novák Jan (19900012), kat. A, 250 Kč, SK Choceň",
  );
  assert.equal(
    describeEntryChange(row("entry.runner_added", { runnerId: "20150501", fee: 0 })),
    "Přihlášen závodník: 20150501, 0 Kč",
  );
  assert.equal(
    describeEntryChange(
      row("entry.runner_removed", { runnerId: "19900012", runnerName: "Novák Jan" }),
    ),
    "Odhlášen závodník: Novák Jan (19900012)",
  );
  assert.equal(
    describeEntryChange(
      row("entry.runner_created", { runnerId: "20100501", runnerName: "Malá Eva" }),
    ),
    "Založen nový závodník: Malá Eva (20100501)",
  );
  assert.equal(
    describeEntryChange(
      row("entry.club_created", { clubId: "412", clubName: "Běžci Vysoké Mýto" }),
    ),
    "Založen nový klub: Běžci Vysoké Mýto (412)",
  );
  assert.equal(
    describeEntryChange(row("entry.header_changed", { from: "Jan Novák", to: "SK Choceň" })),
    "Změna názvu přihlášky: „Jan Novák“ → „SK Choceň“",
  );
  assert.equal(
    describeEntryChange(
      row("entry.line_club_changed", {
        runnerId: "19900012",
        runnerName: "Novák Jan",
        from: "",
        to: "SK",
      }),
    ),
    "Změna klubu: Novák Jan (19900012): bez klubu → SK",
  );
  assert.equal(describeEntryChange(row("user.role_change", {})), null);
});

test("seskupení podle přihlášky, chronologicky, název z DB má přednost", () => {
  const rows = [
    row("entry.runner_added", { registrationId: 7, runnerId: "1" }, "2026-05-01T10:05:00Z"),
    row("entry.created", { registrationId: 7, registrationName: "Starý" }, "2026-05-01T10:00:00Z"),
    row("entry.runner_removed", { registrationId: 3, runnerId: "2" }, "2026-05-01T11:00:00Z"),
    row("entry.created", {}, "2026-05-01T09:00:00Z", "nesmysl"),
  ];
  const groups = groupEntryChanges(rows, new Map([["2026/7", "SK Choceň"]]));
  assert.deepEqual(
    groups.map((group) => [group.registrationId, group.name, group.lines.map((line) => line.text)]),
    [
      [7, "SK Choceň", ["Založena nová přihláška", "Přihlášen závodník: 1"]],
      [3, "", ["Odhlášen závodník: 2"]],
    ],
  );
});

test("okno souhrnu: klidová doba a max. stáří; kurzor a cíl", () => {
  const now = new Date("2026-05-02T07:00:00Z");
  const { from, to } = changesWindow(now);
  assert.equal(now.getTime() - to.getTime(), CHANGES_QUIET_MS);
  assert.equal(now.getTime() - from.getTime(), CHANGES_MAX_AGE_MS);
  assert.equal(parseCursor("42"), 42);
  assert.equal(parseCursor(null), 0);
  assert.equal(parseCursor("x"), 0);
  assert.deepEqual(parseEntryTarget("registration:2026/12"), { year: 2026, id: 12 });
  assert.equal(parseEntryTarget("user:1"), null);
});
