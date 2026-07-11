import {
  EvidenceBundleSchema,
  OfferSnapshotSchema,
  ScenarioFixtureSchema,
  SimulationEventSchema,
  type CheckResult,
  type OfferSnapshot,
  type ScenarioFixture,
} from "@/domain/contracts";
import { headlineRequest } from "@/simulator/scenarios/headline";

const START = "2026-07-12T08:00:00.000Z";
const EVENT_TIME = "2026-07-12T08:01:00.000Z";
const FIXTURE_VERSION = "adversarial-v1";

interface CaseDefinition {
  id: string;
  title?: string;
  identifiers?: OfferSnapshot["identifiers"];
  brand?: string | null;
  model?: string | null;
  size?: string | null;
  condition?: "NEW" | "USED" | "REFURBISHED" | null;
  itemCurrency?: string;
  itemMinor?: number;
  deliveryMinor?: number;
  seller?: CheckResult;
  sellerValue?: string;
  stock?: CheckResult;
  stockValue?: string;
  coupon?: CheckResult;
  couponValue?: string;
  discount?: CheckResult;
  discountValue?: string;
  duplicate?: boolean;
}

const cases: readonly CaseDefinition[] = [
  { id: "exact-identifier-valid" },
  { id: "seeded-alias-valid", identifiers: [], title: "Nike Dunk Low Panda EU 43" },
  { id: "normalized-token-valid", identifiers: [], title: "NIKE men's low DUNK retro shoe, EU-43" },
  { id: "ai-assisted-valid", identifiers: [], title: "NKE Dunk Lo Retro Panda mens 43", brand: null, model: null },
  { id: "missing-identity-unresolved", identifiers: [], title: "Classic black and white sneaker size 43", brand: null, model: null },
  { id: "conflicting-exact-identifiers", identifiers: [{ type: "MPN", value: "DD1391-100" }, { type: "MPN", value: "FIXTURE-DUNK-HIGH" }] },
  { id: "wrong-model", title: "Nike Air Force 1 EU 43", identifiers: [], model: "Air Force 1" },
  { id: "wrong-silhouette", title: "Nike Dunk High EU 43", identifiers: [{ type: "MPN", value: "FIXTURE-DUNK-HIGH" }], model: "Dunk High" },
  { id: "wrong-size", size: "EU 42" },
  { id: "wrong-audience-gs", title: "Nike Dunk Low GS EU 43", identifiers: [{ type: "MPN", value: "FIXTURE-DUNK-GS" }], model: "Dunk Low GS" },
  { id: "wrong-condition-used", condition: "USED" },
  { id: "bait-price-other-variant", title: "From EUR 49 — Nike Dunk High; selected Dunk Low EU 43 EUR 99", identifiers: [{ type: "MPN", value: "FIXTURE-DUNK-HIGH" }], model: "Dunk High", itemMinor: 4900 },
  { id: "reseller-channel", seller: "FAIL", sellerValue: "THIRD_PARTY_RESELLER" },
  { id: "blocked-seller", seller: "FAIL", sellerValue: "BLOCKED" },
  { id: "unavailable-stock", stock: "FAIL", stockValue: "OUT_OF_STOCK" },
  { id: "low-stock", stockValue: "LOW_STOCK:2" },
  { id: "stale-stock", stock: "UNKNOWN", stockValue: "STALE" },
  { id: "foreign-currency", itemCurrency: "GBP", itemMinor: 5900, deliveryMinor: 540 },
  { id: "fx-crosses-cap", itemCurrency: "GBP", itemMinor: 5850, deliveryMinor: 500 },
  { id: "delivery-over-cap", itemMinor: 6900, deliveryMinor: 1200 },
  { id: "duty-handling-over-cap", itemCurrency: "GBP", itemMinor: 5700, deliveryMinor: 400 },
  { id: "invalid-coupon", coupon: "FAIL", couponValue: "INVALID:SAVE20" },
  { id: "expired-coupon", coupon: "FAIL", couponValue: "EXPIRED:SAVE20" },
  { id: "coupon-minimum-spend", coupon: "FAIL", couponValue: "MINIMUM_SPEND_NOT_MET:10000" },
  { id: "coupon-product-excluded", coupon: "FAIL", couponValue: "PRODUCT_EXCLUDED" },
  { id: "coupon-non-stackable", coupon: "FAIL", couponValue: "STACKING_NOT_ALLOWED" },
  { id: "inflated-reference-price", discount: "FAIL", discountValue: "INFLATED_REFERENCE_PRICE" },
  { id: "duplicate-listing-event", duplicate: true },
  { id: "exact-cap", itemMinor: 7300, deliveryMinor: 700 },
  { id: "one-minor-below-cap", itemMinor: 7299, deliveryMinor: 700 },
  { id: "one-minor-above-cap", itemMinor: 7301, deliveryMinor: 700 },
];

