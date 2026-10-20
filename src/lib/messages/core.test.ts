import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  checkRateLimit,
  countUnreadMessages,
  countUnreadThreads,
  digestDedupeKey,
  digestThreads,
  DIGEST_QUIET_MS,
  hasUnread,
  MESSAGE_LIMITS,
  MESSAGE_MAX_LENGTH,
  normalizeMessageBody,
  parseAdminThreadFilters,
  patchForMarkRead,
  patchForNewMessage,
  shouldNotifyUser,
  showInternalNote,
  sortAdminThreads,
  subjectFromBody,
  userNotifyDedupeKey,
  type ThreadReadState,
} from "./core";

const t = (minutes: number) => new Date(Date.UTC(2026, 9, 20, 10, minutes));

function thread(partial: Partial<ThreadReadState> = {}): ThreadReadState {
  return {
    status: "open",
    lastUserMessageAt: null,
    lastStaffMessageAt: null,
    lastReadByUser: null,
    lastReadByStaff: null,
    ...partial,
  };
}

/** Aplikuje patch na stav vlákna (simulace DB update). */
function apply(state: ThreadReadState, patch: Partial<ThreadReadState>): ThreadReadState {
  return { ...state, ...patch };
}

describe("nepřečtené", () => {
  test("zpráva protistrany po posledním přečtení = nepřečteno", () => {
    const state = thread({ lastStaffMessageAt: t(5), lastReadByUser: t(1) });
    assert.equal(hasUnread(state, "user"), true);
    assert.equal(hasUnread(state, "staff"), false);
  });

  test("vlastní zprávy se jako nepřečtené nepočítají", () => {
    const state = thread({ lastUserMessageAt: t(5) });
    assert.equal(hasUnread(state, "user"), false);
    assert.equal(hasUnread(state, "staff"), true);
  });

  test("odznak pořadatele počítá jen OTEVŘENÁ vlákna s nepřečtenou zprávou přihlašujícího", () => {
    const threads = [
      thread({ lastUserMessageAt: t(5) }),
      thread({ lastUserMessageAt: t(5), lastReadByStaff: t(6) }),
      thread({ lastUserMessageAt: t(5), status: "resolved" }),
      thread({ lastStaffMessageAt: t(5) }),
    ];
    assert.equal(countUnreadThreads(threads, "staff"), 1);
    // Přihlašujícímu se počítá i vyřešené vlákno s nepřečtenou odpovědí.
    assert.equal(
      countUnreadThreads([thread({ lastStaffMessageAt: t(5), status: "resolved" })], "user"),
      1,
    );
  });

  test("počet nepřečtených zpráv ve vlákně", () => {
    const messages = [
      { side: "user" as const, createdAt: t(1) },
      { side: "staff" as const, createdAt: t(2) },
      { side: "staff" as const, createdAt: t(4) },
      { side: "user" as const, createdAt: t(5) },
    ];
    assert.equal(countUnreadMessages(messages, null, "user"), 2);
    assert.equal(countUnreadMessages(messages, t(3), "user"), 1);
    assert.equal(countUnreadMessages(messages, t(3), "staff"), 1);
    assert.equal(countUnreadMessages(messages, t(9), "staff"), 0);
  });
});

describe("pravidla čtení", () => {
  test("otevření nic nemění – přečteno jen potvrzením nebo odpovědí", () => {
    let state = thread({ lastStaffMessageAt: t(5) });
    assert.equal(hasUnread(state, "user"), true);
    state = apply(state, patchForMarkRead("user", t(6)));
    assert.equal(hasUnread(state, "user"), false);

    state = apply(state, patchForNewMessage("staff", t(7)));
    assert.equal(hasUnread(state, "user"), true);
    state = apply(state, patchForNewMessage("user", t(8)));
    assert.equal(hasUnread(state, "user"), false, "odpověď = přečteno");
    assert.equal(hasUnread(state, "staff"), true);
  });

  test("odpověď pořadatele označí vlákno přečtené pro všechny pořadatele (sdílený stav)", () => {
    const state = apply(thread({ lastUserMessageAt: t(1) }), patchForNewMessage("staff", t(2)));
    assert.equal(hasUnread(state, "staff"), false);
    assert.deepEqual(patchForMarkRead("staff", t(3)), { lastReadByStaff: t(3) });
  });

  test("zpráva přihlašujícího znovu otevře vyřešené vlákno, pořadatelova ne", () => {
    assert.equal(patchForNewMessage("user", t(1)).status, "open");
    assert.equal(patchForNewMessage("staff", t(1)).status, undefined);
  });
});

describe("limity", () => {
  const free = { lastHour: 0, lastDay: 0, threadsLastDay: 0 };
  test("10 zpráv za hodinu", () => {
    assert.deepEqual(checkRateLimit({ ...free, lastHour: 9 }, false), { ok: true });
    assert.deepEqual(checkRateLimit({ ...free, lastHour: MESSAGE_LIMITS.perHour }, false), {
      ok: false,
      reason: "hour",
    });
  });
  test("30 zpráv za den", () => {
    assert.deepEqual(checkRateLimit({ ...free, lastDay: 30 }, false), { ok: false, reason: "day" });
  });
  test("3 nová vlákna za den (odpověď do existujícího vlákna limit vláken neřeší)", () => {
    assert.deepEqual(checkRateLimit({ ...free, threadsLastDay: 3 }, true), {
      ok: false,
      reason: "threads",
    });
    assert.deepEqual(checkRateLimit({ ...free, threadsLastDay: 3 }, false), { ok: true });
    assert.deepEqual(checkRateLimit({ ...free, threadsLastDay: 2 }, true), { ok: true });
  });
});

