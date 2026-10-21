import assert from "node:assert/strict";
import test from "node:test";

import { cancellationDetail } from "./cancel-core";
import { describeEntryChange, ENTRY_CHANGE_ACTIONS, groupEntryChanges } from "./changes-core";

const lines = [
  {
    runnerId: "19900012",
    entryFee: 250,
    runner: { name: "Novák Jan" },
    category: { name: "A" },
  },
  { runnerId: "19850003", entryFee: null, runner: null, category: null },
];

test("detail zrušení vypíše odhlášené závodníky (seřazené) a zaplacenou částku", () => {
  const detail = cancellationDetail({
    year: 2026,
    registrationId: 12,
    registrationName: "TJ Testov",
    lines,
    paid: 300,
  });
  assert.deepEqual(detail, {
    year: 2026,
    registrationId: 12,
    registrationName: "TJ Testov",
    runners: [
      { runnerId: "19850003", runnerName: null, category: null, fee: null },
      { runnerId: "19900012", runnerName: "Novák Jan", category: "A", fee: 250 },
    ],
    paid: 300,
  });
});

test("entry.cancelled je změna přihlášky a má český popis", () => {
  assert.ok((ENTRY_CHANGE_ACTIONS as readonly string[]).includes("entry.cancelled"));
  const row = (detail: object) => ({
    id: 1,
    createdAt: new Date("2026-05-01T10:00:00Z"),
    action: "entry.cancelled",
    target: "registration:2026/12",
    actorEmail: "admin@example.cz",
    detail,
  });
  const withPayment = cancellationDetail({
    year: 2026,
    registrationId: 12,
    registrationName: "TJ Testov",
    lines,
    paid: 300,
  });
  assert.equal(
    describeEntryChange(row(withPayment)),
    "Přihláška zrušena, odhlášeni závodníci: 19850003, Novák Jan (19900012); zaplaceno 300 Kč zůstává u přihlášky",
  );
  assert.equal(
    describeEntryChange(row({ ...withPayment, runners: [withPayment.runners![1]], paid: 0 })),
    "Přihláška zrušena, odhlášeni závodníci: Novák Jan (19900012)",
  );
  assert.equal(describeEntryChange(row({ year: 2026, registrationId: 12 })), "Přihláška zrušena");
  const groups = groupEntryChanges([row(withPayment)]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, "TJ Testov");
});
