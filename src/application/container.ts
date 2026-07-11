import { CachedAmbiguousMatchAssessor } from "@/ai/cached-ambiguous-match";
import { OpenAIBriefInterpreter } from "@/ai/openai-brief-interpreter";
import { ResilientBriefInterpreter } from "@/ai/resilient-brief-interpreter";
import { CheckpointApplication } from "@/application/checkpoint-application";
import { createDatabase } from "@/db/client";
import { DrizzleCheckpointRepository } from "@/db/repositories/drizzle-checkpoint-repository";
import { DeterministicReceiptProjection } from "@/domain/audit";
import { ConfirmedShoppingRequestProjector, DeterministicBriefInterpreter } from "@/domain/brief/interpret";
import { StagedMatchService } from "@/domain/matching/staged-matcher";
import { DeterministicPolicyEvaluator } from "@/domain/policy";
import { DeterministicLandedCostCalculator, headlineLandedCostRules } from "@/domain/pricing";
import { DeterministicVerificationService } from "@/domain/verification";
import { FixtureSimulator } from "@/simulator/fixture-simulator";
import { headlineEvents, headlineRequest } from "@/simulator/scenarios/headline";
import { presentationScenarioRequests, resolvePresentationScenario } from "@/simulator/scenarios";

function createCheckpointApplication(): CheckpointApplication {
  const { db } = createDatabase();
  const deterministicBriefInterpreter = new DeterministicBriefInterpreter();
  const liveBriefInterpreter = process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL
    ? new OpenAIBriefInterpreter()
    : undefined;
  return new CheckpointApplication({
    initialRequest: headlineRequest,
    runId: "headline-run",
    simulator: new FixtureSimulator(headlineEvents, headlineRequest.effectiveAt),
    repository: new DrizzleCheckpointRepository(db),
    matching: new StagedMatchService(undefined, new CachedAmbiguousMatchAssessor()),
    verification: new DeterministicVerificationService(),
    pricing: new DeterministicLandedCostCalculator(headlineLandedCostRules),
    policy: new DeterministicPolicyEvaluator(),
    receipts: new DeterministicReceiptProjection(),
    briefInterpreter: new ResilientBriefInterpreter(deterministicBriefInterpreter, liveBriefInterpreter),
    briefProjector: new ConfirmedShoppingRequestProjector(),
    scenarioRequests: presentationScenarioRequests,
    scenarioResolver: resolvePresentationScenario,
  });
}

const checkpointGlobal = globalThis as typeof globalThis & {
  checkpointApplication?: CheckpointApplication;
  checkpointApplicationVersion?: number;
};

const CHECKPOINT_APPLICATION_VERSION = 7;
const cachedCheckpointApplication = checkpointGlobal.checkpointApplication;
export const checkpointApplication = cachedCheckpointApplication
  && checkpointGlobal.checkpointApplicationVersion === CHECKPOINT_APPLICATION_VERSION
  ? cachedCheckpointApplication
  : createCheckpointApplication();

if (process.env.NODE_ENV !== "production") {
  checkpointGlobal.checkpointApplication = checkpointApplication;
  checkpointGlobal.checkpointApplicationVersion = CHECKPOINT_APPLICATION_VERSION;
}
