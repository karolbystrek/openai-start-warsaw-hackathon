import {
  EvidenceBundleSchema,
  OfferSnapshotSchema,
  ScenarioFixtureSchema,
  ShoppingRequestSchema,
  SimulationEventSchema,
  type EvidenceBundle,
  type OfferSnapshot,
  type SimulationEvent,
} from "@/domain/contracts";

export const HEADLINE_FIXTURE_VERSION = "headline-v3";
export const HEADLINE_SEED = "solidgate-headline-2026";
const REQUEST_TIME = "2026-07-11T08:00:00.000Z";
const WRONG_VARIANT_TIME = "2026-07-11T08:01:00.000Z";
const OVER_CAP_TIME = "2026-07-11T08:02:00.000Z";
const COUPON_TIME = "2026-07-11T08:03:00.000Z";
const ACCEPTED_TIME = "2026-07-11T08:04:00.000Z";
const LOW_STOCK_TIME = "2026-07-11T08:05:00.000Z";

export const headlineRequest = ShoppingRequestSchema.parse({
  schemaVersion: 1,
  id: "request-nike-dunk-pl",
  version: 1,
  originalText: "Nike Dunk Low, size 43, under EUR 80 delivered. New only, no resellers. If it lands within EUR 5 of the target and stock is low, do not ask - just buy. Otherwise, notify me once.",
  lifecycle: "ACTIVE",
  product: { brand: "Nike", model: "Dunk Low", category: "shoes", identifiers: [{ type: "MPN", value: "DD1391-100" }] },
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

const observed = (source: string, observedAt: string) => ({ kind: "OBSERVED" as const, source, observedAt, adapterVersion: HEADLINE_FIXTURE_VERSION });

const makeOffer = (input: {
  id: string;
  sequenceLabel: string;
  merchantId: string;
  title: string;
  identifier: string;
  model: string | null;
  size: string | null;
  itemCurrency: string;
  itemMinor: number;
  deliveryMinor: number;
  observedAt: string;
}): OfferSnapshot => OfferSnapshotSchema.parse({
  schemaVersion: 1,
  id: input.id,
  listingId: `listing-${input.sequenceLabel}`,
  merchantId: input.merchantId,
  sellerId: `seller-${input.merchantId}`,
  title: input.title,
  listingRef: `sim://${input.merchantId}/listing-${input.sequenceLabel}`,
  identifiers: [{ type: "MPN", value: input.identifier }],
  attributes: { brand: "Nike", model: input.model, size: input.size, condition: "NEW", quantity: 1 },
  itemPrice: { currency: input.itemCurrency, minorUnits: input.itemMinor },
  deliveryPrice: { currency: input.itemCurrency, minorUnits: input.deliveryMinor },
  destinationCountries: ["PL"],
  observedAt: input.observedAt,
});

export const wrongVariantOffer = makeOffer({
  id: "offer-wrong-variant",
  sequenceLabel: "wrong-variant",
  merchantId: "merchant-marketplace-demo",
  title: "Nike Dunk High White Black EU 43",
  identifier: "FIXTURE-DUNK-HIGH",
  model: "Dunk High",
  size: "EU 43",
  itemCurrency: "EUR",
  itemMinor: 5200,
  deliveryMinor: 500,
  observedAt: WRONG_VARIANT_TIME,
});

export const rejectedOffer = makeOffer({
  id: "offer-uk-over-cap",
  sequenceLabel: "uk-001",
  merchantId: "merchant-london-sneakers",
  title: "Nike Dunk Low Retro White Black EU 43",
  identifier: "DD1391-100",
  model: "Dunk Low",
  size: "EU 43",
  itemCurrency: "GBP",
  itemMinor: 5900,
  deliveryMinor: 540,
  observedAt: OVER_CAP_TIME,
});

export const invalidCouponOffer = makeOffer({
  id: "offer-invalid-coupon",
  sequenceLabel: "coupon-001",
  merchantId: "merchant-coupon-demo",
  title: "Nike Dunk Low Panda EU 43 — SAVE20",
  identifier: "DD1391-100",
  model: "Dunk Low",
  size: "EU 43",
  itemCurrency: "EUR",
  itemMinor: 7600,
  deliveryMinor: 600,
  observedAt: COUPON_TIME,
});

export const acceptedOffer = makeOffer({
  id: "offer-eu-valid",
  sequenceLabel: "eu-001",
  merchantId: "merchant-warsaw-sneakers",
  title: "Nike Dunk Low Retro White Black EU 43",
  identifier: "DD1391-100",
  model: "Dunk Low",
  size: "EU 43",
  itemCurrency: "EUR",
  itemMinor: 6900,
  deliveryMinor: 740,
  observedAt: ACCEPTED_TIME,
});

const makeEvidence = (offer: OfferSnapshot, input?: { coupon?: "PASS" | "FAIL"; couponValue?: string; seller?: "PASS" | "FAIL" }): EvidenceBundle => {
  const item = (key: string, result: "PASS" | "FAIL", value: string) => ({ key, result, value, provenance: observed(`fixture:${offer.merchantId}`, offer.observedAt) });
  return EvidenceBundleSchema.parse({
    schemaVersion: 1,
    id: `evidence-${offer.id}`,
    offerId: offer.id,
    seller: item("seller", input?.seller ?? "PASS", input?.seller === "FAIL" ? "UNVERIFIED" : "MERCHANT_OWNED"),
    stock: item("stock", "PASS", "IN_STOCK"),
    condition: item("condition", "PASS", "NEW"),
    destination: item("destination", "PASS", "PL"),
    coupon: item("coupon", input?.coupon ?? "PASS", input?.couponValue ?? "NONE"),
    discount: item("discount", "PASS", "NOT_REQUIRED"),
    capturedAt: offer.observedAt,
  });
};

export const wrongVariantEvidence = makeEvidence(wrongVariantOffer, { seller: "FAIL" });
export const rejectedEvidence = makeEvidence(rejectedOffer);
export const invalidCouponEvidence = makeEvidence(invalidCouponOffer, { coupon: "FAIL", couponValue: "SAVE20_EXPIRED" });
export const acceptedEvidence = makeEvidence(acceptedOffer);

const offerEvent = (sequence: number, occurredAt: string, offer: OfferSnapshot, evidence: EvidenceBundle): SimulationEvent => SimulationEventSchema.parse({
  schemaVersion: 1,
  id: `headline-event-${String(sequence + 1).padStart(3, "0")}`,
  runId: "headline-run",
  sequence,
  occurredAt,
  type: "OFFER_OBSERVED",
  offer,
  evidence,
});

export const headlineEvents: readonly SimulationEvent[] = [
  offerEvent(0, WRONG_VARIANT_TIME, wrongVariantOffer, wrongVariantEvidence),
  offerEvent(1, OVER_CAP_TIME, rejectedOffer, rejectedEvidence),
  offerEvent(2, COUPON_TIME, invalidCouponOffer, invalidCouponEvidence),
  offerEvent(3, ACCEPTED_TIME, acceptedOffer, acceptedEvidence),
  SimulationEventSchema.parse({
    schemaVersion: 1,
    id: "headline-event-005",
    runId: "headline-run",
    sequence: 4,
    occurredAt: LOW_STOCK_TIME,
    type: "STOCK_CHANGED",
    offerId: acceptedOffer.id,
    stockState: "LOW_STOCK",
    quantityAvailable: 2,
  }),
];

export const headlineScenario = ScenarioFixtureSchema.parse({
  schemaVersion: 1,
  id: "headline-run",
  fixtureVersion: HEADLINE_FIXTURE_VERSION,
  seed: HEADLINE_SEED,
  virtualStartAt: REQUEST_TIME,
  request: headlineRequest,
  events: headlineEvents,
});
