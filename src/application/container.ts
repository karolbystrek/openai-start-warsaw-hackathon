import {
  FixtureLandedCostCalculator,
  FixtureMatchService,
  FixturePolicyEvaluator,
  FixtureReceiptProjection,
  FixtureVerificationService,
} from "@/adapters/fixtures/services";
import { CheckpointApplication } from "@/application/checkpoint-application";
import { createDatabase } from "@/db/client";
import { DrizzleCheckpointRepository } from "@/db/repositories/drizzle-checkpoint-repository";
import { FixtureSimulator } from "@/simulator/fixture-simulator";
import { headlineEvents, headlineRequest } from "@/simulator/scenarios/headline";

function createCheckpointApplication(): CheckpointApplication {
  const { db } = createDatabase();
  return new CheckpointApplication({
    request: headlineRequest,
    runId: "headline-run",
    simulator: new FixtureSimulator(headlineEvents, headlineRequest.effectiveAt),
    repository: new DrizzleCheckpointRepository(db),
    matching: new FixtureMatchService(),
    verification: new FixtureVerificationService(),
    pricing: new FixtureLandedCostCalculator(),
    policy: new FixturePolicyEvaluator(),
    receipts: new FixtureReceiptProjection(),
  });
}

const checkpointGlobal = globalThis as typeof globalThis & {
  checkpointApplication?: CheckpointApplication;
};

export const checkpointApplication = checkpointGlobal.checkpointApplication ?? createCheckpointApplication();

if (process.env.NODE_ENV !== "production") checkpointGlobal.checkpointApplication = checkpointApplication;
