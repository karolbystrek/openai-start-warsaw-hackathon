import { SimulationStateSchema, type SimulationState } from "@/application/simulation-state";
import { recoverSimulator } from "@/application/simulator-recovery";
import type { EvaluationRepository } from "@/application/evaluation-repository";
import {
  EvidenceBundleSchema,
  MandateSchema,
  OfferSnapshotSchema,
  ShoppingRequestSchema,
  SimulatedOrderSchema,
  type EvidenceBundle,
  type Mandate,
  type OfferSnapshot,
  type ShoppingBriefInterpretation,
  type ShoppingRequest,
  type SimulationEvent,
} from "@/domain/contracts";
import type {
  BriefInterpreter,
  ConfirmedBriefProjector,
  LandedCostCalculator,
  MatchService,
  PolicyEvaluator,
  ReceiptProjection,
  SimulatorControl,
  VerificationService,
} from "@/domain/services";

export interface CheckpointApplicationDependencies {
  initialRequest: ShoppingRequest;
  runId: string;
  simulator: SimulatorControl;
  repository: EvaluationRepository;
  matching: MatchService;
  verification: VerificationService;
  pricing: LandedCostCalculator;
  policy: PolicyEvaluator;
  receipts: ReceiptProjection;
  briefInterpreter: BriefInterpreter;
  briefProjector: ConfirmedBriefProjector;
}

export interface MandateConfirmation {
  minimumLandedCostMinor: number;
  maximumLandedCostMinor: number;
  requireLowStock: boolean;
  allowedMerchantIds?: readonly string[];
}

export type RequestLifecycleAction = "PAUSE" | "RESUME" | "REVOKE";

export class CheckpointApplication {
  private mutationTail: Promise<void> = Promise.resolve();
  private activeRequest: ShoppingRequest;

  constructor(private readonly dependencies: CheckpointApplicationDependencies) {
    this.activeRequest = dependencies.initialRequest;
  }

  private async serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationTail;
    let release = () => {};
    this.mutationTail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async getSimulationState(): Promise<SimulationState> {
    const { runId, simulator, repository, receipts } = this.dependencies;
    const request = await this.loadCurrentRequest();
    const processedEvents = [...await repository.listEvents(runId)];
    recoverSimulator(simulator, processedEvents);
    const eventIds = new Set(processedEvents.map((event) => event.id));
    const decisions = [...await repository.listDecisions(request.id)]
      .filter((decision) => eventIds.has(decision.eventId));
    const currentDecision = decisions.at(-1) ?? null;
    const mandate = await repository.getCurrentMandate(request.id, request.version);
    const order = [...await repository.listOrders(request.id)].at(-1) ?? null;
    return SimulationStateSchema.parse({
      request,
      simulator: simulator.getState(),
      processedEvents,
      decisions,
      currentDecision,
      mandate,
      order,
      receipt: currentDecision ? {
        concise: receipts.concise(currentDecision),
        expanded: [...receipts.expanded(currentDecision)],
      } : null,
    });
  }

  async interpretBrief(sourceText: string): Promise<ShoppingBriefInterpretation> {
    return this.dependencies.briefInterpreter.interpret(sourceText);
  }

  async activateBrief(sourceText: string): Promise<{
    interpretation: ShoppingBriefInterpretation;
    state: SimulationState | null;
  }> {
    return this.serializeMutation(async () => {
      const interpretation = await this.dependencies.briefInterpreter.interpret(sourceText);
      const projected = this.dependencies.briefProjector.project(interpretation);
      if (!projected) return { interpretation, state: null };

      return { interpretation, state: await this.activateRequestOnce(projected) };
    });
  }

  async activateRequest(request: ShoppingRequest): Promise<SimulationState> {
    return this.serializeMutation(() => this.activateRequestOnce(request));
  }

