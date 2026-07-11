import { CachedAmbiguousMatchAssessor } from "@/ai/cached-ambiguous-match";
import { DeliveryOptionSchema, EvidenceBundleSchema, OfferSnapshotSchema, ShoppingRequestSchema, type DecisionRecord, type Mandate, type SimulationEvent } from "@/domain/contracts";
import { ConfirmedShoppingRequestProjector, DeterministicBriefInterpreter } from "@/domain/brief/interpret";
import { presentationProducts } from "@/domain/catalog/presentation-products";
import { StagedMatchService } from "@/domain/matching/staged-matcher";
import { DeterministicPolicyEvaluator } from "@/domain/policy";
import { DeterministicLandedCostCalculator, headlineLandedCostRules } from "@/domain/pricing";
import { DeterministicVerificationService } from "@/domain/verification";
import { calculateEvaluationMetrics, type EvaluationExpectation } from "../evaluation/metrics";
import { adversarialGroundTruth, headlineGroundTruth, purchaseGroundTruth } from "../evaluation/scenarios/ground-truth";
import { adversarialScenarios } from "@/simulator/scenarios/adversarial";
import { headlineScenario } from "@/simulator/scenarios/headline";
import { presentationProductScenarios } from "@/simulator/scenarios/presentation-products";

const matching = new StagedMatchService(undefined, new CachedAmbiguousMatchAssessor());
const verification = new DeterministicVerificationService();
const pricing = new DeterministicLandedCostCalculator(headlineLandedCostRules);
const policy = new DeterministicPolicyEvaluator();

const assertManual: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(`Manual trust-core check failed: ${message}`);
};

const flattenExpectations = (groups: readonly (typeof headlineGroundTruth)[]): EvaluationExpectation[] => groups.flatMap(
  (group) => group.expected.map((expected) => ({
    eventId: expected.eventId,
    offerIsValidDeal: expected.offerIsValidDeal,
    expectedOutcome: expected.expectedOutcome,
    expectedLandedCostMinor: expected.expectedLandedCostMinor,
  })),
);

const evaluateEvent = async (
  event: Extract<SimulationEvent, { type: "OFFER_OBSERVED" }>,
  request: typeof headlineScenario.request,
  previousDecisions: readonly DecisionRecord[],
  mandate?: Mandate,
): Promise<DecisionRecord> => {
  const match = await matching.assess(request, event.offer);
  const evidence = await verification.verify(request, event.offer, event.evidence);
  const pricingSelection = pricing.select(request, [{ offer: event.offer, evidence }]);
  const landedCost = pricingSelection.selectedPath?.landedCost ?? null;
  return policy.evaluate({
    request,
    event,
    offer: event.offer,
    evidence,
    match,
    landedCost,
    pricingSelection,
    previousDecisions,
    ...(mandate ? { mandate } : {}),
  });
};

const evaluateFixtures = async (): Promise<DecisionRecord[]> => {
  const decisions: DecisionRecord[] = [];
  for (const fixture of [headlineScenario, ...adversarialScenarios]) {
    const fixtureDecisions: DecisionRecord[] = [];
    for (const event of fixture.events) {
      if (event.type !== "OFFER_OBSERVED") continue;
      const decision = await evaluateEvent(event, fixture.request, fixtureDecisions);
      fixtureDecisions.push(decision);
      decisions.push(decision);
    }
  }
  return decisions;
};

const verifyPresentationDemoFixtures = async (): Promise<void> => {
  const interpreter = new DeterministicBriefInterpreter(() => headlineScenario.virtualStartAt);
  const projector = new ConfirmedShoppingRequestProjector();
  const fixtures = new Map([
    ["shoes", headlineScenario],
    ...presentationProductScenarios.map((scenario) => [scenario.request.product.category === "home-decor" ? "vase" : "macbook", scenario] as const),
  ]);

  for (const profile of presentationProducts) {
    const fixture = fixtures.get(profile.id);
    assertManual(fixture, `the ${profile.id} UI prompt must have a presentation event stream`);
    const interpretation = await interpreter.interpret(profile.brief);
    const projected = projector.project(interpretation);
    assertManual(projected, `the ${profile.id} UI prompt must interpret without blocking ambiguities`);
    const request = ShoppingRequestSchema.parse({
      ...projected,
      lifecycle: "ACTIVE",
      effectiveAt: fixture.virtualStartAt,
    });
    const decisions: DecisionRecord[] = [];
    for (const event of fixture.events) {
      if (event.type !== "OFFER_OBSERVED") continue;
      decisions.push(await evaluateEvent(event, request, decisions));
    }
    const qualifying = decisions.find((decision) => decision.outcome === "ALERT");
    assertManual(qualifying, `the ${profile.id} UI prompt must have at least one qualifying offer event`);
    assertManual(
      qualifying.requirements.every((requirement) => requirement.result === "PASS"),
      `the ${profile.id} qualifying event must pass every hard requirement`,
    );
    assertManual(
      qualifying.landedCost !== null
        && qualifying.landedCost.total.currency === request.requirements.maximumLandedCost.currency
        && qualifying.landedCost.total.minorUnits <= request.requirements.maximumLandedCost.minorUnits,
      `the ${profile.id} qualifying event must remain within the delivered-price cap`,
    );
  }
};

