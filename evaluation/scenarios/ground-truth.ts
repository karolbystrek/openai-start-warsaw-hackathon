import { z } from "zod";

// Evaluation-only labels. Runtime source under src/ must never import this module.
export const ScenarioGroundTruthSchema = z.object({
  scenarioId: z.string().min(1),
  expected: z.array(z.object({
    eventId: z.string().min(1),
    canonicalProductId: z.string().min(1).nullable(),
    match: z.enum(["PASS", "FAIL", "UNKNOWN"]),
    offerIsValidDeal: z.boolean(),
    expectedOutcome: z.enum(["IGNORE", "REJECT", "ESCALATE", "ALERT", "BUY_SIMULATED"]),
    expectedLandedCostMinor: z.number().int().nonnegative(),
  })),
});

const truth = (
  scenarioId: string,
  match: "PASS" | "FAIL" | "UNKNOWN",
  offerIsValidDeal: boolean,
  expectedOutcome: "IGNORE" | "REJECT" | "ESCALATE" | "ALERT",
  canonicalProductId: string | null = match === "PASS" ? "nike-dunk-low-retro-white-black" : null,
  expectedLandedCostMinor = 7640,
) => ScenarioGroundTruthSchema.parse({
  scenarioId,
  expected: [{ eventId: `event-${scenarioId}-1`, canonicalProductId, match, offerIsValidDeal, expectedOutcome, expectedLandedCostMinor }],
});

export const headlineGroundTruth = ScenarioGroundTruthSchema.parse({
  scenarioId: "headline-run",
  expected: [
    { eventId: "headline-event-001", canonicalProductId: "nike-dunk-high-demo", match: "FAIL", offerIsValidDeal: false, expectedOutcome: "REJECT", expectedLandedCostMinor: 5700 },
    { eventId: "headline-event-002", canonicalProductId: "nike-dunk-low-retro-white-black", match: "PASS", offerIsValidDeal: false, expectedOutcome: "REJECT", expectedLandedCostMinor: 8160 },
    { eventId: "headline-event-003", canonicalProductId: "nike-dunk-low-retro-white-black", match: "PASS", offerIsValidDeal: false, expectedOutcome: "REJECT", expectedLandedCostMinor: 8200 },
    { eventId: "headline-event-004", canonicalProductId: "nike-dunk-low-retro-white-black", match: "PASS", offerIsValidDeal: true, expectedOutcome: "ALERT", expectedLandedCostMinor: 7640 },
  ],
});

export const adversarialGroundTruth = [
  truth("exact-identifier-valid", "PASS", true, "ALERT"),
  truth("seeded-alias-valid", "PASS", true, "ALERT"),
  truth("normalized-token-valid", "PASS", true, "ALERT"),
  truth("ai-assisted-valid", "PASS", true, "ALERT"),
  truth("missing-identity-unresolved", "UNKNOWN", false, "ESCALATE"),
  truth("conflicting-exact-identifiers", "FAIL", false, "REJECT"),
  truth("wrong-model", "FAIL", false, "REJECT"),
  truth("wrong-silhouette", "FAIL", false, "REJECT", "nike-dunk-high-demo"),
  truth("wrong-size", "FAIL", false, "REJECT"),
  truth("wrong-audience-gs", "FAIL", false, "REJECT", "nike-dunk-low-gs-demo"),
  truth("wrong-condition-used", "FAIL", false, "REJECT"),
  truth("bait-price-other-variant", "FAIL", false, "REJECT", "nike-dunk-high-demo", 5640),
  ...["reseller-channel", "blocked-seller", "unavailable-stock", "stale-stock"].map((id) => truth(id, "PASS", false, id === "stale-stock" ? "ESCALATE" : "REJECT")),
  truth("foreign-currency", "PASS", false, "REJECT", "nike-dunk-low-retro-white-black", 8160),
  truth("fx-crosses-cap", "PASS", false, "REJECT", "nike-dunk-low-retro-white-black", 8050),
  truth("delivery-over-cap", "PASS", false, "REJECT", "nike-dunk-low-retro-white-black", 8100),
  truth("duty-handling-over-cap", "PASS", false, "REJECT", "nike-dunk-low-retro-white-black", 8230),
  truth("one-minor-above-cap", "PASS", false, "REJECT", "nike-dunk-low-retro-white-black", 8001),
  ...["low-stock", "invalid-coupon", "expired-coupon", "coupon-minimum-spend", "coupon-product-excluded", "coupon-non-stackable"].map((id) => truth(id, "PASS", true, "ALERT")),
  truth("inflated-reference-price", "PASS", true, "ALERT"),
  truth("exact-cap", "PASS", true, "ALERT", "nike-dunk-low-retro-white-black", 8000),
  truth("one-minor-below-cap", "PASS", true, "ALERT", "nike-dunk-low-retro-white-black", 7999),
  ScenarioGroundTruthSchema.parse({ scenarioId: "duplicate-listing-event", expected: [
    { eventId: "event-duplicate-listing-event-1", canonicalProductId: "nike-dunk-low-retro-white-black", match: "PASS", offerIsValidDeal: true, expectedOutcome: "ALERT", expectedLandedCostMinor: 7640 },
    { eventId: "event-duplicate-listing-event-2", canonicalProductId: "nike-dunk-low-retro-white-black", match: "PASS", offerIsValidDeal: true, expectedOutcome: "IGNORE", expectedLandedCostMinor: 7640 },
  ] }),
];

export const purchaseGroundTruth = ScenarioGroundTruthSchema.parse({
  scenarioId: "purchase-authorization",
  expected: [
    { eventId: "event-purchase-valid-1", canonicalProductId: "nike-dunk-low-retro-white-black", match: "PASS", offerIsValidDeal: true, expectedOutcome: "BUY_SIMULATED", expectedLandedCostMinor: 7640 },
    { eventId: "event-purchase-revoked-1", canonicalProductId: "nike-dunk-low-retro-white-black", match: "PASS", offerIsValidDeal: true, expectedOutcome: "ALERT", expectedLandedCostMinor: 7640 },
    { eventId: "event-purchase-expired-1", canonicalProductId: "nike-dunk-low-retro-white-black", match: "PASS", offerIsValidDeal: true, expectedOutcome: "ALERT", expectedLandedCostMinor: 7640 },
    { eventId: "event-purchase-consumed-1", canonicalProductId: "nike-dunk-low-retro-white-black", match: "PASS", offerIsValidDeal: true, expectedOutcome: "ALERT", expectedLandedCostMinor: 7640 },
    { eventId: "event-purchase-wrong-version-1", canonicalProductId: "nike-dunk-low-retro-white-black", match: "PASS", offerIsValidDeal: true, expectedOutcome: "ALERT", expectedLandedCostMinor: 7640 },
    { eventId: "event-purchase-wrong-merchant-1", canonicalProductId: "nike-dunk-low-retro-white-black", match: "PASS", offerIsValidDeal: true, expectedOutcome: "ALERT", expectedLandedCostMinor: 7640 },
    { eventId: "event-purchase-unknown-stock-1", canonicalProductId: "nike-dunk-low-retro-white-black", match: "PASS", offerIsValidDeal: false, expectedOutcome: "ESCALATE", expectedLandedCostMinor: 7640 },
    { eventId: "event-purchase-price-changed-1", canonicalProductId: "nike-dunk-low-retro-white-black", match: "PASS", offerIsValidDeal: false, expectedOutcome: "REJECT", expectedLandedCostMinor: 8100 },
  ],
});
