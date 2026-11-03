import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";

import {
  canDeleteRunner,
  emptyLinkCounts,
  isRunnerId,
  RUNNER_LINK_KINDS,
  RUNNER_LINK_TABLES,
  runnerDeleteAuditDetail,
  selectedRunnerIds,
  totalLinks,
  validDate,
} from "./runner-orphans-core";
import { RUNNER_REFERENCE_MODELS } from "./runner-rekey";

const SCHEMA = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");

const key = ({ table, column }: { table: string; column: string }) => `${table}.${column}`;

describe("RUNNER_LINK_TABLES coverage", () => {
  it("covers every relation to the runner in the Prisma schema (table + column)", () => {
    const fromSchema = new Set<string>();
    for (const [, body] of SCHEMA.matchAll(/^model \w+ \{([\s\S]*?)^\}/gm)) {
      const table = /@@map\("(\w+)"\)/.exec(body)?.[1];
      if (!table) continue;
      for (const [, from] of body.matchAll(
        /^\s*\w+\s+Runner\??\s+@relation\([^)]*fields:\s*\[(\w+)\]/gm,
      )) {
        const column = new RegExp(`^\\s*${from}\\s.*@map\\("(\\w+)"\\)`, "m").exec(body)?.[1];
        fromSchema.add(`${table}.${column ?? from}`);
      }
    }
    assert.ok(fromSchema.size > 0);
    const listed = new Set(Object.values(RUNNER_LINK_TABLES).map(key));
    assert.deepEqual([...listed].sort(), [...fromSchema].sort());
  });

  it("covers every model in RUNNER_REFERENCE_MODELS", () => {
    const tables = new Set(Object.values(RUNNER_LINK_TABLES).map((link) => link.table));
    for (const name of RUNNER_REFERENCE_MODELS) {
      const model = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === name);
      assert.ok(model, name);
      assert.ok(tables.has(model.dbName ?? model.name), name);
    }
  });

  it("covers every runner-id column in the schema, even without a relation", () => {
    const listed = new Set(Object.values(RUNNER_LINK_TABLES).map(key));
    for (const [, body] of SCHEMA.matchAll(/^model \w+ \{([\s\S]*?)^\}/gm)) {
      const table = /@@map\("(\w+)"\)/.exec(body)?.[1];
      if (!table || table === "cis_bezec") continue;
      for (const [, column] of body.matchAll(/@map\("(\w*bezec_id)"\)/g)) {
        assert.ok(listed.has(`${table}.${column}`), `${table}.${column}`);
      }
    }
  });

  it("has a table for every kind", () => {
    assert.deepEqual(Object.keys(RUNNER_LINK_TABLES).sort(), [...RUNNER_LINK_KINDS].sort());
  });
});

describe("link counts", () => {
  it("allows deletion only with zero links", () => {
    const counts = emptyLinkCounts();
    assert.equal(totalLinks(counts), 0);
    assert.equal(canDeleteRunner(counts), true);
    for (const kind of RUNNER_LINK_KINDS) {
      const one = { ...emptyLinkCounts(), [kind]: 1 };
      assert.equal(totalLinks(one), 1);
      assert.equal(canDeleteRunner(one), false, kind);
    }
  });
});

describe("selectedRunnerIds", () => {
  it("keeps valid unique ids, sorted", () => {
    assert.deepEqual(
      selectedRunnerIds(["20105001", "x", "20000031", "20105001", "2000003", null, "200000311"]),
      ["20000031", "20105001"],
    );
  });

  it("restricts to offered ids", () => {
    assert.deepEqual(selectedRunnerIds(["20000031", "20105001"], new Set(["20105001"])), [
      "20105001",
    ]);
  });

  it("validates runner ids", () => {
    assert.equal(isRunnerId("20020026"), true);
    assert.equal(isRunnerId("2002002a"), false);
    assert.equal(isRunnerId(20020026), false);
  });
});

describe("audit detail", () => {
  it("stores the full row for a manual restore", () => {
    const detail = runnerDeleteAuditDetail("orphans", [
      {
        id: "20000031",
        name: "Testovič Test",
        nationality: "CZ",
        created: new Date("2025-11-20T10:00:00Z"),
        author: "admin",
      },
      { id: "20105001", name: "Pokus L", nationality: null, created: null, author: null },
    ]);
    assert.deepEqual(detail, {
      version: 1,
      source: "orphans",
      count: 2,
      rows: [
        {
          id: "20000031",
          jmeno: "Testovič Test",
          statni_prislusnost: "CZ",
          created: "2025-11-20T10:00:00.000Z",
          autor: "admin",
        },
        { id: "20105001", jmeno: "Pokus L", statni_prislusnost: null, created: null, autor: null },
      ],
    });
  });

  it("treats invalid legacy dates as unknown", () => {
    assert.equal(validDate(new Date("invalid")), null);
    assert.equal(validDate(null), null);
  });
});