const evaluatePurchases = async (): Promise<DecisionRecord[]> => {
  const sourceFixture = adversarialScenarios.find((scenario) => scenario.id === "exact-identifier-valid");
  const sourceEvent = sourceFixture?.events[0];
  if (!sourceFixture || sourceEvent?.type !== "OFFER_OBSERVED") throw new Error("Purchase evaluation source fixture is missing.");
  const mandateBase: Mandate = {
    schemaVersion: 1,
    id: "mandate-evaluation-v1",
    requestId: sourceFixture.request.id,
    requestVersion: sourceFixture.request.version,
    version: 1,
    status: "ACTIVE",
    maximumLandedCost: { currency: "EUR", minorUnits: 8000 },
    minimumLandedCost: { currency: "EUR", minorUnits: 7500 },
    quantity: 1,
    requireLowStock: false,
    allowedIdentityMethods: ["EXACT_IDENTIFIER"],
    allowedMerchantIds: [sourceEvent.offer.merchantId],
    allowedSellerIds: [sourceEvent.offer.sellerId],
    effectiveAt: "2026-07-11T08:00:00.000Z",
    expiresAt: "2026-07-11T08:05:00.000Z",
    revokedAt: null,
    consumedAt: null,
  };
  const validEvent = { ...sourceEvent, id: "event-purchase-valid-1" };
  const revokedEvent = { ...sourceEvent, id: "event-purchase-revoked-1" };
  const expiredEvent = { ...sourceEvent, id: "event-purchase-expired-1" };
  const consumedEvent = { ...sourceEvent, id: "event-purchase-consumed-1" };
  const wrongVersionEvent = { ...sourceEvent, id: "event-purchase-wrong-version-1" };
  const wrongMerchantEvent = { ...sourceEvent, id: "event-purchase-wrong-merchant-1" };
  const unknownStockEvent = {
    ...sourceEvent,
    id: "event-purchase-unknown-stock-1",
    evidence: EvidenceBundleSchema.parse({
      ...sourceEvent.evidence,
      id: "evidence-purchase-unknown-stock",
      stock: { ...sourceEvent.evidence.stock, result: "UNKNOWN", value: null },
    }),
  };
  const priceChangedOffer = OfferSnapshotSchema.parse({
    ...sourceEvent.offer,
    itemPrice: { currency: "EUR", minorUnits: 7360 },
  });
  const priceChangedEvent = { ...sourceEvent, id: "event-purchase-price-changed-1", offer: priceChangedOffer };
  return [
    await evaluateEvent(validEvent, sourceFixture.request, [], mandateBase),
    await evaluateEvent(revokedEvent, sourceFixture.request, [], { ...mandateBase, id: "mandate-evaluation-revoked-v1", status: "REVOKED", revokedAt: sourceEvent.occurredAt }),
    await evaluateEvent(expiredEvent, sourceFixture.request, [], { ...mandateBase, id: "mandate-evaluation-expired-v1", status: "EXPIRED", expiresAt: "2026-07-11T08:00:30.000Z" }),
    await evaluateEvent(consumedEvent, sourceFixture.request, [], { ...mandateBase, id: "mandate-evaluation-consumed-v1", status: "CONSUMED", consumedAt: sourceEvent.occurredAt }),
    await evaluateEvent(wrongVersionEvent, sourceFixture.request, [], { ...mandateBase, id: "mandate-evaluation-wrong-version-v1", requestVersion: sourceFixture.request.version + 1 }),
    await evaluateEvent(wrongMerchantEvent, sourceFixture.request, [], { ...mandateBase, id: "mandate-evaluation-wrong-merchant-v1", allowedMerchantIds: ["merchant-not-authorized"] }),
    await evaluateEvent(unknownStockEvent, sourceFixture.request, [], mandateBase),
    await evaluateEvent(priceChangedEvent, sourceFixture.request, [], mandateBase),
  ];
};

