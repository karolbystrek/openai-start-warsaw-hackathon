import type { DecisionRecord, ShoppingRequest, SimulationEvent } from "@/domain/contracts";
import type { CheckpointRepository } from "@/domain/services";

export type OfferObservedEvent = Extract<SimulationEvent, { type: "OFFER_OBSERVED" }>;

export interface DecisionScope {
  requestId: string;
  requestVersion: number;
  runId: string;
}

export interface EvaluationRepository extends CheckpointRepository {
  getCurrentRequest(requestId: string, effectiveAt?: string): Promise<ShoppingRequest | null>;
  listDecisionsForRun(scope: DecisionScope): Promise<readonly DecisionRecord[]>;
  resetToRequest(request: ShoppingRequest): Promise<void>;
  saveEventIfCurrent(event: SimulationEvent, expectedSequence: number): Promise<boolean>;
  saveEvaluation(
    request: ShoppingRequest,
    event: OfferObservedEvent,
    decision: DecisionRecord,
    expectedSequence: number,
  ): Promise<boolean>;
}

export class EvaluationPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationPersistenceError";
  }
}

export function assertEvaluationCorrelation(
  request: ShoppingRequest,
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
    ["request", decision.requestId, request.id],
    ["request version", decision.requestVersion, request.version],
  ] as const;

  for (const [label, actual, expected] of references) {
    if (actual !== expected) {
      throw new EvaluationPersistenceError(
        `Cannot persist evaluation: ${label} reference ${actual} does not match ${expected}.`,
      );
    }
  }
}
