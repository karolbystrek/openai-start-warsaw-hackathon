import type {
  DecisionRecord,
  Mandate,
  ShoppingRequest,
  SimulatedOrder,
  SimulationEvent,
} from "@/domain/contracts";
import type { CheckpointRepository } from "@/domain/services";

export type OfferObservedEvent = Extract<SimulationEvent, { type: "OFFER_OBSERVED" }>;

export interface DecisionScope {
  requestId: string;
  requestVersion: number;
  runId: string;
}

export interface EvaluationRepository extends CheckpointRepository {
  getLatestRequest(effectiveAt?: string): Promise<ShoppingRequest | null>;
  getCurrentRequest(requestId: string, effectiveAt?: string): Promise<ShoppingRequest | null>;
  saveRequestTransition(request: ShoppingRequest, revokedMandate?: Mandate): Promise<void>;
  listDecisionsForRun(scope: DecisionScope): Promise<readonly DecisionRecord[]>;
  resetToRequest(request: ShoppingRequest): Promise<void>;
  saveEventIfCurrent(event: SimulationEvent, expectedSequence: number): Promise<boolean>;
  saveEvaluation(
    request: ShoppingRequest,
    event: OfferObservedEvent,
    decision: DecisionRecord,
    expectedSequence: number,
  ): Promise<boolean>;
  saveReevaluation(
    request: ShoppingRequest,
    event: SimulationEvent,
    decision: DecisionRecord,
    expectedSequence: number,
  ): Promise<boolean>;
  commitPurchase(input: {
    request: ShoppingRequest;
    event: SimulationEvent;
    decision: DecisionRecord;
    activeMandate: Mandate;
    consumedMandate: Mandate;
    order: SimulatedOrder;
    expectedSequence: number;
  }): Promise<boolean>;
}

export class EvaluationPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationPersistenceError";
  }
}

export function assertEvaluationCorrelation(
  request: ShoppingRequest,
  event: SimulationEvent,
  decision: DecisionRecord,
): void {
  const eventOfferId = event.type === "OFFER_OBSERVED"
    ? event.offer.id
    : "offerId" in event
      ? event.offerId
      : null;
  const references: Array<readonly [string, string | number, string | number]> = [
    ["event", decision.eventId, event.id],
    ["evidence", decision.evidence.offerId, decision.offer.id],
    ["match", decision.match.offerId, decision.offer.id],
    ...(decision.landedCost ? [["landed cost", decision.landedCost.offerId, decision.offer.id] as const] : []),
    ["request", decision.requestId, request.id],
    ["request version", decision.requestVersion, request.version],
  ];

  if (eventOfferId !== null) references.push(["offer", decision.offer.id, eventOfferId]);
  if (event.type === "SELLER_CHANGED") references.push(["seller", decision.offer.sellerId, event.sellerId]);

  for (const [label, actual, expected] of references) {
    if (actual !== expected) {
      throw new EvaluationPersistenceError(
        `Cannot persist evaluation: ${label} reference ${actual} does not match ${expected}.`,
      );
    }
  }
}
