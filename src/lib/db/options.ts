import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { checkServerIdentity, getCACertificates, type ConnectionOptions } from "node:tls";
import type { PoolConfig } from "mariadb";

export type DatabaseEnvironment = {
  DATABASE_URL?: string;
  DATABASE_TLS?: "true" | "false";
  DATABASE_SSL_CA?: string;
  NODE_ENV: "development" | "test" | "production";
};

export function databaseOptions(env: DatabaseEnvironment) {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required for database operations");
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new Error("Invalid DATABASE_URL");
  }
  if (url.protocol !== "mysql:" || !url.hostname || url.pathname.length < 2 || url.hash) {
    throw new Error("DATABASE_URL must identify a MySQL host and database");
  }
  // Both connectors share this TLS policy instead of silently ignoring URL options.
  if (url.search) throw new Error("Use DATABASE_TLS and DATABASE_SSL_CA instead of URL parameters");
  if (env.NODE_ENV === "production" && env.DATABASE_TLS === "false") {
    throw new Error("Production database connections require TLS");
  }
  const tls = env.DATABASE_TLS === "true" || env.NODE_ENV === "production";
  if (env.DATABASE_SSL_CA && !tls) throw new Error("DATABASE_SSL_CA requires TLS");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ssl: ConnectionOptions | undefined = tls
    ? {
        ca: env.DATABASE_SSL_CA
          ? readFileSync(env.DATABASE_SSL_CA, "utf8")
          : getCACertificates("default"),
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
        servername: isIP(host) ? undefined : host,
        checkServerIdentity: (_hostname, certificate) => checkServerIdentity(host, certificate),
      }
    : undefined;
  try {
    return {
      host,
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
      ssl,
      connectionLimit: 5,
      connectTimeout: 5_000,
      acquireTimeout: 5_000,
    } satisfies PoolConfig;
  } catch {
    throw new Error("Invalid encoding in DATABASE_URL");
  }
}

export function migrationUrl(databaseUrl: string, caPath?: string): string {
  const url = new URL(databaseUrl);
  if (caPath) {
    url.searchParams.set("sslcert", caPath);
    url.searchParams.set("sslaccept", "strict");
  }
  return url.toString();
}
