import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import * as schema from "@/db/schema";

export type ShoppingDatabase = ReturnType<typeof createDatabase>["db"];

export function createDatabase(databasePath = process.env.DATABASE_URL ?? "./data/shopping-assistant.db", runMigrations = true) {
  const resolvedPath = databasePath === ":memory:" ? databasePath : resolve(databasePath);
  if (resolvedPath !== ":memory:") mkdirSync(dirname(resolvedPath), { recursive: true });
  const sqlite = new Database(resolvedPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  if (runMigrations) migrate(db, { migrationsFolder: resolve("drizzle") });
  return { db, sqlite };
}
