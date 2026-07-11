import { createDatabase } from "../src/db/client";
import { DrizzleCheckpointRepository } from "../src/db/repositories/drizzle-checkpoint-repository";
import { headlineRequest } from "../src/simulator/scenarios/headline";

async function reset() {
  const { db, sqlite } = createDatabase();
  const repository = new DrizzleCheckpointRepository(db);
  await repository.resetToRequest(headlineRequest);
  sqlite.close();
  console.log("Reset and seeded the shopping-assistant database safely.");
}

void reset();
