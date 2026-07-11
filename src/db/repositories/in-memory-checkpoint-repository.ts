import {
  DecisionRecordSchema,
  MandateSchema,
  ShoppingRequestSchema,
  SimulatedOrderSchema,
  SimulationEventSchema,
  type DecisionRecord,
  type Mandate,
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
  private mandates = new Map<string, Mandate>();
  private orders = new Map<string, SimulatedOrder>();

  async reset(): Promise<void> {
    this.requests.clear();
    this.events = [];
    this.decisions = [];
    this.mandates.clear();
    this.orders.clear();
  }

  async resetToRequest(request: ShoppingRequest): Promise<void> {
    const parsed = ShoppingRequestSchema.parse(request);
    this.requests.clear();
    this.events = [];
    this.decisions = [];
    this.mandates.clear();
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

  async saveRequestTransition(request: ShoppingRequest, revokedMandate?: Mandate): Promise<void> {
    const parsedRequest = ShoppingRequestSchema.parse(request);
    const parsedMandate = revokedMandate ? MandateSchema.parse(revokedMandate) : null;
    if (this.requests.has(`${parsedRequest.id}:${parsedRequest.version}`)) {
      throw new EvaluationPersistenceError("Request transition version already exists.");
    }
    if (parsedMandate && (parsedMandate.status !== "REVOKED"
      || parsedMandate.requestId !== parsedRequest.id
      || parsedMandate.requestVersion !== parsedRequest.version - 1)) {
      throw new EvaluationPersistenceError("Request transition mandate revocation is inconsistent.");
    }
    this.requests.set(`${parsedRequest.id}:${parsedRequest.version}`, parsedRequest);
    if (parsedMandate) {
      this.mandates.set(`${parsedMandate.id}:${parsedMandate.version}`, parsedMandate);
    }
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

  async saveMandate(mandate: Mandate): Promise<void> {
    const parsed = MandateSchema.parse(mandate);
    const key = `${parsed.id}:${parsed.version}`;
    const existing = this.mandates.get(key);
    if (existing) requireSamePayload(`Mandate ${key}`, existing, parsed);
    else this.mandates.set(key, parsed);
  }

  async getCurrentMandate(
    requestId: string,
    requestVersion: number,
    effectiveAt?: string,
  ): Promise<Mandate | null> {
    return [...this.mandates.values()]
      .filter((mandate) => mandate.requestId === requestId
        && mandate.requestVersion === requestVersion
        && (!effectiveAt || mandate.effectiveAt <= effectiveAt))
      .sort((left, right) => right.version - left.version)[0] ?? null;
  }

  async saveOrder(order: SimulatedOrder): Promise<void> {
    const parsed = SimulatedOrderSchema.parse(order);
    const existing = [...this.orders.values()].find(
      (item) => item.id === parsed.id || item.idempotencyKey === parsed.idempotencyKey,
    );
    if (existing) requireSamePayload(`Order ${parsed.idempotencyKey}`, existing, parsed);
    else this.orders.set(parsed.id, parsed);
  }

  async listOrders(requestId: string): Promise<readonly SimulatedOrder[]> {
    return [...this.orders.values()]
      .filter((order) => order.requestId === requestId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async saveReevaluation(
    request: ShoppingRequest,
    event: SimulationEvent,
    decision: DecisionRecord,
    expectedSequence: number,
  ): Promise<boolean> {
    const parsedRequest = ShoppingRequestSchema.parse(request);
    const parsedEvent = SimulationEventSchema.parse(event);
    const parsedDecision = DecisionRecordSchema.parse(decision);
    assertEvaluationCorrelation(parsedRequest, parsedEvent, parsedDecision);
    if (parsedEvent.sequence !== expectedSequence) {
      throw new EvaluationPersistenceError(
        `Event sequence ${parsedEvent.sequence} does not match expected sequence ${expectedSequence}.`,
      );
    }
    if (this.nextSequence(parsedEvent.runId) !== expectedSequence) return false;
    this.events.push(parsedEvent);
    this.decisions.push(parsedDecision);
    return true;
  }

  async commitPurchase(input: {
    request: ShoppingRequest;
    event: SimulationEvent;
    decision: DecisionRecord;
    activeMandate: Mandate;
    consumedMandate: Mandate;
    order: SimulatedOrder;
    expectedSequence: number;
  }): Promise<boolean> {
    const request = ShoppingRequestSchema.parse(input.request);
    const event = SimulationEventSchema.parse(input.event);
    const decision = DecisionRecordSchema.parse(input.decision);
    const activeMandate = MandateSchema.parse(input.activeMandate);
    const consumedMandate = MandateSchema.parse(input.consumedMandate);
    const order = SimulatedOrderSchema.parse(input.order);
    assertEvaluationCorrelation(request, event, decision);
    if (event.sequence !== input.expectedSequence) {
      throw new EvaluationPersistenceError(
        `Event sequence ${event.sequence} does not match expected sequence ${input.expectedSequence}.`,
      );
    }
    const existingOrder = [...this.orders.values()].find(
      (item) => item.idempotencyKey === order.idempotencyKey,
    );
    if (existingOrder) {
      requireSamePayload(`Order ${order.idempotencyKey}`, existingOrder, order);
      return true;
    }
    if (this.nextSequence(event.runId) !== input.expectedSequence) return false;
    const currentMandate = await this.getCurrentMandate(request.id, request.version);
    if (!currentMandate || serialize(currentMandate) !== serialize(activeMandate)) return false;
    if (decision.outcome !== "BUY_SIMULATED"
      || consumedMandate.id !== activeMandate.id
      || consumedMandate.version !== activeMandate.version + 1
      || consumedMandate.status !== "CONSUMED"
      || order.decisionId !== decision.id) {
      throw new EvaluationPersistenceError("Purchase records are inconsistent.");
    }
    this.events.push(event);
    this.decisions.push(decision);
    this.mandates.set(`${consumedMandate.id}:${consumedMandate.version}`, consumedMandate);
    this.orders.set(order.id, order);
    return true;
  }

  async getOrderByDecision(decisionId: string): Promise<SimulatedOrder | null> {
    return [...this.orders.values()].find((order) => order.decisionId === decisionId) ?? null;
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
