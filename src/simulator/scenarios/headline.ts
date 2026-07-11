import {
  DecisionRecordSchema,
  EvidenceBundleSchema,
  LandedCostSchema,
  MatchAssessmentSchema,
  OfferSnapshotSchema,
  ShoppingRequestSchema,
  SimulationEventSchema,
  type DecisionRecord,
  type EvidenceBundle,
  type LandedCost,
  type MatchAssessment,
  type OfferSnapshot,
  type SimulationEvent,
} from "@/domain/contracts";

const REQUEST_TIME = "2026-07-11T08:00:00.000Z";
const REJECTED_TIME = "2026-07-11T08:01:00.000Z";
const ACCEPTED_TIME = "2026-07-11T08:02:00.000Z";

const stubProvenance = (source: string, observedAt: string) => ({
  kind: "STUB" as const,
  source,
  observedAt,
  adapterVersion: "checkpoint-1",
});

const observedProvenance = (source: string, observedAt: string) => ({
  kind: "OBSERVED" as const,
  source,
  observedAt,
});

export const headlineRequest = ShoppingRequestSchema.parse({
  schemaVersion: 1,
  id: "request-nike-dunk-pl",
  version: 1,
  originalText: "Nike Dunk Low, size 43, under EUR 80 delivered. New only, no resellers. If it lands within EUR 5 of the target and stock is low, do not ask - just buy. Otherwise, notify me once.",
  lifecycle: "ACTIVE",
  product: {
    brand: "Nike",
    model: "Dunk Low",
    category: "shoes",
    identifiers: [{ type: "MPN", value: "DD1391-100" }],
  },
  requirements: {
    size: "EU 43",
    condition: "NEW",
    quantity: 1,
    destinationCountry: "PL",
    allowResellers: false,
    maximumLandedCost: { currency: "EUR", minorUnits: 8000 },
  },
  preferences: [],
  notificationPolicy: { mode: "ONCE", improvementThresholdMinor: 0 },
  unresolvedAmbiguities: [],
  effectiveAt: REQUEST_TIME,
});

const makeOffer = (input: {
  id: string;
  listingId: string;
  merchantId: string;
  sellerId: string;
  title: string;
  listingRef: string;
  itemCurrency: string;
  itemMinor: number;
  deliveryCurrency: string;
  deliveryMinor: number;
  observedAt: string;
}): OfferSnapshot => OfferSnapshotSchema.parse({
  schemaVersion: 1,
  id: input.id,
  listingId: input.listingId,
  merchantId: input.merchantId,
  sellerId: input.sellerId,
  title: input.title,
  listingRef: input.listingRef,
  identifiers: [{ type: "MPN", value: "DD1391-100" }],
  attributes: { brand: "Nike", model: "Dunk Low", size: "EU 43", condition: "NEW", quantity: 1 },
  itemPrice: { currency: input.itemCurrency, minorUnits: input.itemMinor },
  deliveryPrice: { currency: input.deliveryCurrency, minorUnits: input.deliveryMinor },
  destinationCountries: ["PL"],
  observedAt: input.observedAt,
});

export const rejectedOffer = makeOffer({
  id: "offer-uk-over-cap",
  listingId: "listing-uk-001",
  merchantId: "merchant-london-sneakers",
  sellerId: "seller-london-sneakers",
  title: "Nike Dunk Low Retro White Black EU 43",
  listingRef: "sim://london-sneakers/listing-uk-001",
  itemCurrency: "GBP",
  itemMinor: 5900,
  deliveryCurrency: "GBP",
  deliveryMinor: 540,
  observedAt: REJECTED_TIME,
});

export const acceptedOffer = makeOffer({
  id: "offer-eu-valid",
  listingId: "listing-eu-001",
  merchantId: "merchant-warsaw-sneakers",
  sellerId: "seller-warsaw-sneakers",
  title: "Nike Dunk Low Retro White Black EU 43",
  listingRef: "sim://warsaw-sneakers/listing-eu-001",
  itemCurrency: "EUR",
  itemMinor: 6900,
  deliveryCurrency: "EUR",
  deliveryMinor: 740,
  observedAt: ACCEPTED_TIME,
});

const makeEvidence = (offer: OfferSnapshot, stockValue: string): EvidenceBundle => {
  const item = (key: string, value: string) => ({
    key,
    result: "PASS" as const,
    value,
    provenance: observedProvenance(`fixture:${offer.merchantId}`, offer.observedAt),
  });
  return EvidenceBundleSchema.parse({
    schemaVersion: 1,
    id: `evidence-${offer.id}`,
    offerId: offer.id,
    seller: item("seller", "VERIFIED_MERCHANT"),
    stock: item("stock", stockValue),
    condition: item("condition", "NEW"),
    destination: item("destination", "PL"),
    coupon: item("coupon", "NONE"),
    discount: item("discount", "NOT_REQUIRED"),
    capturedAt: offer.observedAt,
  });
};

export const rejectedEvidence = makeEvidence(rejectedOffer, "IN_STOCK");
export const acceptedEvidence = makeEvidence(acceptedOffer, "IN_STOCK");

const makeMatch = (offer: OfferSnapshot): MatchAssessment => MatchAssessmentSchema.parse({
  schemaVersion: 1,
  id: `match-${offer.id}`,
  requestId: headlineRequest.id,
  offerId: offer.id,
  method: "EXACT_IDENTIFIER",
  overall: "PASS",
  attributes: [
    { attribute: "model", result: "PASS", evidence: "MPN DD1391-100" },
    { attribute: "size", result: "PASS", evidence: "EU 43" },
    { attribute: "condition", result: "PASS", evidence: "NEW" },
  ],
  provenance: stubProvenance("fixture-match-adapter", offer.observedAt),
});