const verifyPricingBoundaries = async (): Promise<void> => {
  const fixture = adversarialScenarios.find((scenario) => scenario.id === "exact-identifier-valid");
  const event = fixture?.events[0];
  if (!fixture || event?.type !== "OFFER_OBSERVED") throw new Error("Pricing boundary source fixture is missing.");
  const observedAt = event.occurredAt;
  const provenance = { kind: "OBSERVED" as const, source: "manual-pricing-boundary", observedAt };
  const option = (overrides: Record<string, unknown>) => DeliveryOptionSchema.parse({
    id: "delivery-standard",
    label: "Standard courier",
    method: "COURIER",
    price: { currency: "EUR", minorUnits: 740 },
    eligibility: "PASS",
    entitlementStatus: "PASS",
    observedAt,
    provenance,
    ...overrides,
  });

  const offerWithOptions = OfferSnapshotSchema.parse({
    ...event.offer,
    deliveryOptions: [
      option({ id: "delivery-standard" }),
      option({ id: "delivery-membership", label: "Member delivery", method: "MEMBERSHIP", price: { currency: "EUR", minorUnits: 0 }, entitlement: "MEMBERSHIP", entitlementStatus: "UNKNOWN" }),
      option({ id: "delivery-unknown-price", label: "Unpriced delivery", price: null }),
      option({ id: "delivery-expired", label: "Expired free delivery", price: { currency: "EUR", minorUnits: 0 }, expiresAt: observedAt }),
    ],
    couponCandidates: [{
      code: "INVALID10",
      appliesTo: "ITEM",
      amount: { currency: "EUR", minorUnits: 1000 },
      eligibility: "FAIL",
      eligibilityReason: "Fixture coupon is invalid",
      observedAt,
      provenance,
    }],
  });
  const selection = pricing.select(fixture.request, [{ offer: offerWithOptions, evidence: event.evidence }]);
  assertManual(selection.selectedPath?.deliveryOptionId === "delivery-standard", "invalid/unknown/expired savings must fall back to the no-coupon standard path");
  assertManual(selection.selectedPath.couponCodes.length === 0, "the no-coupon path must always be considered");
  assertManual(selection.alternatives.some((path) => path.status === "UNKNOWN"), "unknown entitlement must remain auditable");
  assertManual(selection.alternatives.some((path) => path.reasonCodes.some((reason) => reason.startsWith("DELIVERY_PRICE_UNKNOWN"))), "missing delivery fees must remain unknown and must never be treated as free");
  assertManual(selection.alternatives.some((path) => path.reasonCodes.some((reason) => reason.startsWith("DELIVERY_QUOTE_EXPIRED"))), "expired quotes must be rejected explicitly");

  const thresholdOffer = OfferSnapshotSchema.parse({
    ...event.offer,
    deliveryOptions: [
      option({ id: "delivery-before", label: "Before-discount threshold", price: { currency: "EUR", minorUnits: 0 }, minimumSubtotal: { currency: "EUR", minorUnits: 6800 }, thresholdBasis: "ITEM_BEFORE_DISCOUNTS", requiredCouponCodes: ["SAVE5"] }),
      option({ id: "delivery-after", label: "After-discount threshold", price: { currency: "EUR", minorUnits: 0 }, minimumSubtotal: { currency: "EUR", minorUnits: 6800 }, thresholdBasis: "ITEM_AFTER_DISCOUNTS", requiredCouponCodes: ["SAVE5"] }),
    ],
    couponCandidates: [{ code: "SAVE5", appliesTo: "ITEM", amount: { currency: "EUR", minorUnits: 500 }, eligibility: "PASS", stackable: true, observedAt, provenance }],
  });
  const thresholdSelection = pricing.select(fixture.request, [{ offer: thresholdOffer, evidence: event.evidence }]);
  assertManual(thresholdSelection.selectedPath?.deliveryOptionId === "delivery-before", "before-discount threshold should qualify when after-discount threshold does not");
  assertManual(thresholdSelection.alternatives.some((path) => path.deliveryOptionId === "delivery-after" && path.reasonCodes.some((reason) => reason.startsWith("DELIVERY_THRESHOLD_NOT_MET"))), "after-discount threshold rejection must be retained");

  const stackingOffer = OfferSnapshotSchema.parse({
    ...event.offer,
    couponCandidates: ["SAVE1", "SAVE2"].map((code) => ({
      code,
      appliesTo: "ITEM",
      amount: { currency: "EUR", minorUnits: 100 },
      eligibility: "PASS",
      stackable: false,
      observedAt,
      provenance,
    })),
  });
  const stackingSelection = pricing.select(fixture.request, [{ offer: stackingOffer, evidence: event.evidence }]);
  assertManual(stackingSelection.alternatives.some((path) => path.couponCodes.length === 2 && path.reasonCodes.includes("COUPON_SET_NOT_STACKABLE")), "non-stackable coupon combinations must be rejected while individual and no-coupon paths remain available");

  const preferredOffer = OfferSnapshotSchema.parse({
    ...event.offer,
    deliveryOptions: [
      option({ id: "delivery-courier", label: "Courier", method: "COURIER", deliveryWindow: { earliestAt: null, latestAt: "2026-07-13T08:00:00.000Z" } }),
      option({ id: "delivery-locker", label: "Locker", method: "LOCKER", deliveryWindow: { earliestAt: null, latestAt: "2026-07-13T08:00:00.000Z" } }),
    ],
  });
  const preferredSelection = pricing.select(fixture.request, [{ offer: preferredOffer, evidence: event.evidence, preferredDeliveryMethods: ["LOCKER", "COURIER"] }]);
  assertManual(preferredSelection.selectedPath?.deliveryMethod === "LOCKER", "preferred delivery method must break otherwise equal ties");
  const stableTieSelection = pricing.select(fixture.request, [{ offer: preferredOffer, evidence: event.evidence }]);
  assertManual(stableTieSelection.selectedPath?.deliveryOptionId === "delivery-courier", "stable path identifier must deterministically break a complete tie");

  const deadlineRequest = ShoppingRequestSchema.parse({
    ...fixture.request,
    requirements: { ...fixture.request.requirements, latestDeliveryAt: "2026-07-12T08:00:00.000Z" },
  });
  const deadlineOffer = OfferSnapshotSchema.parse({
    ...event.offer,
    deliveryOptions: [
      option({ id: "delivery-late", deliveryWindow: { earliestAt: null, latestAt: "2026-07-13T08:00:00.000Z" } }),
      option({ id: "delivery-window-unknown", deliveryWindow: null }),
    ],
  });
  const deadlineSelection = pricing.select(deadlineRequest, [{ offer: deadlineOffer, evidence: event.evidence }]);
  assertManual(deadlineSelection.selectedPath === null, "no delivery path may win when every option misses or cannot prove the hard deadline");
  assertManual(deadlineSelection.alternatives.some((path) => path.reasonCodes.some((reason) => reason.startsWith("DELIVERY_DEADLINE_MISSED"))), "late delivery must be rejected explicitly");
  assertManual(deadlineSelection.alternatives.some((path) => path.reasonCodes.some((reason) => reason.startsWith("DELIVERY_DEADLINE_UNKNOWN"))), "an unknown delivery window must remain unknown");

  const cheaperOffer = OfferSnapshotSchema.parse({
    ...event.offer,
    id: "offer-global-cheaper",
    listingId: "listing-global-cheaper",
    merchantId: "merchant-global-cheaper",
    sellerId: "seller-global-cheaper",
    itemPrice: { currency: "EUR", minorUnits: 6500 },
    deliveryPrice: { currency: "EUR", minorUnits: 200 },
  });
  const cheaperEvidence = EvidenceBundleSchema.parse({ ...event.evidence, id: "evidence-global-cheaper", offerId: cheaperOffer.id });
  const globalSelection = pricing.select(fixture.request, [
    { offer: event.offer, evidence: event.evidence },
    { offer: cheaperOffer, evidence: cheaperEvidence },
  ]);
  assertManual(globalSelection.selectedPath?.offerId === cheaperOffer.id, "global selection must choose the lowest valid merchant path");
  assertManual(cheaperOffer.attributes.quantity === event.offer.attributes.quantity, "optimizer must not pad carts or increase quantity");

  const missingFxOffer = OfferSnapshotSchema.parse({
    ...event.offer,
    id: "offer-missing-fx",
    listingId: "listing-missing-fx",
    itemPrice: { currency: "USD", minorUnits: 6900 },
    deliveryPrice: { currency: "USD", minorUnits: 740 },
  });
  const missingFxEvidence = EvidenceBundleSchema.parse({ ...event.evidence, id: "evidence-missing-fx", offerId: missingFxOffer.id });
  const missingFxSelection = pricing.select(fixture.request, [{ offer: missingFxOffer, evidence: missingFxEvidence }]);
  assertManual(missingFxSelection.selectedPath === null && missingFxSelection.alternatives.every((path) => path.status === "UNKNOWN"), "missing FX must be a non-throwing unknown selection");

  const missingFxEvent = { ...event, id: "event-missing-fx-manual", offer: missingFxOffer, evidence: missingFxEvidence };
  const missingFxMatch = await matching.assess(fixture.request, missingFxOffer);
  const missingFxDecision = await policy.evaluate({ request: fixture.request, event: missingFxEvent, offer: missingFxOffer, evidence: missingFxEvidence, match: missingFxMatch, landedCost: null, pricingSelection: missingFxSelection });
  assertManual(missingFxDecision.outcome === "ESCALATE" && missingFxDecision.primaryReason === "PRICING_INPUT_UNKNOWN", "missing FX must produce an auditable escalation");

  const normalMatch = await matching.assess(fixture.request, event.offer);
  const normalEvidence = await verification.verify(fixture.request, event.offer, event.evidence);
  const normalSelection = pricing.select(fixture.request, [{ offer: event.offer, evidence: normalEvidence }]);
  const normalCost = normalSelection.selectedPath?.landedCost ?? null;
  const mismatchedEvidence = EvidenceBundleSchema.parse({ ...normalEvidence, id: "evidence-mismatched-record", offerId: "offer-unrelated" });
  const mismatchedDecision = await policy.evaluate({ request: fixture.request, event, offer: event.offer, evidence: mismatchedEvidence, match: normalMatch, landedCost: normalCost, pricingSelection: normalSelection });
  assertManual(mismatchedDecision.outcome === "IGNORE" && mismatchedDecision.primaryReason === "MALFORMED_EVIDENCE", "cross-record identifier mismatches must fail closed before action");

  const staleEvidence = EvidenceBundleSchema.parse({
    ...normalEvidence,
    id: "evidence-stale-critical-item",
    stock: { ...normalEvidence.stock, provenance: { ...normalEvidence.stock.provenance, observedAt: "2026-07-11T07:50:00.000Z" } },
  });
  const staleEvent = { ...event, id: "event-stale-critical-item", evidence: staleEvidence };
  const staleSelection = pricing.select(fixture.request, [{ offer: event.offer, evidence: staleEvidence }]);
  const staleDecision = await policy.evaluate({ request: fixture.request, event: staleEvent, offer: event.offer, evidence: staleEvidence, match: normalMatch, landedCost: staleSelection.selectedPath?.landedCost ?? null, pricingSelection: staleSelection });
  assertManual(staleDecision.outcome === "ESCALATE" && staleDecision.primaryReason === "STALE_CRITICAL_EVIDENCE", "a stale individual purchase-critical fact must escalate even when the bundle timestamp is current");
};

const main = async (): Promise<void> => {
  await verifyPresentationDemoFixtures();
  await verifyPricingBoundaries();
  const decisions = [...await evaluateFixtures(), ...await evaluatePurchases()];
  const expectations = flattenExpectations([headlineGroundTruth, ...adversarialGroundTruth, purchaseGroundTruth]);
  const metrics = calculateEvaluationMetrics(decisions, expectations);
  console.log(JSON.stringify(metrics, null, 2));
  if (metrics.purchaseCount === 0) throw new Error("Evaluation must contain at least one purchase.");
  if (metrics.falseBuyRate !== 0) throw new Error(`Expected a 0% false-buy rate, received ${String(metrics.falseBuyRate)}.`);
  if (metrics.failures.length > 0) throw new Error(`Evaluation reported ${metrics.failures.length} failure(s).`);
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
