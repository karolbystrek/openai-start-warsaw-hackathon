import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import { createDatabase } from "../src/db/client";

const databasePath = resolve(process.env.DATABASE_URL ?? "./data/shopping-assistant.db");
for (const path of [databasePath, `${databasePath}-shm`, `${databasePath}-wal`]) {
  if (existsSync(path)) rmSync(path);
}
const { sqlite } = createDatabase(databasePath);
sqlite.close();
console.log(`Reset ${databasePath}.`);
