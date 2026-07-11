import { and, asc, eq } from "drizzle-orm";

import {
  EvaluationPersistenceError,
  assertEvaluationCorrelation,
  type EvaluationRepository,
  type OfferObservedEvent,
} from "@/application/evaluation-repository";
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
import type { ShoppingDatabase } from "@/db/client";
import { decisionRecords, offerSnapshots, requestVersions, simulatedOrders, simulationEvents } from "@/db/schema";

const serialize = (value: unknown) => JSON.stringify(value);

function requireSamePayload(label: string, existingPayload: string, incoming: unknown): void {
  if (existingPayload !== serialize(incoming)) {
    throw new EvaluationPersistenceError(`${label} already exists with a different payload.`);
  }
}

export class DrizzleCheckpointRepository implements EvaluationRepository {
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
    const existing = this.db.select().from(requestVersions).where(
      and(eq(requestVersions.id, parsed.id), eq(requestVersions.version, parsed.version)),
    ).get();
    if (existing) {
      requireSamePayload(`Request ${parsed.id}:${parsed.version}`, existing.payload, parsed);
      return;
    }
    this.db.insert(requestVersions).values({
      id: parsed.id,
      version: parsed.version,
      effectiveAt: parsed.effectiveAt,
      payload: serialize(parsed),
      createdAt: parsed.effectiveAt,
    }).run();
  }

  async getRequest(id: string, version: number): Promise<ShoppingRequest | null> {
    const row = this.db.select().from(requestVersions).where(and(eq(requestVersions.id, id), eq(requestVersions.version, version))).get();
    return row ? ShoppingRequestSchema.parse(JSON.parse(row.payload)) : null;
  }

  async saveEvent(event: SimulationEvent): Promise<void> {
    const parsed = SimulationEventSchema.parse(event);
    this.db.transaction((tx) => {
      const existingEvent = tx.select().from(simulationEvents).where(
        eq(simulationEvents.id, parsed.id),
      ).get() ?? tx.select().from(simulationEvents).where(
        and(eq(simulationEvents.runId, parsed.runId), eq(simulationEvents.sequence, parsed.sequence)),
      ).get();
      if (existingEvent) requireSamePayload(`Event ${parsed.id}`, existingEvent.payload, parsed);
      else {
        tx.insert(simulationEvents).values({
          id: parsed.id,
          runId: parsed.runId,
          sequence: parsed.sequence,
          occurredAt: parsed.occurredAt,
          payload: serialize(parsed),
          createdAt: parsed.occurredAt,
        }).run();
      }
      if (parsed.type === "OFFER_OBSERVED") {
        const existingOffer = tx.select().from(offerSnapshots).where(eq(offerSnapshots.id, parsed.offer.id)).get();
        if (existingOffer) requireSamePayload(`Offer ${parsed.offer.id}`, existingOffer.payload, parsed.offer);
        else {
          tx.insert(offerSnapshots).values({
            id: parsed.offer.id,
            listingId: parsed.offer.listingId,
            merchantId: parsed.offer.merchantId,
            observedAt: parsed.offer.observedAt,
            payload: serialize(parsed.offer),
            createdAt: parsed.offer.observedAt,
          }).run();
        }
      }
    });
  }

  async listEvents(runId: string): Promise<readonly SimulationEvent[]> {
    const rows = this.db.select().from(simulationEvents).where(eq(simulationEvents.runId, runId)).orderBy(asc(simulationEvents.sequence)).all();
    return rows.map((row) => SimulationEventSchema.parse(JSON.parse(row.payload)));
  }

  async saveDecision(decision: DecisionRecord): Promise<void> {
    const parsed = DecisionRecordSchema.parse(decision);
    const existing = this.db.select().from(decisionRecords).where(
      eq(decisionRecords.id, parsed.id),
    ).get() ?? this.db.select().from(decisionRecords).where(
      eq(decisionRecords.eventId, parsed.eventId),
    ).get();
    if (existing) {
      requireSamePayload(`Decision ${parsed.id}`, existing.payload, parsed);
      return;
    }
    this.db.insert(decisionRecords).values({
      id: parsed.id,
      requestId: parsed.requestId,
      requestVersion: parsed.requestVersion,
      eventId: parsed.eventId,
      outcome: parsed.outcome,
      decidedAt: parsed.decidedAt,
      payload: serialize(parsed),
      createdAt: parsed.decidedAt,
    }).run();
  }

  async saveEvaluation(event: OfferObservedEvent, decision: DecisionRecord): Promise<void> {
    const parsedEvent = SimulationEventSchema.parse(event);
    if (parsedEvent.type !== "OFFER_OBSERVED") {
      throw new EvaluationPersistenceError("Only observed offers can be saved as an evaluation.");
    }
    const parsedDecision = DecisionRecordSchema.parse(decision);
    assertEvaluationCorrelation(parsedEvent, parsedDecision);

    this.db.transaction((tx) => {
      const existingEvent = tx.select().from(simulationEvents).where(
        eq(simulationEvents.id, parsedEvent.id),
      ).get() ?? tx.select().from(simulationEvents).where(
        and(eq(simulationEvents.runId, parsedEvent.runId), eq(simulationEvents.sequence, parsedEvent.sequence)),
      ).get();
      const existingOffer = tx.select().from(offerSnapshots).where(
        eq(offerSnapshots.id, parsedEvent.offer.id),
      ).get();
      const existingDecision = tx.select().from(decisionRecords).where(
        eq(decisionRecords.id, parsedDecision.id),
      ).get() ?? tx.select().from(decisionRecords).where(
        eq(decisionRecords.eventId, parsedDecision.eventId),
      ).get();

      if (existingEvent) requireSamePayload(`Event ${parsedEvent.id}`, existingEvent.payload, parsedEvent);
      if (existingOffer) requireSamePayload(`Offer ${parsedEvent.offer.id}`, existingOffer.payload, parsedEvent.offer);
      if (existingDecision) requireSamePayload(`Decision ${parsedDecision.id}`, existingDecision.payload, parsedDecision);

      if (!existingEvent) {
        tx.insert(simulationEvents).values({
          id: parsedEvent.id,
          runId: parsedEvent.runId,
          sequence: parsedEvent.sequence,
          occurredAt: parsedEvent.occurredAt,
          payload: serialize(parsedEvent),
          createdAt: parsedEvent.occurredAt,
        }).run();
      }
      if (!existingOffer) {
        tx.insert(offerSnapshots).values({
          id: parsedEvent.offer.id,
          listingId: parsedEvent.offer.listingId,
          merchantId: parsedEvent.offer.merchantId,
          observedAt: parsedEvent.offer.observedAt,
          payload: serialize(parsedEvent.offer),
          createdAt: parsedEvent.offer.observedAt,
        }).run();
      }
      if (!existingDecision) {
        tx.insert(decisionRecords).values({
          id: parsedDecision.id,
          requestId: parsedDecision.requestId,
          requestVersion: parsedDecision.requestVersion,
          eventId: parsedDecision.eventId,
          outcome: parsedDecision.outcome,
          decidedAt: parsedDecision.decidedAt,
          payload: serialize(parsedDecision),
          createdAt: parsedDecision.decidedAt,
        }).run();
      }
    });
  }

  async listDecisions(requestId: string): Promise<readonly DecisionRecord[]> {
    const rows = this.db.select().from(decisionRecords).where(eq(decisionRecords.requestId, requestId)).orderBy(asc(decisionRecords.decidedAt)).all();
    return rows.map((row) => DecisionRecordSchema.parse(JSON.parse(row.payload)));
  }

  async saveOrder(order: SimulatedOrder): Promise<void> {
    const parsed = SimulatedOrderSchema.parse(order);
    const existing = this.db.select().from(simulatedOrders).where(
      eq(simulatedOrders.id, parsed.id),
    ).get() ?? this.db.select().from(simulatedOrders).where(
      eq(simulatedOrders.idempotencyKey, parsed.idempotencyKey),
    ).get();
    if (existing) {
      requireSamePayload(`Order ${parsed.idempotencyKey}`, existing.payload, parsed);
      return;
    }
    this.db.insert(simulatedOrders).values({
      id: parsed.id,
      idempotencyKey: parsed.idempotencyKey,
      requestId: parsed.requestId,
      decisionId: parsed.decisionId,
      createdAt: parsed.createdAt,
      payload: serialize(parsed),
    }).run();
  }
}
