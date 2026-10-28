import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { auditQuery, auditWhere, parseAuditFilters } from "./filters";

describe("parseAuditFilters", () => {
  it("accepts known groups, valid actions and real dates", () => {
    const filters = parseAuditFilters({
      skupina: "payment",
      akce: "payment.deleted",
      kdo: "  admin@ ",
      od: "2026-10-01",
      do: "2026-02-30",
      strana: "3",
    });
    assert.deepEqual(filters, {
      group: "payment",
      action: "payment.deleted",
      actor: "admin@",
      target: "",
      from: "2026-10-01",
      to: null,
      page: 3,
    });
  });

  it("drops unknown values", () => {
    const filters = parseAuditFilters({ skupina: "x", akce: "DROP TABLE", strana: "-1" });
    assert.equal(filters.group, null);
    assert.equal(filters.action, null);
    assert.equal(filters.page, 1);
  });
});

describe("auditWhere", () => {
  it("filters by group prefix and Prague calendar days", () => {
    const where = auditWhere(
      parseAuditFilters({ skupina: "club", od: "2026-10-28", do: "2026-10-28" }),
    );
    assert.deepEqual(where.action, { startsWith: "club." });
    // 28. 10. 2026 je už zimní čas (UTC+1).
    assert.deepEqual(where.createdAt, {
      gte: new Date("2026-10-27T23:00:00.000Z"),
      lt: new Date("2026-10-28T23:00:00.000Z"),
    });
  });

  it("prefers an exact action over the group", () => {
    const where = auditWhere(parseAuditFilters({ skupina: "club", akce: "club.merge" }));
    assert.equal(where.action, "club.merge");
  });

  it("returns an empty filter by default", () => {
    assert.deepEqual(auditWhere(parseAuditFilters({})), {});
  });
});

describe("auditQuery", () => {
  it("keeps only active filters", () => {
    assert.deepEqual(auditQuery(parseAuditFilters({ kdo: "a@b.cz", strana: "2" })), {
      kdo: "a@b.cz",
    });
  });
});
