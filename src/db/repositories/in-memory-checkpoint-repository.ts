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
import type { CheckpointRepository } from "@/domain/services";

export class InMemoryCheckpointRepository implements CheckpointRepository {
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
    this.requests.set(`${parsed.id}:${parsed.version}`, parsed);
  }

  async getRequest(id: string, version: number): Promise<ShoppingRequest | null> {
    return this.requests.get(`${id}:${version}`) ?? null;
  }

  async saveEvent(event: SimulationEvent): Promise<void> {
    const parsed = SimulationEventSchema.parse(event);
    if (!this.events.some((item) => item.id === parsed.id)) this.events.push(parsed);
  }

  async listEvents(runId: string): Promise<readonly SimulationEvent[]> {
    return this.events.filter((event) => event.runId === runId).sort((a, b) => a.sequence - b.sequence);
  }

  async saveDecision(decision: DecisionRecord): Promise<void> {
    const parsed = DecisionRecordSchema.parse(decision);
    if (!this.decisions.some((item) => item.id === parsed.id)) this.decisions.push(parsed);
  }

  async listDecisions(requestId: string): Promise<readonly DecisionRecord[]> {
    return this.decisions.filter((decision) => decision.requestId === requestId);
  }

  async saveOrder(order: SimulatedOrder): Promise<void> {
    const parsed = SimulatedOrderSchema.parse(order);
    if (![...this.orders.values()].some((item) => item.idempotencyKey === parsed.idempotencyKey)) this.orders.set(parsed.id, parsed);
  }
}
