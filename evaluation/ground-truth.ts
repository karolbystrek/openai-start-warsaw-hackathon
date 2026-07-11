import { z } from "zod";

// Evaluation-only labels. Runtime source under src/ must never import this module.
export const ScenarioGroundTruthSchema = z.object({
  scenarioId: z.string().min(1),
  expected: z.array(z.object({
    eventId: z.string().min(1),
    offerIsValidDeal: z.boolean(),
    expectedOutcome: z.enum(["IGNORE", "REJECT", "ESCALATE", "ALERT", "BUY_SIMULATED"]),
  })),
});

export const headlineGroundTruth = ScenarioGroundTruthSchema.parse({
  scenarioId: "headline-run",
  expected: [
    { eventId: "event-001", offerIsValidDeal: false, expectedOutcome: "REJECT" },
    { eventId: "event-002", offerIsValidDeal: true, expectedOutcome: "ALERT" },
  ],
});
