import { and, asc, desc, eq, lte } from "drizzle-orm";

import {
  type DecisionScope,
  EvaluationPersistenceError,
  assertEvaluationCorrelation,
  type EvaluationRepository,
  type OfferObservedEvent,
} from "@/application/evaluation-repository";
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
import type { ShoppingDatabase } from "@/db/client";
import {
  decisionRecords,
  mandateVersions,
  offerSnapshots,
  requestVersions,
  simulatedOrders,
  simulationEvents,
} from "@/db/schema";

const serialize = (value: unknown) => JSON.stringify(value);

function requireSamePayload(label: string, existingPayload: string, incoming: unknown): void {
  if (existingPayload !== serialize(incoming)) {
    throw new EvaluationPersistenceError(`${label} already exists with a different payload.`);
  }
}

function currentNextSequence(rows: readonly { sequence: number }[], runId: string): number {
  for (const [index, row] of rows.entries()) {
    if (row.sequence !== index) {
      throw new EvaluationPersistenceError(`Run ${runId} has a non-contiguous event sequence.`);
    }
  }
  return rows.length;
}

export class DrizzleCheckpointRepository implements EvaluationRepository {
  constructor(private readonly db: ShoppingDatabase) {}

  async reset(): Promise<void> {
    this.db.transaction((tx) => {
      tx.delete(simulatedOrders).run();
      tx.delete(mandateVersions).run();
      tx.delete(decisionRecords).run();
      tx.delete(offerSnapshots).run();
      tx.delete(simulationEvents).run();
      tx.delete(requestVersions).run();
    }, { behavior: "immediate" });
  }

  async resetToRequest(request: ShoppingRequest): Promise<void> {
    const parsed = ShoppingRequestSchema.parse(request);
    this.db.transaction((tx) => {
      tx.delete(simulatedOrders).run();
      tx.delete(mandateVersions).run();
      tx.delete(decisionRecords).run();
      tx.delete(offerSnapshots).run();
      tx.delete(simulationEvents).run();
      tx.delete(requestVersions).run();
      tx.insert(requestVersions).values({
        id: parsed.id,
        version: parsed.version,
        effectiveAt: parsed.effectiveAt,
        payload: serialize(parsed),
        createdAt: parsed.effectiveAt,
      }).run();
    }, { behavior: "immediate" });
  }

  async saveRequest(request: ShoppingRequest): Promise<void> {
    const parsed = ShoppingRequestSchema.parse(request);
    this.db.transaction((tx) => {
      const existing = tx.select().from(requestVersions).where(
        and(eq(requestVersions.id, parsed.id), eq(requestVersions.version, parsed.version)),
      ).get();
      if (existing) {
        requireSamePayload(`Request ${parsed.id}:${parsed.version}`, existing.payload, parsed);
        return;
      }
      tx.insert(requestVersions).values({
        id: parsed.id,
        version: parsed.version,
        effectiveAt: parsed.effectiveAt,
        payload: serialize(parsed),
        createdAt: parsed.effectiveAt,
      }).run();
    }, { behavior: "immediate" });
  }

  async saveRequestTransition(request: ShoppingRequest, revokedMandate?: Mandate): Promise<void> {
    const parsedRequest = ShoppingRequestSchema.parse(request);
    const parsedMandate = revokedMandate ? MandateSchema.parse(revokedMandate) : null;
    if (parsedMandate && (parsedMandate.status !== "REVOKED"
      || parsedMandate.requestId !== parsedRequest.id
      || parsedMandate.requestVersion !== parsedRequest.version - 1)) {
      throw new EvaluationPersistenceError("Request transition mandate revocation is inconsistent.");
    }
    this.db.transaction((tx) => {
      tx.insert(requestVersions).values({
        id: parsedRequest.id,
        version: parsedRequest.version,
        effectiveAt: parsedRequest.effectiveAt,
        payload: serialize(parsedRequest),
        createdAt: parsedRequest.effectiveAt,
      }).run();
      if (parsedMandate) {
        tx.insert(mandateVersions).values({
          id: parsedMandate.id,
          version: parsedMandate.version,
          requestId: parsedMandate.requestId,
          requestVersion: parsedMandate.requestVersion,
          status: parsedMandate.status,
          effectiveAt: parsedMandate.effectiveAt,
          expiresAt: parsedMandate.expiresAt,
          payload: serialize(parsedMandate),
          createdAt: parsedMandate.effectiveAt,
        }).run();
      }
    }, { behavior: "immediate" });
  }