  async confirmMandate(confirmation: MandateConfirmation): Promise<SimulationState> {
    return this.serializeMutation(async () => {
      const request = await this.loadCurrentRequest();
      if (request.lifecycle !== "ACTIVE") {
        throw new Error("Purchase consent can only be activated for an active shopping request.");
      }
      const currency = request.requirements.maximumLandedCost.currency;
      const requestCap = request.requirements.maximumLandedCost.minorUnits;
      if (!Number.isSafeInteger(confirmation.minimumLandedCostMinor)
        || !Number.isSafeInteger(confirmation.maximumLandedCostMinor)
        || confirmation.minimumLandedCostMinor < 0
        || confirmation.minimumLandedCostMinor > confirmation.maximumLandedCostMinor
        || confirmation.maximumLandedCostMinor > requestCap) {
        throw new Error("Mandate price range must be non-negative, ordered, and no higher than the request cap.");
      }
      const effectiveAt = this.dependencies.simulator.getState().virtualTime;
      const current = await this.dependencies.repository.getCurrentMandate(request.id, request.version);
      const expiresAt = new Date(Date.parse(effectiveAt) + 24 * 60 * 60 * 1000).toISOString();
      const mandate = MandateSchema.parse({
        schemaVersion: 1,
        id: current?.id ?? `mandate-${request.id}`,
        requestId: request.id,
        requestVersion: request.version,
        version: (current?.version ?? 0) + 1,
        status: "ACTIVE",
        minimumLandedCost: { currency, minorUnits: confirmation.minimumLandedCostMinor },
        maximumLandedCost: { currency, minorUnits: confirmation.maximumLandedCostMinor },
        quantity: 1,
        requireLowStock: confirmation.requireLowStock,
        allowedIdentityMethods: ["EXACT_IDENTIFIER", "SEEDED_CATALOG"],
        allowedMerchantIds: confirmation.allowedMerchantIds?.length
          ? [...confirmation.allowedMerchantIds]
          : undefined,
        effectiveAt,
        expiresAt,
        revokedAt: null,
        consumedAt: null,
      });
      await this.dependencies.repository.saveMandate(mandate);
      return this.getSimulationState();
    });
  }

  async revokeMandate(): Promise<SimulationState> {
    return this.serializeMutation(async () => {
      const request = await this.loadCurrentRequest();
      const current = await this.dependencies.repository.getCurrentMandate(request.id, request.version);
      if (!current || current.status !== "ACTIVE") return this.getSimulationState();
      const revokedAt = this.dependencies.simulator.getState().virtualTime;
      await this.dependencies.repository.saveMandate(MandateSchema.parse({
        ...current,
        version: current.version + 1,
        status: "REVOKED",
        effectiveAt: revokedAt,
        revokedAt,
      }));
      return this.getSimulationState();
    });
  }

  async changeRequestLifecycle(action: RequestLifecycleAction): Promise<SimulationState> {
    return this.serializeMutation(async () => {
      const current = await this.loadCurrentRequest();
      const nextLifecycle = action === "PAUSE"
        ? "PAUSED"
        : action === "RESUME"
          ? "ACTIVE"
          : "REVOKED";
      const allowed = (action === "PAUSE" && current.lifecycle === "ACTIVE")
        || (action === "RESUME" && current.lifecycle === "PAUSED")
        || (action === "REVOKE" && ["ACTIVE", "PAUSED"].includes(current.lifecycle));
      if (!allowed) return this.getSimulationState();

      const effectiveAt = this.dependencies.simulator.getState().virtualTime;
      const nextRequest = ShoppingRequestSchema.parse({
        ...current,
        version: current.version + 1,
        lifecycle: nextLifecycle,
        effectiveAt,
      });
      const activeMandate = await this.dependencies.repository.getCurrentMandate(
        current.id,
        current.version,
      );
      const revokedMandate = activeMandate?.status === "ACTIVE" ? MandateSchema.parse({
        ...activeMandate,
        version: activeMandate.version + 1,
        status: "REVOKED",
        effectiveAt,
        revokedAt: effectiveAt,
      }) : undefined;
      await this.dependencies.repository.saveRequestTransition(
        nextRequest,
        ...(revokedMandate ? [revokedMandate] : []),
      );
      this.activeRequest = nextRequest;
      return this.getSimulationState();
    });
  }

  async stepSimulation(expectedSequence: number): Promise<SimulationState> {
    return this.serializeMutation(() => this.stepSimulationOnce(expectedSequence));
  }

