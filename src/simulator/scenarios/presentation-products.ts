import {
  EvidenceBundleSchema,
  OfferSnapshotSchema,
  ScenarioFixtureSchema,
  ShoppingRequestSchema,
  SimulationEventSchema,
  type EvidenceBundle,
  type OfferSnapshot,
  type ScenarioFixture,
} from "@/domain/contracts";
import { presentationProductById, type PresentationProductId } from "@/domain/catalog/presentation-products";

const START = "2026-07-13T08:00:00.000Z";
const WRONG_TIME = "2026-07-13T08:01:00.000Z";
const VALID_TIME = "2026-07-13T08:02:00.000Z";
const FIXTURE_VERSION = "presentation-products-v1";

type PresentationCase = {
  id: Exclude<PresentationProductId, "shoes">;
  wrong: {
    identifier: string;
    model: string;
    variant: string;
    title: string;
    itemMinor: number;
    deliveryMinor: number;
  };
  valid: {
    title: string;
    itemMinor: number;
    deliveryMinor: number;
  };
};

const cases: readonly PresentationCase[] = [
  {
    id: "vase",
    wrong: {
      identifier: "FIXTURE-IITTALA-AALTO-120-OPAL",
      model: "Aalto Vase",
      variant: "120 mm opal glass",
      title: "Iittala Aalto Vase 120 mm Opal — special price",
      itemMinor: 7_900,
      deliveryMinor: 900,
    },
    valid: {
      title: "Iittala Aalto Vase 160 mm Clear Glass",
      itemMinor: 11_900,
      deliveryMinor: 900,
    },
  },
  {
    id: "macbook",
    wrong: {
      identifier: "FIXTURE-MBA-M2-13-8-256",
      model: "MacBook Air M2",
      variant: "13-inch 8 GB RAM 256 GB SSD",
      title: "Apple MacBook Air 13-inch M2 8 GB 256 GB",
      itemMinor: 89_900,
      deliveryMinor: 1_900,
    },
    valid: {
      title: "Apple MacBook Air 13-inch M3 16 GB RAM 512 GB SSD",
      itemMinor: 119_900,
      deliveryMinor: 3_900,
    },
  },
];

const makeEvidence = (offer: OfferSnapshot): EvidenceBundle => {
  const item = (key: string, value: string) => ({
    key,
    result: "PASS" as const,
    value,
    provenance: {
      kind: "OBSERVED" as const,
      source: `fixture:${offer.merchantId}`,
      observedAt: offer.observedAt,
      adapterVersion: FIXTURE_VERSION,
    },
  });
  return EvidenceBundleSchema.parse({
    schemaVersion: 1,
    id: `evidence-${offer.id}`,
    offerId: offer.id,
    seller: item("seller", "VERIFIED_MERCHANT"),
    stock: item("stock", "IN_STOCK"),
    condition: item("condition", "NEW"),
    destination: item("destination", "PL"),
    coupon: item("coupon", "NONE"),
    discount: item("discount", "NOT_REQUIRED"),
    capturedAt: offer.observedAt,
  });
};

const createScenario = (definition: PresentationCase): ScenarioFixture => {
  const profile = presentationProductById.get(definition.id);
  if (!profile) throw new Error(`Missing presentation profile ${definition.id}.`);
  const request = ShoppingRequestSchema.parse({
    schemaVersion: 1,
    id: `request-${definition.id}-pl`,
    version: 1,
    originalText: profile.brief,
    lifecycle: "ACTIVE",
    product: {
      brand: profile.brand,
      model: profile.model,
      category: profile.category,
      identifiers: [profile.identifier],
    },
    requirements: {
      size: profile.requiredVariant,
      condition: "NEW",
      quantity: 1,
      destinationCountry: "PL",
      allowResellers: false,
      maximumLandedCost: profile.maximumLandedCost,
    },
    preferences: [],
    notificationPolicy: { mode: "ONCE", improvementThresholdMinor: 0 },
    unresolvedAmbiguities: [],
    effectiveAt: START,
  });

  const offer = (kind: "wrong" | "valid", observedAt: string): OfferSnapshot => {
    const input = definition[kind];
    const isValid = kind === "valid";
    return OfferSnapshotSchema.parse({
      schemaVersion: 1,
      id: `${definition.id}-offer-${kind}`,
      listingId: `${definition.id}-listing-${kind}`,
      merchantId: `${definition.id}-merchant-${kind}`,
      sellerId: `${definition.id}-seller-${kind}`,
      title: input.title,
      listingRef: `sim://${definition.id}/${kind}`,
      identifiers: [{
        type: "MPN",
        value: isValid ? profile.identifier.value : definition.wrong.identifier,
      }],
      attributes: {
        brand: profile.brand,
        model: isValid ? profile.model : definition.wrong.model,
        size: isValid ? profile.requiredVariant : definition.wrong.variant,
        condition: "NEW",
        quantity: 1,
      },
      itemPrice: { currency: "EUR", minorUnits: input.itemMinor },
      deliveryPrice: { currency: "EUR", minorUnits: input.deliveryMinor },
      destinationCountries: ["PL"],
      observedAt,
    });
  };

  const wrong = offer("wrong", WRONG_TIME);
  const valid = offer("valid", VALID_TIME);
  const events = [wrong, valid].map((observedOffer, sequence) => SimulationEventSchema.parse({
    schemaVersion: 1,
    id: `${definition.id}-event-${sequence + 1}`,
    runId: `${definition.id}-demo-run`,
    sequence,
    occurredAt: observedOffer.observedAt,
    type: "OFFER_OBSERVED",
    offer: observedOffer,
    evidence: makeEvidence(observedOffer),
  }));

  return ScenarioFixtureSchema.parse({
    schemaVersion: 1,
    id: `${definition.id}-demo-run`,
    fixtureVersion: FIXTURE_VERSION,
    seed: `solidgate-${definition.id}-presentation-v1`,
    virtualStartAt: START,
    request,
    events,
  });
};

export const presentationProductScenarios: readonly ScenarioFixture[] = cases.map(createScenario);
