import assert from "node:assert/strict";
import { test } from "node:test";
import type { ConnectionOptions, PeerCertificate } from "node:tls";
import { databaseOptions, migrationUrl } from "./options";

const DATABASE_URL = "mysql://runner%40app:p%40ss%3Aword@mysql.example:3307/race%2Ddata";

test("decodes MySQL credentials and database without corrupting special characters", () => {
  const options = databaseOptions({ DATABASE_URL, NODE_ENV: "test" });
  assert.equal(options.user, "runner@app");
  assert.equal(options.password, "p@ss:word");
  assert.equal(options.database, "race-data");
  assert.equal(options.port, 3307);
  assert.equal(options.ssl, undefined);
});

test("production requires trusted TLS with hostname verification", () => {
  const ssl = databaseOptions({ DATABASE_URL, NODE_ENV: "production" }).ssl as ConnectionOptions;
  assert.equal(ssl.rejectUnauthorized, true);
  assert.equal(ssl.minVersion, "TLSv1.2");
  assert.equal(ssl.servername, "mysql.example");
  assert.ok(Array.isArray(ssl.ca) && ssl.ca.length > 0);
  const certificate = { subjectaltname: "DNS:mysql.example" } as PeerCertificate;
  assert.equal(ssl.checkServerIdentity!("ignored-driver-default", certificate), undefined);
  assert.ok(
    ssl.checkServerIdentity!("mysql.example", {
      subjectaltname: "DNS:attacker.example",
    } as PeerCertificate),
  );
});

test("rejects TLS downgrades, unsupported URLs and silently ignored URL settings", () => {
  assert.throws(() => databaseOptions({ NODE_ENV: "production" }), /DATABASE_URL is required/);
  assert.throws(
    () => databaseOptions({ DATABASE_URL, NODE_ENV: "production", DATABASE_TLS: "false" }),
    /require TLS/,
  );
  for (const url of [
    "postgres://user:pass@host/db",
    "mysql://host/",
    DATABASE_URL + "?ssl=false",
  ]) {
    assert.throws(() => databaseOptions({ DATABASE_URL: url, NODE_ENV: "test" }));
  }
  assert.throws(
    () => databaseOptions({ DATABASE_URL: "mysql://user:%xx@host/db", NODE_ENV: "test" }),
    /Invalid encoding/,
  );
});

test("migration URL enables strict certificate validation and preserves credentials", () => {
  const url = new URL(migrationUrl(DATABASE_URL, "/tmp/test ca.crt"));
  assert.equal(url.searchParams.get("sslaccept"), "strict");
  assert.equal(url.searchParams.get("sslcert"), "/tmp/test ca.crt");
  assert.equal(url.password, "p%40ss%3Aword");
  assert.equal(migrationUrl(DATABASE_URL), DATABASE_URL);
});
