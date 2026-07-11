import { createDatabase } from "../src/db/client";

const { sqlite } = createDatabase();
sqlite.close();
console.log("Database migrations applied.");
