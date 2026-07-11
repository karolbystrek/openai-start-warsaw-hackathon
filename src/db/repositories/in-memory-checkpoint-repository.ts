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

  async saveEvent(event: SimulationEvent): Promise<void> {
    const parsed = SimulationEventSchema.parse(event);
    const existing = this.events.find(
      (item) => item.id === parsed.id || (item.runId === parsed.runId && item.sequence === parsed.sequence),
    );
    if (existing) requireSamePayload(`Event ${parsed.id}`, existing, parsed);
    else this.events.push(parsed);
  }

  async listEvents(runId: string): Promise<readonly SimulationEvent[]> {
    return this.events.filter((event) => event.runId === runId).sort((a, b) => a.sequence - b.sequence);
  }

  async saveDecision(decision: DecisionRecord): Promise<void> {
    const parsed = DecisionRecordSchema.parse(decision);
    const existing = this.decisions.find(
      (item) => item.id === parsed.id || item.eventId === parsed.eventId,
    );
    if (existing) requireSamePayload(`Decision ${parsed.id}`, existing, parsed);
    else this.decisions.push(parsed);
  }

  async saveEvaluation(event: OfferObservedEvent, decision: DecisionRecord): Promise<void> {
    const parsedEvent = SimulationEventSchema.parse(event);
    if (parsedEvent.type !== "OFFER_OBSERVED") {
      throw new EvaluationPersistenceError("Only observed offers can be saved as an evaluation.");
    }
    const parsedDecision = DecisionRecordSchema.parse(decision);
    assertEvaluationCorrelation(parsedEvent, parsedDecision);

    const existingEvent = this.events.find(
      (item) => item.id === parsedEvent.id || (item.runId === parsedEvent.runId && item.sequence === parsedEvent.sequence),
    );
    const existingDecision = this.decisions.find(
      (item) => item.id === parsedDecision.id || item.eventId === parsedDecision.eventId,
    );
    if (existingEvent) requireSamePayload(`Event ${parsedEvent.id}`, existingEvent, parsedEvent);
    if (existingDecision) requireSamePayload(`Decision ${parsedDecision.id}`, existingDecision, parsedDecision);

    if (!existingEvent) this.events.push(parsedEvent);
    if (!existingDecision) this.decisions.push(parsedDecision);
  }

  async listDecisions(requestId: string): Promise<readonly DecisionRecord[]> {
    return this.decisions.filter((decision) => decision.requestId === requestId);
  }

  async saveOrder(order: SimulatedOrder): Promise<void> {
    const parsed = SimulatedOrderSchema.parse(order);
    const existing = [...this.orders.values()].find(
      (item) => item.id === parsed.id || item.idempotencyKey === parsed.idempotencyKey,
    );
    if (existing) requireSamePayload(`Order ${parsed.idempotencyKey}`, existing, parsed);
    else this.orders.set(parsed.id, parsed);
  }
}
