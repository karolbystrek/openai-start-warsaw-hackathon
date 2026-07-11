import {
  DecisionRecordSchema,
  ShoppingRequestSchema,
  SimulatedOrderSchema,
  SimulationEventSchema,
  type DecisionRecord,
  type ShoppingRequest,
  type SimulatedOrder,
  type SimulationEvent,
} from "@/domain/contracts";
import {
  type DecisionScope,
  EvaluationPersistenceError,
  assertEvaluationCorrelation,
  type EvaluationRepository,
  type OfferObservedEvent,
} from "@/application/evaluation-repository";

const serialize = (value: unknown) => JSON.stringify(value);

function requireSamePayload(label: string, existing: unknown, incoming: unknown): void {
  if (serialize(existing) !== serialize(incoming)) {
    throw new EvaluationPersistenceError(`${label} already exists with a different payload.`);
  }
}

export class InMemoryCheckpointRepository implements EvaluationRepository {
  private requests = new Map<string, ShoppingRequest>();
  private events: SimulationEvent[] = [];
  private decisions: DecisionRecord[] = [];
  private orders = new Map<string, SimulatedOrder>();

  async reset(): Promise<void> {
    this.requests.clear();
    this.events = [];
    this.decisions = [];
    this.orders.clear();
  }

  async resetToRequest(request: ShoppingRequest): Promise<void> {
    const parsed = ShoppingRequestSchema.parse(request);
    this.requests.clear();
    this.events = [];
    this.decisions = [];
    this.orders.clear();
    this.requests.set(`${parsed.id}:${parsed.version}`, parsed);
  }

  async saveRequest(request: ShoppingRequest): Promise<void> {
    const parsed = ShoppingRequestSchema.parse(request);
    const key = `${parsed.id}:${parsed.version}`;
    const existing = this.requests.get(key);
    if (existing) requireSamePayload(`Request ${key}`, existing, parsed);
    else this.requests.set(key, parsed);
  }

  async getRequest(id: string, version: number): Promise<ShoppingRequest | null> {
    return this.requests.get(`${id}:${version}`) ?? null;
  }

  async getCurrentRequest(requestId: string, effectiveAt?: string): Promise<ShoppingRequest | null> {
    return [...this.requests.values()]
      .filter((request) => request.id === requestId && (!effectiveAt || request.effectiveAt <= effectiveAt))
      .sort((left, right) => right.version - left.version)[0] ?? null;
  }

  async saveEvent(event: SimulationEvent): Promise<void> {
    const parsed = SimulationEventSchema.parse(event);
    const existing = this.events.find(
      (item) => item.id === parsed.id || (item.runId === parsed.runId && item.sequence === parsed.sequence),
    );
    if (existing) requireSamePayload(`Event ${parsed.id}`, existing, parsed);
    else this.events.push(parsed);
  }

  async saveEventIfCurrent(event: SimulationEvent, expectedSequence: number): Promise<boolean> {
    const parsed = SimulationEventSchema.parse(event);
    if (parsed.sequence !== expectedSequence) {
      throw new EvaluationPersistenceError(
        `Event sequence ${parsed.sequence} does not match expected sequence ${expectedSequence}.`,
      );
    }
    if (this.nextSequence(parsed.runId) !== expectedSequence) return false;
    await this.saveEvent(parsed);
    return true;
  }

  async listEvents(runId: string): Promise<readonly SimulationEvent[]> {
    return this.events.filter((event) => event.runId === runId).sort((a, b) => a.sequence - b.sequence);
  }

  async saveDecision(decision: DecisionRecord): Promise<void> {
    const parsed = DecisionRecordSchema.parse(decision);
    const existing = this.decisions.find(
      (item) => item.id === parsed.id || (
        item.requestId === parsed.requestId
        && item.requestVersion === parsed.requestVersion
        && item.eventId === parsed.eventId
        && item.policyVersion === parsed.policyVersion
      ),
    );
    if (existing) requireSamePayload(`Decision ${parsed.id}`, existing, parsed);
    else this.decisions.push(parsed);
  }

  async saveEvaluation(
    request: ShoppingRequest,
    event: OfferObservedEvent,
    decision: DecisionRecord,
    expectedSequence: number,
  ): Promise<boolean> {
    const parsedRequest = ShoppingRequestSchema.parse(request);
    const parsedEvent = SimulationEventSchema.parse(event);
    if (parsedEvent.type !== "OFFER_OBSERVED") {
      throw new EvaluationPersistenceError("Only observed offers can be saved as an evaluation.");
    }
    const parsedDecision = DecisionRecordSchema.parse(decision);
    assertEvaluationCorrelation(parsedRequest, parsedEvent, parsedDecision);
    if (parsedEvent.sequence !== expectedSequence) {
      throw new EvaluationPersistenceError(
        `Event sequence ${parsedEvent.sequence} does not match expected sequence ${expectedSequence}.`,
      );
    }
    if (this.nextSequence(parsedEvent.runId) !== expectedSequence) return false;

    const existingEvent = this.events.find(
      (item) => item.id === parsedEvent.id || (item.runId === parsedEvent.runId && item.sequence === parsedEvent.sequence),
    );
    const existingDecision = this.decisions.find(
      (item) => item.id === parsedDecision.id || (
        item.requestId === parsedDecision.requestId
        && item.requestVersion === parsedDecision.requestVersion
        && item.eventId === parsedDecision.eventId
        && item.policyVersion === parsedDecision.policyVersion
      ),
    );
    if (existingEvent) requireSamePayload(`Event ${parsedEvent.id}`, existingEvent, parsedEvent);
    if (existingDecision) requireSamePayload(`Decision ${parsedDecision.id}`, existingDecision, parsedDecision);

    if (!existingEvent) this.events.push(parsedEvent);
    if (!existingDecision) this.decisions.push(parsedDecision);
    return true;
  }

  async listDecisions(requestId: string): Promise<readonly DecisionRecord[]> {
    return this.decisions.filter((decision) => decision.requestId === requestId);
  }

  async listDecisionsForRun(scope: DecisionScope): Promise<readonly DecisionRecord[]> {
    const eventIds = new Set(
      this.events.filter((event) => event.runId === scope.runId).map((event) => event.id),
    );
    return this.decisions.filter((decision) => (
      decision.requestId === scope.requestId
      && decision.requestVersion === scope.requestVersion
      && eventIds.has(decision.eventId)
    ));
  }

  async saveOrder(order: SimulatedOrder): Promise<void> {
    const parsed = SimulatedOrderSchema.parse(order);
    const existing = [...this.orders.values()].find(
      (item) => item.id === parsed.id || item.idempotencyKey === parsed.idempotencyKey,
    );
    if (existing) requireSamePayload(`Order ${parsed.idempotencyKey}`, existing, parsed);
    else this.orders.set(parsed.id, parsed);
  }

  private nextSequence(runId: string): number {
    const sequences = this.events
      .filter((event) => event.runId === runId)
      .map((event) => event.sequence)
      .sort((left, right) => left - right);
    for (const [index, sequence] of sequences.entries()) {
      if (sequence !== index) {
        throw new EvaluationPersistenceError(`Run ${runId} has a non-contiguous event sequence.`);
      }
    }
    return sequences.length;
  }
}
