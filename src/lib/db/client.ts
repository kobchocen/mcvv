import { env } from "@/lib/env";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { databaseOptions } from "./options";

declare global {
  var prisma: PrismaClient | undefined;
}

let client: PrismaClient | undefined;

function getClient() {
  client ??=
    global.prisma ?? new PrismaClient({ adapter: new PrismaMariaDb(databaseOptions(env)) });
  if (env.NODE_ENV !== "production") global.prisma = client;
  return client;
}

// Builds and liveness probes do not need database credentials or a connection.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const instance = getClient();
    const value = Reflect.get(instance, property);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
