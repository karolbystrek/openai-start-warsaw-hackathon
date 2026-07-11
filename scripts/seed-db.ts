import { createDatabase } from "../src/db/client";
import { DrizzleCheckpointRepository } from "../src/db/repositories/drizzle-checkpoint-repository";
import { headlineRequest } from "../src/simulator/scenarios/headline";

async function seed() {
  const { db, sqlite } = createDatabase();
  const repository = new DrizzleCheckpointRepository(db);
  await repository.saveRequest(headlineRequest);
  sqlite.close();
  console.log("Seeded the headline shopping request.");
}

void seed();