  private async stepSimulationOnce(expectedSequence: number): Promise<SimulationState> {
    const { runId, simulator, repository, matching, verification, pricing, policy } = this.dependencies;
    const currentRequest = await this.loadCurrentRequest();
    if (currentRequest.lifecycle !== "ACTIVE") return this.getSimulationState();
    recoverSimulator(simulator, await repository.listEvents(runId));
    if (simulator.getState().nextSequence !== expectedSequence) return this.getSimulationState();
    const event = simulator.step();
    if (!event) return this.getSimulationState();
    const request = await this.loadCurrentRequest(event.occurredAt);

    try {
      if (event.type === "OFFER_OBSERVED") {
        const previousDecisions = await repository.listDecisionsForRun({
          requestId: request.id,
          requestVersion: request.version,
          runId,
        });
        const match = await matching.assess(request, event.offer);
        const evidence = await verification.verify(request, event.offer, event.evidence);
        const pricingSelection = pricing.select?.(
          request,
          [{ offer: event.offer, evidence }],
          this.fxQuoteOverrides(await repository.listEvents(runId)),
        );
        const landedCost = pricingSelection
          ? pricingSelection.selectedPath?.landedCost ?? null
          : await pricing.calculate(request, event.offer, evidence);
        const mandate = await repository.getCurrentMandate(request.id, request.version, event.occurredAt);
        const decision = await policy.evaluate({
          request,
          event,
          offer: event.offer,
          evidence,
          match,
          landedCost,
          ...(pricingSelection ? { pricingSelection } : {}),
          mandate,
          previousDecisions,
        });
        const committed = decision.outcome === "BUY_SIMULATED" && mandate && landedCost
          ? await this.commitPurchase(request, event, decision, mandate, expectedSequence)
          : await repository.saveEvaluation(request, event, decision, expectedSequence);
        if (!committed) {
          simulator.reset();
          recoverSimulator(simulator, await repository.listEvents(runId));
        }
      } else {
        const observation = this.resolveObservation(event, await repository.listEvents(runId));
        const committed = observation
          ? await this.evaluateUpdatedObservation(request, event, observation, expectedSequence)
          : await repository.saveEventIfCurrent(event, expectedSequence);
        if (!committed) {
          simulator.reset();
          recoverSimulator(simulator, await repository.listEvents(runId));
        }
      }
    } catch (error) {
      simulator.reset();
      recoverSimulator(simulator, await repository.listEvents(runId));
      throw error;
    }

    return this.getSimulationState();
  }

  async resetSimulation(): Promise<SimulationState> {
    return this.serializeMutation(() => this.resetSimulationOnce());
  }

  private async resetSimulationOnce(): Promise<SimulationState> {
    const { simulator, repository } = this.dependencies;
    const request = await this.loadCurrentRequest();
    simulator.reset();
    await repository.resetToRequest(request);
    return this.getSimulationState();
  }

  private async activateRequestOnce(request: ShoppingRequest): Promise<SimulationState> {
    this.activeRequest = ShoppingRequestSchema.parse({ ...request, lifecycle: "ACTIVE" });
    this.dependencies.simulator.reset();
    await this.dependencies.repository.resetToRequest(this.activeRequest);
    return this.getSimulationState();
  }

  private resolveObservation(
    event: Exclude<SimulationEvent, { type: "OFFER_OBSERVED" }>,
    processedEvents: readonly SimulationEvent[],
  ): { offer: OfferSnapshot; evidence: EvidenceBundle } | null {
    const observed = [...processedEvents].reverse().find((candidate) => (
      candidate.type === "OFFER_OBSERVED"
      && (event.type === "FX_CHANGED"
        ? candidate.offer.itemPrice.currency === event.baseCurrency
        : event.type === "SELLER_CHANGED"
          ? candidate.offer.sellerId === event.sellerId
          : candidate.offer.id === event.offerId)
    ));
    if (!observed || observed.type !== "OFFER_OBSERVED") return null;

    let offer: OfferSnapshot = observed.offer;
    let evidence: EvidenceBundle = observed.evidence;
    const updates = [...processedEvents, event]
      .filter((candidate) => candidate.sequence > observed.sequence)
      .sort((left, right) => left.sequence - right.sequence);
    for (const update of updates) {
      const provenance = {
        kind: "OBSERVED" as const,
        source: `simulation:${update.type.toLowerCase()}`,
        observedAt: update.occurredAt,
        adapterVersion: "checkpoint-recheck-v1",
      };
      if (update.type === "PRICE_CHANGED" && update.offerId === offer.id) {
        offer = OfferSnapshotSchema.parse({
          ...offer,
          itemPrice: update.itemPrice,
          deliveryPrice: update.deliveryPrice,
          observedAt: update.occurredAt,
        });
      } else if (update.type === "STOCK_CHANGED" && update.offerId === offer.id) {
        const value = update.stockState === "LOW_STOCK"
          ? `LOW_STOCK:${update.quantityAvailable ?? "UNKNOWN"}`
          : update.stockState;
        evidence = EvidenceBundleSchema.parse({
          ...evidence,
          id: `evidence-${update.id}`,
          stock: {
            ...evidence.stock,
            result: update.stockState === "OUT_OF_STOCK" ? "FAIL" : "PASS",
            value,
            provenance,
          },
          capturedAt: update.occurredAt,
        });
      } else if (update.type === "COUPON_CHANGED" && update.offerId === offer.id) {
        evidence = EvidenceBundleSchema.parse({
          ...evidence,
          id: `evidence-${update.id}`,
          coupon: {
            ...evidence.coupon,
            result: update.status === "VALID" ? "PASS" : "FAIL",
            value: `${update.couponCode}_${update.status}`,
            provenance,
          },
          capturedAt: update.occurredAt,
        });
      } else if (update.type === "SELLER_CHANGED" && update.sellerId === offer.sellerId) {
        evidence = EvidenceBundleSchema.parse({
          ...evidence,
          id: `evidence-${update.id}`,
          seller: {
            ...evidence.seller,
            result: update.status === "VERIFIED" ? "PASS" : "FAIL",
            value: update.status,
            provenance,
          },
          capturedAt: update.occurredAt,
        });
      }
    }
    return { offer, evidence };
  }

