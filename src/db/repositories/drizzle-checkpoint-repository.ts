import { and, asc, eq } from "drizzle-orm";

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
import type { ShoppingDatabase } from "@/db/client";
import { decisionRecords, offerSnapshots, requestVersions, simulatedOrders, simulationEvents } from "@/db/schema";

const serialize = (value: unknown) => JSON.stringify(value);

export class DrizzleCheckpointRepository implements CheckpointRepository {
  constructor(private readonly db: ShoppingDatabase) {}

  async reset(): Promise<void> {
    this.db.transaction((tx) => {
      tx.delete(simulatedOrders).run();
      tx.delete(decisionRecords).run();
      tx.delete(offerSnapshots).run();
      tx.delete(simulationEvents).run();
      tx.delete(requestVersions).run();
    });
  }

  async saveRequest(request: ShoppingRequest): Promise<void> {
    const parsed = ShoppingRequestSchema.parse(request);
    this.db.insert(requestVersions).values({
      id: parsed.id,
      version: parsed.version,
      effectiveAt: parsed.effectiveAt,
      payload: serialize(parsed),
      createdAt: parsed.effectiveAt,
    }).onConflictDoUpdate({
      target: [requestVersions.id, requestVersions.version],
      set: { payload: serialize(parsed), effectiveAt: parsed.effectiveAt },
    }).run();
  }

  async getRequest(id: string, version: number): Promise<ShoppingRequest | null> {
    const row = this.db.select().from(requestVersions).where(and(eq(requestVersions.id, id), eq(requestVersions.version, version))).get();
    return row ? ShoppingRequestSchema.parse(JSON.parse(row.payload)) : null;
  }

  async saveEvent(event: SimulationEvent): Promise<void> {
    const parsed = SimulationEventSchema.parse(event);
    this.db.transaction((tx) => {
      tx.insert(simulationEvents).values({
        id: parsed.id,
        runId: parsed.runId,
        sequence: parsed.sequence,
        occurredAt: parsed.occurredAt,
        payload: serialize(parsed),
        createdAt: parsed.occurredAt,
      }).onConflictDoNothing().run();
      if (parsed.type === "OFFER_OBSERVED") {
        tx.insert(offerSnapshots).values({
          id: parsed.offer.id,
          listingId: parsed.offer.listingId,
          merchantId: parsed.offer.merchantId,
          observedAt: parsed.offer.observedAt,
          payload: serialize(parsed.offer),
          createdAt: parsed.offer.observedAt,
        }).onConflictDoNothing().run();
      }
    });
  }

  async listEvents(runId: string): Promise<readonly SimulationEvent[]> {
    const rows = this.db.select().from(simulationEvents).where(eq(simulationEvents.runId, runId)).orderBy(asc(simulationEvents.sequence)).all();
    return rows.map((row) => SimulationEventSchema.parse(JSON.parse(row.payload)));
  }

  async saveDecision(decision: DecisionRecord): Promise<void> {
    const parsed = DecisionRecordSchema.parse(decision);
    this.db.insert(decisionRecords).values({
      id: parsed.id,
      requestId: parsed.requestId,
      requestVersion: parsed.requestVersion,
      eventId: parsed.eventId,
      outcome: parsed.outcome,
      decidedAt: parsed.decidedAt,
      payload: serialize(parsed),
      createdAt: parsed.decidedAt,
    }).onConflictDoNothing().run();
  }

  async listDecisions(requestId: string): Promise<readonly DecisionRecord[]> {
    const rows = this.db.select().from(decisionRecords).where(eq(decisionRecords.requestId, requestId)).orderBy(asc(decisionRecords.decidedAt)).all();
    return rows.map((row) => DecisionRecordSchema.parse(JSON.parse(row.payload)));
  }

  async saveOrder(order: SimulatedOrder): Promise<void> {
    const parsed = SimulatedOrderSchema.parse(order);
    this.db.insert(simulatedOrders).values({
      id: parsed.id,
      idempotencyKey: parsed.idempotencyKey,
      requestId: parsed.requestId,
      decisionId: parsed.decisionId,
      createdAt: parsed.createdAt,
      payload: serialize(parsed),
    }).onConflictDoNothing().run();
  }
}
