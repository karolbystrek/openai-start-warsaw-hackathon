import {
  FixtureMatchService,
} from "@/adapters/fixtures/services";
import { CheckpointApplication } from "@/application/checkpoint-application";
import { createDatabase } from "@/db/client";
import { DrizzleCheckpointRepository } from "@/db/repositories/drizzle-checkpoint-repository";
import { DeterministicReceiptProjection } from "@/domain/audit";
import { DeterministicPolicyEvaluator } from "@/domain/policy";
import { DeterministicLandedCostCalculator, headlineLandedCostRules } from "@/domain/pricing";
import { DeterministicVerificationService } from "@/domain/verification";
import { FixtureSimulator } from "@/simulator/fixture-simulator";
import { headlineEvents, headlineRequest } from "@/simulator/scenarios/headline";

function createCheckpointApplication(): CheckpointApplication {
  const { db } = createDatabase();
  return new CheckpointApplication({
    initialRequest: headlineRequest,
    runId: "headline-run",
    simulator: new FixtureSimulator(headlineEvents, headlineRequest.effectiveAt),
    repository: new DrizzleCheckpointRepository(db),
    matching: new FixtureMatchService(),
    verification: new DeterministicVerificationService(),
    pricing: new DeterministicLandedCostCalculator(headlineLandedCostRules),
    policy: new DeterministicPolicyEvaluator(),
    receipts: new DeterministicReceiptProjection(),
  });
}

const checkpointGlobal = globalThis as typeof globalThis & {
  checkpointApplication?: CheckpointApplication;
};

export const checkpointApplication = checkpointGlobal.checkpointApplication ?? createCheckpointApplication();

if (process.env.NODE_ENV !== "production") checkpointGlobal.checkpointApplication = checkpointApplication;