  private async evaluateUpdatedObservation(
    request: ShoppingRequest,
    event: Exclude<SimulationEvent, { type: "OFFER_OBSERVED" }>,
    observation: { offer: OfferSnapshot; evidence: EvidenceBundle },
    expectedSequence: number,
  ): Promise<boolean> {
    const { repository, matching, verification, pricing, policy, runId } = this.dependencies;
    const evidence = await verification.verify(request, observation.offer, observation.evidence);
    const match = await matching.assess(request, observation.offer);
    const pricingSelection = pricing.select?.(
      request,
      [{ offer: observation.offer, evidence }],
      this.fxQuoteOverrides([...await repository.listEvents(runId), event]),
    );
    const landedCost = pricingSelection
      ? pricingSelection.selectedPath?.landedCost ?? null
      : await pricing.calculate(request, observation.offer, evidence);
    const mandate = await repository.getCurrentMandate(request.id, request.version, event.occurredAt);
    const previousDecisions = await repository.listDecisionsForRun({
      requestId: request.id,
      requestVersion: request.version,
      runId,
    });
    const decision = await policy.evaluate({
      request,
      event,
      offer: observation.offer,
      evidence,
      match,
      landedCost,
      ...(pricingSelection ? { pricingSelection } : {}),
      mandate,
      previousDecisions,
    });
    return decision.outcome === "BUY_SIMULATED" && mandate && landedCost
      ? this.commitPurchase(request, event, decision, mandate, expectedSequence)
      : repository.saveReevaluation(request, event, decision, expectedSequence);
  }

  private async commitPurchase(
    request: ShoppingRequest,
    event: SimulationEvent,
    decision: Awaited<ReturnType<PolicyEvaluator["evaluate"]>>,
    mandate: Mandate,
    expectedSequence: number,
  ): Promise<boolean> {
    if (!decision.landedCost) return false;
    const consumedMandate = MandateSchema.parse({
      ...mandate,
      version: mandate.version + 1,
      status: "CONSUMED",
      effectiveAt: event.occurredAt,
      consumedAt: event.occurredAt,
    });
    const order = SimulatedOrderSchema.parse({
      schemaVersion: 1,
      id: `order-${decision.id}`,
      idempotencyKey: `purchase:${mandate.id}:${mandate.version}`,
      requestId: request.id,
      requestVersion: request.version,
      mandateId: mandate.id,
      decisionId: decision.id,
      offerId: decision.offer.id,
      quantity: 1,
      paid: decision.landedCost.total,
      status: "PLACED",
      createdAt: event.occurredAt,
    });
    return this.dependencies.repository.commitPurchase({
      request,
      event,
      decision,
      activeMandate: mandate,
      consumedMandate,
      order,
      expectedSequence,
    });
  }

  private fxQuoteOverrides(events: readonly SimulationEvent[]) {
    return events.flatMap((event) => event.type === "FX_CHANGED" ? [{
      baseCurrency: event.baseCurrency,
      quoteCurrency: event.quoteCurrency,
      rate: event.rate,
      observedAt: event.occurredAt,
    }] : []).reverse();
  }

  private async loadCurrentRequest(effectiveAt?: string): Promise<ShoppingRequest> {
    const { initialRequest, repository } = this.dependencies;
    const fallback = this.activeRequest ?? initialRequest;
    const current = await repository.getCurrentRequest(fallback.id, effectiveAt);
    if (current) {
      this.activeRequest = current;
      return current;
    }
    await repository.saveRequest(fallback);
    const seeded = await repository.getCurrentRequest(fallback.id, effectiveAt);
    if (!seeded) throw new Error(`Could not load request ${fallback.id}.`);
    this.activeRequest = seeded;
    return seeded;
  }
}