const createScenario = (definition: CaseDefinition): ScenarioFixture => {
  const offer = OfferSnapshotSchema.parse({
    schemaVersion: 1,
    id: `offer-${definition.id}`,
    listingId: `listing-${definition.id}`,
    merchantId: `merchant-${definition.id}`,
    sellerId: `seller-${definition.id}`,
    title: definition.title ?? "Nike Dunk Low Retro White Black EU 43",
    listingRef: `sim://${definition.id}/listing`,
    identifiers: definition.identifiers ?? [{ type: "MPN", value: "DD1391-100" }],
    attributes: {
      brand: definition.brand === undefined ? "Nike" : definition.brand,
      model: definition.model === undefined ? "Dunk Low" : definition.model,
      size: definition.size === undefined ? "EU 43" : definition.size,
      condition: definition.condition === undefined ? "NEW" : definition.condition,
      quantity: 1,
    },
    itemPrice: { currency: definition.itemCurrency ?? "EUR", minorUnits: definition.itemMinor ?? 6900 },
    deliveryPrice: { currency: definition.itemCurrency ?? "EUR", minorUnits: definition.deliveryMinor ?? 740 },
    destinationCountries: ["PL"],
    observedAt: EVENT_TIME,
  });
  const item = (key: string, result: CheckResult, value: string) => ({
    key,
    result,
    value,
    provenance: { kind: "OBSERVED" as const, source: `fixture:${definition.id}`, observedAt: EVENT_TIME, adapterVersion: FIXTURE_VERSION },
  });
  const evidence = EvidenceBundleSchema.parse({
    schemaVersion: 1,
    id: `evidence-${definition.id}`,
    offerId: offer.id,
    seller: item("seller", definition.seller ?? "PASS", definition.sellerValue ?? "VERIFIED_MERCHANT"),
    stock: item("stock", definition.stock ?? "PASS", definition.stockValue ?? "IN_STOCK"),
    condition: item("condition", definition.condition === "USED" ? "FAIL" : "PASS", definition.condition ?? "NEW"),
    destination: item("destination", "PASS", "PL"),
    coupon: item("coupon", definition.coupon ?? "PASS", definition.couponValue ?? "NONE"),
    discount: item("discount", definition.discount ?? "PASS", definition.discountValue ?? "NOT_REQUIRED"),
    capturedAt: EVENT_TIME,
  });
  const first = SimulationEventSchema.parse({
    schemaVersion: 1,
    id: `event-${definition.id}-1`,
    runId: definition.id,
    sequence: 0,
    occurredAt: EVENT_TIME,
    type: "OFFER_OBSERVED",
    offer,
    evidence,
  });
  const events = definition.duplicate
    ? [first, SimulationEventSchema.parse({ ...first, id: `event-${definition.id}-2`, sequence: 1, occurredAt: "2026-07-12T08:02:00.000Z" })]
    : [first];
  return ScenarioFixtureSchema.parse({
    schemaVersion: 1,
    id: definition.id,
    fixtureVersion: FIXTURE_VERSION,
    seed: `solidgate-${definition.id}-v1`,
    virtualStartAt: START,
    request: headlineRequest,
    events,
  });
};

export const adversarialScenarios: readonly ScenarioFixture[] = cases.map(createScenario);