export const rejectedMatch = makeMatch(rejectedOffer);
export const acceptedMatch = makeMatch(acceptedOffer);

const makeLandedCost = (offer: OfferSnapshot, lines: LandedCost["lines"], totalMinor: number, fxRate: string | null): LandedCost => LandedCostSchema.parse({
  schemaVersion: 1,
  id: `landed-${offer.id}`,
  offerId: offer.id,
  budgetCurrency: "EUR",
  lines,
  total: { currency: "EUR", minorUnits: totalMinor },
  fxRate,
  fxObservedAt: fxRate ? offer.observedAt : null,
  ruleVersion: "headline-fixture-v1",
  provenance: stubProvenance("fixture-pricing-adapter", offer.observedAt),
});

export const rejectedLandedCost = makeLandedCost(rejectedOffer, [
  { code: "FX", label: "Item after fixture FX", amount: { currency: "EUR", minorUnits: 7200 }, operation: "CONVERT", provenance: stubProvenance("fixture-fx", REJECTED_TIME) },
  { code: "DELIVERY", label: "Delivery", amount: { currency: "EUR", minorUnits: 660 }, operation: "ADD", provenance: stubProvenance("fixture-delivery", REJECTED_TIME) },
  { code: "DUTY", label: "Scenario duty and handling", amount: { currency: "EUR", minorUnits: 300 }, operation: "ADD", provenance: stubProvenance("fixture-duty-rule", REJECTED_TIME) },
], 8160, "1.2203389831");

export const acceptedLandedCost = makeLandedCost(acceptedOffer, [
  { code: "ITEM", label: "Item", amount: { currency: "EUR", minorUnits: 6900 }, operation: "ADD", provenance: observedProvenance("fixture:merchant-warsaw-sneakers", ACCEPTED_TIME) },
  { code: "DELIVERY", label: "Delivery", amount: { currency: "EUR", minorUnits: 740 }, operation: "ADD", provenance: observedProvenance("fixture:merchant-warsaw-sneakers", ACCEPTED_TIME) },
], 7640, null);

export const headlineEvents: readonly SimulationEvent[] = [
  SimulationEventSchema.parse({ schemaVersion: 1, id: "event-001", runId: "headline-run", sequence: 0, occurredAt: REJECTED_TIME, type: "OFFER_OBSERVED", offer: rejectedOffer, evidence: rejectedEvidence }),
  SimulationEventSchema.parse({ schemaVersion: 1, id: "event-002", runId: "headline-run", sequence: 1, occurredAt: ACCEPTED_TIME, type: "OFFER_OBSERVED", offer: acceptedOffer, evidence: acceptedEvidence }),
];

const makeDecision = (input: {
  event: SimulationEvent;
  offer: OfferSnapshot;
  evidence: EvidenceBundle;
  match: MatchAssessment;
  cost: LandedCost;
  outcome: "REJECT" | "ALERT";
  reason: "LANDED_COST_ABOVE_CAP" | "VALID_DEAL_ALERT";
}): DecisionRecord => DecisionRecordSchema.parse({
  schemaVersion: 1,
  id: `decision-${input.event.id}`,
  requestId: headlineRequest.id,
  requestVersion: headlineRequest.version,
  eventId: input.event.id,
  offer: input.offer,
  evidence: input.evidence,
  match: input.match,
  landedCost: input.cost,
  outcome: input.outcome,
  primaryReason: input.reason,
  requirements: [
    { requirement: "identity", result: "PASS", explanation: "Exact fixture identifier matched." },
    { requirement: "size", result: "PASS", explanation: "EU size 43 matched." },
    { requirement: "condition", result: "PASS", explanation: "New condition verified." },
    { requirement: "seller", result: "PASS", explanation: "Merchant-owned seller fixture verified." },
    { requirement: "landed-cost-cap", result: input.cost.total.minorUnits <= 8000 ? "PASS" : "FAIL", explanation: input.cost.total.minorUnits <= 8000 ? "Landed cost is within EUR 80.00." : "Landed cost exceeds EUR 80.00." },
  ],
  mandateId: null,
  notificationSuppressed: false,
  policyVersion: "fixture-policy-v1",
  provenance: stubProvenance("fixture-policy-adapter", input.event.occurredAt),
  decidedAt: input.event.occurredAt,
});

export const rejectedDecision = makeDecision({ event: headlineEvents[0]!, offer: rejectedOffer, evidence: rejectedEvidence, match: rejectedMatch, cost: rejectedLandedCost, outcome: "REJECT", reason: "LANDED_COST_ABOVE_CAP" });
export const acceptedDecision = makeDecision({ event: headlineEvents[1]!, offer: acceptedOffer, evidence: acceptedEvidence, match: acceptedMatch, cost: acceptedLandedCost, outcome: "ALERT", reason: "VALID_DEAL_ALERT" });

export const decisionsByOfferId = new Map<string, DecisionRecord>([
  [rejectedOffer.id, rejectedDecision],
  [acceptedOffer.id, acceptedDecision],
]);

export const matchesByOfferId = new Map<string, MatchAssessment>([
  [rejectedOffer.id, rejectedMatch],
  [acceptedOffer.id, acceptedMatch],
]);

export const costsByOfferId = new Map<string, LandedCost>([
  [rejectedOffer.id, rejectedLandedCost],
  [acceptedOffer.id, acceptedLandedCost],
]);