  async getRequest(id: string, version: number): Promise<ShoppingRequest | null> {
    const row = this.db.select().from(requestVersions).where(and(eq(requestVersions.id, id), eq(requestVersions.version, version))).get();
    return row ? ShoppingRequestSchema.parse(JSON.parse(row.payload)) : null;
  }

  async getLatestRequest(effectiveAt?: string): Promise<ShoppingRequest | null> {
    const query = this.db.select().from(requestVersions);
    const row = (effectiveAt ? query.where(lte(requestVersions.effectiveAt, effectiveAt)) : query)
      .orderBy(desc(requestVersions.createdAt), desc(requestVersions.version))
      .get();
    return row ? ShoppingRequestSchema.parse(JSON.parse(row.payload)) : null;
  }

  async getCurrentRequest(requestId: string, effectiveAt?: string): Promise<ShoppingRequest | null> {
    const condition = effectiveAt
      ? and(eq(requestVersions.id, requestId), lte(requestVersions.effectiveAt, effectiveAt))
      : eq(requestVersions.id, requestId);
    const row = this.db.select().from(requestVersions)
      .where(condition)
      .orderBy(desc(requestVersions.version))
      .get();
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
    }, { behavior: "immediate" });
  }

  async saveEventIfCurrent(event: SimulationEvent, expectedSequence: number): Promise<boolean> {
    const parsed = SimulationEventSchema.parse(event);
    if (parsed.sequence !== expectedSequence) {
      throw new EvaluationPersistenceError(
        `Event sequence ${parsed.sequence} does not match expected sequence ${expectedSequence}.`,
      );
    }

    return this.db.transaction((tx) => {
      const sequenceRows = tx.select({ sequence: simulationEvents.sequence })
        .from(simulationEvents)
        .where(eq(simulationEvents.runId, parsed.runId))
        .orderBy(asc(simulationEvents.sequence))
        .all();
      if (currentNextSequence(sequenceRows, parsed.runId) !== expectedSequence) return false;

      tx.insert(simulationEvents).values({
        id: parsed.id,
        runId: parsed.runId,
        sequence: parsed.sequence,
        occurredAt: parsed.occurredAt,
        payload: serialize(parsed),
        createdAt: parsed.occurredAt,
      }).run();
      if (parsed.type === "OFFER_OBSERVED") {
        tx.insert(offerSnapshots).values({
          id: parsed.offer.id,
          listingId: parsed.offer.listingId,
          merchantId: parsed.offer.merchantId,
          observedAt: parsed.offer.observedAt,
          payload: serialize(parsed.offer),
          createdAt: parsed.offer.observedAt,
        }).run();
      }
      return true;
    }, { behavior: "immediate" });
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
      and(
        eq(decisionRecords.requestId, parsed.requestId),
        eq(decisionRecords.requestVersion, parsed.requestVersion),
        eq(decisionRecords.eventId, parsed.eventId),
        eq(decisionRecords.policyVersion, parsed.policyVersion),
      ),
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
      policyVersion: parsed.policyVersion,
      outcome: parsed.outcome,
      decidedAt: parsed.decidedAt,
      payload: serialize(parsed),
      createdAt: parsed.decidedAt,
    }).run();
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

    return this.db.transaction((tx) => {
      const sequenceRows = tx.select({ sequence: simulationEvents.sequence })
        .from(simulationEvents)
        .where(eq(simulationEvents.runId, parsedEvent.runId))
        .orderBy(asc(simulationEvents.sequence))
        .all();
      if (currentNextSequence(sequenceRows, parsedEvent.runId) !== expectedSequence) return false;

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
        and(
          eq(decisionRecords.requestId, parsedDecision.requestId),
          eq(decisionRecords.requestVersion, parsedDecision.requestVersion),
          eq(decisionRecords.eventId, parsedDecision.eventId),
          eq(decisionRecords.policyVersion, parsedDecision.policyVersion),
        ),
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
          policyVersion: parsedDecision.policyVersion,
          outcome: parsedDecision.outcome,
          decidedAt: parsedDecision.decidedAt,
          payload: serialize(parsedDecision),
          createdAt: parsedDecision.decidedAt,
        }).run();
      }
      return true;
    }, { behavior: "immediate" });
  }

  async listDecisions(requestId: string): Promise<readonly DecisionRecord[]> {
    const rows = this.db.select().from(decisionRecords).where(eq(decisionRecords.requestId, requestId)).orderBy(asc(decisionRecords.decidedAt)).all();
    return rows.map((row) => DecisionRecordSchema.parse(JSON.parse(row.payload)));
  }

  async listDecisionsForRun(scope: DecisionScope): Promise<readonly DecisionRecord[]> {
    const rows = this.db.select({ payload: decisionRecords.payload })
      .from(decisionRecords)
      .innerJoin(simulationEvents, eq(decisionRecords.eventId, simulationEvents.id))
      .where(and(
        eq(decisionRecords.requestId, scope.requestId),
        eq(decisionRecords.requestVersion, scope.requestVersion),
        eq(simulationEvents.runId, scope.runId),
      ))
      .orderBy(asc(decisionRecords.decidedAt))
      .all();
    return rows.map((row) => DecisionRecordSchema.parse(JSON.parse(row.payload)));
  }

  async saveMandate(mandate: Mandate): Promise<void> {
    const parsed = MandateSchema.parse(mandate);
    this.db.transaction((tx) => {
      const existing = tx.select().from(mandateVersions).where(and(
        eq(mandateVersions.id, parsed.id),
        eq(mandateVersions.version, parsed.version),
      )).get();
      if (existing) {
        requireSamePayload(`Mandate ${parsed.id}:${parsed.version}`, existing.payload, parsed);
        return;
      }
      tx.insert(mandateVersions).values({
        id: parsed.id,
        version: parsed.version,
        requestId: parsed.requestId,
        requestVersion: parsed.requestVersion,
        status: parsed.status,
        effectiveAt: parsed.effectiveAt,
        expiresAt: parsed.expiresAt,
        payload: serialize(parsed),
        createdAt: parsed.effectiveAt,
      }).run();
    }, { behavior: "immediate" });
  }

  async getCurrentMandate(
    requestId: string,
    requestVersion: number,
    effectiveAt?: string,
  ): Promise<Mandate | null> {
    const requestScope = and(
      eq(mandateVersions.requestId, requestId),
      eq(mandateVersions.requestVersion, requestVersion),
    );
    const condition = effectiveAt
      ? and(requestScope, lte(mandateVersions.effectiveAt, effectiveAt))
      : requestScope;
    const row = this.db.select().from(mandateVersions)
      .where(condition)
      .orderBy(desc(mandateVersions.version))
      .get();
    return row ? MandateSchema.parse(JSON.parse(row.payload)) : null;
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

  async listOrders(requestId: string): Promise<readonly SimulatedOrder[]> {
    const rows = this.db.select().from(simulatedOrders)
      .where(eq(simulatedOrders.requestId, requestId))
      .orderBy(asc(simulatedOrders.createdAt))
      .all();
    return rows.map((row) => SimulatedOrderSchema.parse(JSON.parse(row.payload)));
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

    return this.db.transaction((tx) => {
      const sequenceRows = tx.select({ sequence: simulationEvents.sequence })
        .from(simulationEvents)
        .where(eq(simulationEvents.runId, parsedEvent.runId))
        .orderBy(asc(simulationEvents.sequence))
        .all();
      if (currentNextSequence(sequenceRows, parsedEvent.runId) !== expectedSequence) return false;

      tx.insert(simulationEvents).values({
        id: parsedEvent.id,
        runId: parsedEvent.runId,
        sequence: parsedEvent.sequence,
        occurredAt: parsedEvent.occurredAt,
        payload: serialize(parsedEvent),
        createdAt: parsedEvent.occurredAt,
      }).run();
      tx.insert(decisionRecords).values({
        id: parsedDecision.id,
        requestId: parsedDecision.requestId,
        requestVersion: parsedDecision.requestVersion,
        eventId: parsedDecision.eventId,
        policyVersion: parsedDecision.policyVersion,
        outcome: parsedDecision.outcome,
        decidedAt: parsedDecision.decidedAt,
        payload: serialize(parsedDecision),
        createdAt: parsedDecision.decidedAt,
      }).run();
      return true;
    }, { behavior: "immediate" });
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
    if (decision.outcome !== "BUY_SIMULATED" || decision.mandateId !== activeMandate.id) {
      throw new EvaluationPersistenceError("Only an authorized mandate decision can create a simulated order.");
    }
    if (consumedMandate.id !== activeMandate.id
      || consumedMandate.version !== activeMandate.version + 1
      || consumedMandate.status !== "CONSUMED"
      || consumedMandate.consumedAt !== event.occurredAt) {
      throw new EvaluationPersistenceError("Consumed mandate version is inconsistent with the authorized mandate.");
    }
    if (order.requestId !== request.id
      || order.requestVersion !== request.version
      || order.mandateId !== activeMandate.id
      || order.decisionId !== decision.id
      || order.offerId !== decision.offer.id
      || !decision.landedCost
      || serialize(order.paid) !== serialize(decision.landedCost.total)) {
      throw new EvaluationPersistenceError("Simulated order does not match the purchase decision.");
    }

    return this.db.transaction((tx) => {
      const existingOrder = tx.select().from(simulatedOrders).where(
        eq(simulatedOrders.idempotencyKey, order.idempotencyKey),
      ).get();
      if (existingOrder) {
        requireSamePayload(`Order ${order.idempotencyKey}`, existingOrder.payload, order);
        return true;
      }
      const sequenceRows = tx.select({ sequence: simulationEvents.sequence })
        .from(simulationEvents)
        .where(eq(simulationEvents.runId, event.runId))
        .orderBy(asc(simulationEvents.sequence))
        .all();
      if (currentNextSequence(sequenceRows, event.runId) !== input.expectedSequence) return false;

      const currentMandate = tx.select().from(mandateVersions).where(and(
        eq(mandateVersions.requestId, request.id),
        eq(mandateVersions.requestVersion, request.version),
      )).orderBy(desc(mandateVersions.version)).get();
      if (!currentMandate || currentMandate.payload !== serialize(activeMandate)) return false;

      tx.insert(simulationEvents).values({
        id: event.id,
        runId: event.runId,
        sequence: event.sequence,
        occurredAt: event.occurredAt,
        payload: serialize(event),
        createdAt: event.occurredAt,
      }).run();
      if (event.type === "OFFER_OBSERVED") {
        tx.insert(offerSnapshots).values({
          id: event.offer.id,
          listingId: event.offer.listingId,
          merchantId: event.offer.merchantId,
          observedAt: event.offer.observedAt,
          payload: serialize(event.offer),
          createdAt: event.offer.observedAt,
        }).run();
      }
      tx.insert(decisionRecords).values({
        id: decision.id,
        requestId: decision.requestId,
        requestVersion: decision.requestVersion,
        eventId: decision.eventId,
        policyVersion: decision.policyVersion,
        outcome: decision.outcome,
        decidedAt: decision.decidedAt,
        payload: serialize(decision),
        createdAt: decision.decidedAt,
      }).run();
      tx.insert(mandateVersions).values({
        id: consumedMandate.id,
        version: consumedMandate.version,
        requestId: consumedMandate.requestId,
        requestVersion: consumedMandate.requestVersion,
        status: consumedMandate.status,
        effectiveAt: consumedMandate.effectiveAt,
        expiresAt: consumedMandate.expiresAt,
        payload: serialize(consumedMandate),
        createdAt: consumedMandate.effectiveAt,
      }).run();
      tx.insert(simulatedOrders).values({
        id: order.id,
        idempotencyKey: order.idempotencyKey,
        requestId: order.requestId,
        decisionId: order.decisionId,
        createdAt: order.createdAt,
        payload: serialize(order),
      }).run();
      return true;
    }, { behavior: "immediate" });
  }

  async getOrderByDecision(decisionId: string): Promise<SimulatedOrder | null> {
    const row = this.db.select().from(simulatedOrders).where(eq(simulatedOrders.decisionId, decisionId)).get();
    return row ? SimulatedOrderSchema.parse(JSON.parse(row.payload)) : null;
  }
}
