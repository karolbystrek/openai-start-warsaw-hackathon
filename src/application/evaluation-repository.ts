import type { DecisionRecord, SimulationEvent } from "@/domain/contracts";
import type { CheckpointRepository } from "@/domain/services";

export type OfferObservedEvent = Extract<SimulationEvent, { type: "OFFER_OBSERVED" }>;

export interface EvaluationRepository extends CheckpointRepository {
  saveEvaluation(event: OfferObservedEvent, decision: DecisionRecord): Promise<void>;
}

export class EvaluationPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationPersistenceError";
  }
}

export function assertEvaluationCorrelation(
  event: OfferObservedEvent,
  decision: DecisionRecord,
): void {
  const offerId = event.offer.id;
  const references = [
    ["event", decision.eventId, event.id],
    ["offer", decision.offer.id, offerId],
    ["evidence", decision.evidence.offerId, offerId],
    ["match", decision.match.offerId, offerId],
    ["landed cost", decision.landedCost.offerId, offerId],
  ] as const;

  for (const [label, actual, expected] of references) {
    if (actual !== expected) {
      throw new EvaluationPersistenceError(
        `Cannot persist evaluation: ${label} reference ${actual} does not match ${expected}.`,
      );
    }
  }
}
