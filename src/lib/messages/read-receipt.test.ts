import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  readReceipt,
  shouldRecordUserView,
  staffMessagesToMarkSeen,
  staffReplyReceipt,
} from "./core";

const t = (minutes: number) => new Date(Date.UTC(2026, 9, 22, 12, minutes));

describe("potvrzení o přečtení zpráv pořadatele", () => {
  test("zobrazení zakládá přečtení jen vlastníkovi, ne pořadateli/adminovi", () => {
    assert.equal(shouldRecordUserView({ isStaff: false, canAccess: true }), true);
    assert.equal(shouldRecordUserView({ isStaff: true, canAccess: true }), false);
    assert.equal(shouldRecordUserView({ isStaff: false, canAccess: false }), false);
  });

  test("označí jen dosud nepřečtené zprávy pořadatele (první přečtení se nepřepisuje)", () => {
    const ids = staffMessagesToMarkSeen([
      { id: 1, side: "user", readAt: null },
      { id: 2, side: "staff", readAt: t(5) },
      { id: 3, side: "staff", readAt: null },
      { id: 4, side: "staff", readAt: null },
    ]);
    assert.deepEqual(ids, [3, 4]);
    assert.deepEqual(staffMessagesToMarkSeen([{ id: 1, side: "user", readAt: null }]), []);
  });

  test("stav u zprávy: pořadatel přečteno/nepřečteno, přihlašující se neeviduje", () => {
    assert.deepEqual(readReceipt({ side: "staff", readAt: t(5) }), { read: true, at: t(5) });
    assert.deepEqual(readReceipt({ side: "staff", readAt: null }), { read: false });
    assert.equal(readReceipt({ side: "user", readAt: null }), null);
    assert.equal(readReceipt({ side: "user", readAt: t(5) }), null);
  });

  test("přehled: bez odpovědí pořadatele nic", () => {
    assert.equal(staffReplyReceipt([]), null);
  });

  test("přehled: poslední odpověď přečtená → čas jejího přečtení", () => {
    assert.deepEqual(
      staffReplyReceipt([
        { createdAt: t(20), readAt: t(30) },
        { createdAt: t(0), readAt: t(10) },
      ]),
      { read: true, at: t(30) },
    );
  });

  test("přehled: nepřečtená poslední odpověď → počet nepřečtených", () => {
    assert.deepEqual(
      staffReplyReceipt([
        { createdAt: t(0), readAt: t(10) },
        { createdAt: t(20), readAt: null },
        { createdAt: t(25), readAt: null },
      ]),
      { read: false, unreadCount: 2 },
    );
  });
});

describe("migrace 20261022140000_message_read_at", () => {
  const sql = readFileSync(
    new URL(
      "../../../prisma/migrations/20261022140000_message_read_at/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const statements = sql
    .split(";")
    .map((part) => part.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);

  test("přidá nullable read_at do mcvv_message", () => {
    assert.match(
      statements[0]!,
      /^ALTER TABLE `mcvv_message` ADD COLUMN `read_at` DATETIME\(3\) NULL$/,
    );
  });

  test("doplní jen zprávy pořadatele potvrzené přihlašujícím", () => {
    const update = statements.find((statement) => statement.startsWith("UPDATE"));
    assert.ok(update);
    assert.match(update, /SET m\.`read_at` = t\.`last_read_by_user`/);
    assert.match(update, /m\.`side` = 'staff'/);
    assert.match(update, /m\.`read_at` IS NULL/);
    assert.match(update, /m\.`created_at` <= t\.`last_read_by_user`/);
  });

  test("nic nemaže ani nemění jiné tabulky", () => {
    assert.equal(statements.length, 2);
    assert.doesNotMatch(sql, /\bDROP\b|\bDELETE\b/i);
  });
});