describe("text zprávy", () => {
  test("trim, CRLF → LF, max. 2000 znaků", () => {
    assert.equal(normalizeMessageBody("  Ahoj\r\nsvěte  "), "Ahoj\nsvěte");
    assert.equal(normalizeMessageBody("a".repeat(MESSAGE_MAX_LENGTH))?.length, MESSAGE_MAX_LENGTH);
    assert.equal(normalizeMessageBody("a".repeat(MESSAGE_MAX_LENGTH + 1)), null);
    assert.equal(normalizeMessageBody("   "), null);
    assert.equal(normalizeMessageBody("x\u0007"), null);
    assert.equal(normalizeMessageBody(42), null);
  });
  test("předmět obecného vlákna z první řádky", () => {
    assert.equal(subjectFromBody("Dotaz k parkování\nDalší text"), "Dotaz k parkování");
    assert.equal(subjectFromBody("x".repeat(100)).length, 80);
  });
});

describe("upozornění přihlašujícímu", () => {
  test("jedno upozornění za cyklus čtení", () => {
    const base = { lastStaffMessageAt: t(5), lastReadByUser: null, userNotifiedAt: null };
    assert.equal(shouldNotifyUser(base), true);
    // Upozornění odešlo, další odpověď pořadatele → nic, dokud nepřečte.
    assert.equal(
      shouldNotifyUser({ ...base, lastStaffMessageAt: t(9), userNotifiedAt: t(6) }),
      false,
    );
    // Přečetl (t10), pak nová odpověď (t12) → nový cyklus.
    assert.equal(
      shouldNotifyUser({ lastStaffMessageAt: t(12), lastReadByUser: t(10), userNotifiedAt: t(6) }),
      true,
    );
    // Vše přečteno → nic.
    assert.equal(
      shouldNotifyUser({ lastStaffMessageAt: t(5), lastReadByUser: t(6), userNotifiedAt: null }),
      false,
    );
  });
  test("klíč proti duplicitě se mění s cyklem", () => {
    assert.equal(userNotifyDedupeKey(7, null), "msg-user:7:0");
    assert.notEqual(userNotifyDedupeKey(7, t(1)), userNotifyDedupeKey(7, t(2)));
  });
});

describe("denní souhrn pro pořadatele", () => {
  const now = t(30);
  const row = (
    id: number,
    partial: Partial<ThreadReadState> & { staffNotifiedAt?: Date | null },
  ) => ({
    id,
    staffNotifiedAt: null,
    ...thread(partial),
    ...partial,
  });
  test("jen otevřená, nepřečtená, mimo klidovou dobu a dosud nesouhrnovaná vlákna", () => {
    const due = digestThreads(
      [
        row(1, { lastUserMessageAt: t(1) }),
        row(2, { lastUserMessageAt: t(1), lastReadByStaff: t(2) }),
        row(3, { lastUserMessageAt: t(1), status: "resolved" }),
        row(4, { lastUserMessageAt: new Date(now.getTime() - DIGEST_QUIET_MS + 1000) }),
        row(5, { lastUserMessageAt: t(1), staffNotifiedAt: t(2) }),
        row(6, { lastUserMessageAt: t(3), staffNotifiedAt: t(2) }),
      ],
      now,
    );
    assert.deepEqual(
      due.map((item) => item.id),
      [1, 6],
    );
  });
  test("max. jednou denně podle pražského kalendářního dne", () => {
    // 21:59 UTC = 23:59 v Praze (20. 10.), 22:01 UTC = 00:01 dalšího dne.
    assert.equal(digestDedupeKey(new Date("2026-10-20T21:59:00Z")), "msg-digest:2026-10-20");
    assert.equal(digestDedupeKey(new Date("2026-10-20T22:01:00Z")), "msg-digest:2026-10-21");
  });
});

describe("administrace", () => {
  test("řazení: otevřené nepřečtené, otevřené, vyřešené; uvnitř nejnovější nahoře", () => {
    const rows = [
      { id: 1, ...thread({ status: "resolved", lastUserMessageAt: t(9) }), lastMessageAt: t(9) },
      { id: 2, ...thread({ lastStaffMessageAt: t(8) }), lastMessageAt: t(8) },
      { id: 3, ...thread({ lastUserMessageAt: t(2) }), lastMessageAt: t(2) },
      { id: 4, ...thread({ lastUserMessageAt: t(4) }), lastMessageAt: t(4) },
    ];
    assert.deepEqual(
      sortAdminThreads(rows).map((row) => row.id),
      [4, 3, 2, 1],
    );
  });
  test("filtry z query", () => {
    assert.deepEqual(parseAdminThreadFilters({}), {
      status: "all",
      unreadOnly: false,
      type: "all",
      year: null,
    });
    assert.deepEqual(
      parseAdminThreadFilters({ stav: "open", neprectene: "1", typ: "general", rok: "2026" }),
      { status: "open", unreadOnly: true, type: "general", year: 2026 },
    );
    assert.equal(parseAdminThreadFilters({ stav: "x", rok: "abc" }).status, "all");
  });
});

describe("migrace poznámek", () => {
  test("interní poznámka: starší ročníky ano, převedený ročník 2026 jen bez vlákna", () => {
    assert.equal(showInternalNote("Platím hotově", 2025, false), "Platím hotově");
    assert.equal(showInternalNote("Platím hotově", 2025, true), "Platím hotově");
    assert.equal(showInternalNote("Špatné pohlaví", 2026, true), null);
    assert.equal(showInternalNote("Špatné pohlaví", 2026, false), "Špatné pohlaví");
    assert.equal(showInternalNote("   ", 2024, false), null);
    assert.equal(showInternalNote(null, 2024, false), null);
  });
});
