import {
  DecisionRecordSchema,
  LandedCostSchema,
  type DecisionRecord,
  type EvidenceBundle,
  type LandedCost,
  type OfferSnapshot,
  type SimulationEvent,
} from "@/domain/contracts";
import {
  acceptedEvidence,
  acceptedOffer,
  headlineEvents,
  headlineRequest,
  invalidCouponEvidence,
  invalidCouponOffer,
  rejectedEvidence,
  rejectedOffer,
  wrongVariantEvidence,
  wrongVariantOffer,
} from "@/simulator/scenarios/headline";

const stub = (source: string, observedAt: string) => ({ kind: "STUB" as const, source, observedAt, adapterVersion: "checkpoint-trust-core-v2" });

const cost = (offer: OfferSnapshot, totalMinor: number, lines: LandedCost["lines"], fxRate: string | null = null): LandedCost => LandedCostSchema.parse({
  schemaVersion: 1,
  id: `landed-${offer.id}`,
  offerId: offer.id,
  budgetCurrency: "EUR",
  lines,
  total: { currency: "EUR", minorUnits: totalMinor },
  fxRate,
  fxObservedAt: fxRate ? offer.observedAt : null,
  ruleVersion: "headline-fixture-v2",
  provenance: stub("fixture-pricing-adapter", offer.observedAt),
});

const eurLines = (offer: OfferSnapshot) => [
  { code: "ITEM" as const, label: "Item", amount: offer.itemPrice, operation: "ADD" as const, provenance: stub("fixture-item", offer.observedAt) },
  { code: "DELIVERY" as const, label: "Delivery", amount: offer.deliveryPrice, operation: "ADD" as const, provenance: stub("fixture-delivery", offer.observedAt) },
];

export const costsByOfferId = new Map<string, LandedCost>([
  [wrongVariantOffer.id, cost(wrongVariantOffer, 5700, eurLines(wrongVariantOffer))],
  [rejectedOffer.id, cost(rejectedOffer, 8160, [
    { code: "FX", label: "Item after fixture FX", amount: { currency: "EUR", minorUnits: 7200 }, operation: "CONVERT", provenance: stub("fixture-fx", rejectedOffer.observedAt) },
    { code: "DELIVERY", label: "Delivery", amount: { currency: "EUR", minorUnits: 660 }, operation: "ADD", provenance: stub("fixture-delivery", rejectedOffer.observedAt) },
    { code: "DUTY", label: "Scenario duty and handling", amount: { currency: "EUR", minorUnits: 300 }, operation: "ADD", provenance: stub("fixture-duty", rejectedOffer.observedAt) },
  ], "1.2203389831")],
  [invalidCouponOffer.id, cost(invalidCouponOffer, 8200, eurLines(invalidCouponOffer))],
  [acceptedOffer.id, cost(acceptedOffer, 7640, eurLines(acceptedOffer))],
]);

const eventFor = (offer: OfferSnapshot) => headlineEvents.find((event) => event.type === "OFFER_OBSERVED" && event.offer.id === offer.id)!;

const decision = (
  offer: OfferSnapshot,
  evidence: EvidenceBundle,
  outcome: "REJECT" | "ALERT",
  reason: "HARD_REQUIREMENT_MISMATCH" | "LANDED_COST_ABOVE_CAP" | "VALID_DEAL_ALERT",
): DecisionRecord => {
  const event = eventFor(offer) as Extract<SimulationEvent, { type: "OFFER_OBSERVED" }>;
  const landedCost = costsByOfferId.get(offer.id)!;
  const identityPass = offer.id !== wrongVariantOffer.id;
  return DecisionRecordSchema.parse({
    schemaVersion: 1,
    id: `decision-${event.id}`,
    requestId: headlineRequest.id,
    requestVersion: headlineRequest.version,
    eventId: event.id,
    offer,
    evidence,
    match: {
      schemaVersion: 1,
      id: `stub-match-${offer.id}`,
      requestId: headlineRequest.id,
      offerId: offer.id,
      method: "UNRESOLVED",
      overall: identityPass ? "PASS" : "FAIL",
      attributes: [{ attribute: "identity", result: identityPass ? "PASS" : "FAIL", evidence: "Temporary policy fixture; application supplies the computed assessment." }],
      provenance: stub("temporary-policy-match-placeholder", offer.observedAt),
    },
    landedCost,
    outcome,
    primaryReason: reason,
    requirements: [
      { requirement: "identity", result: identityPass ? "PASS" : "FAIL", explanation: identityPass ? "Identity accepted by fixture policy." : "Wrong model." },
      { requirement: "landed-cost-cap", result: landedCost.total.minorUnits <= 8000 ? "PASS" : "FAIL", explanation: landedCost.total.minorUnits <= 8000 ? "Within cap." : "Above cap." },
    ],
    mandateId: null,
    notificationSuppressed: false,
    policyVersion: "fixture-policy-v2",
    provenance: stub("fixture-policy-adapter", event.occurredAt),
    decidedAt: event.occurredAt,
  });
};

export const decisionsByOfferId = new Map<string, DecisionRecord>([
  [wrongVariantOffer.id, decision(wrongVariantOffer, wrongVariantEvidence, "REJECT", "HARD_REQUIREMENT_MISMATCH")],
  [rejectedOffer.id, decision(rejectedOffer, rejectedEvidence, "REJECT", "LANDED_COST_ABOVE_CAP")],
  [invalidCouponOffer.id, decision(invalidCouponOffer, invalidCouponEvidence, "REJECT", "LANDED_COST_ABOVE_CAP")],
  [acceptedOffer.id, decision(acceptedOffer, acceptedEvidence, "ALERT", "VALID_DEAL_ALERT")],
]);
