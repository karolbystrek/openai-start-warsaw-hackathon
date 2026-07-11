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
  })),
});

const truth = (
  scenarioId: string,
  match: "PASS" | "FAIL" | "UNKNOWN",
  offerIsValidDeal: boolean,
  expectedOutcome: "IGNORE" | "REJECT" | "ESCALATE" | "ALERT",
  canonicalProductId: string | null = match === "PASS" ? "nike-dunk-low-retro-white-black" : null,
) => ScenarioGroundTruthSchema.parse({
  scenarioId,
  expected: [{ eventId: `event-${scenarioId}-1`, canonicalProductId, match, offerIsValidDeal, expectedOutcome }],
});

export const headlineGroundTruth = ScenarioGroundTruthSchema.parse({
  scenarioId: "headline-run",
  expected: [
    { eventId: "headline-event-001", canonicalProductId: "nike-dunk-high-demo", match: "FAIL", offerIsValidDeal: false, expectedOutcome: "REJECT" },
    { eventId: "headline-event-002", canonicalProductId: "nike-dunk-low-retro-white-black", match: "PASS", offerIsValidDeal: false, expectedOutcome: "REJECT" },
    { eventId: "headline-event-003", canonicalProductId: "nike-dunk-low-retro-white-black", match: "PASS", offerIsValidDeal: false, expectedOutcome: "REJECT" },
    { eventId: "headline-event-004", canonicalProductId: "nike-dunk-low-retro-white-black", match: "PASS", offerIsValidDeal: true, expectedOutcome: "ALERT" },
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
  truth("bait-price-other-variant", "FAIL", false, "REJECT", "nike-dunk-high-demo"),
  ...["reseller-channel", "blocked-seller", "unavailable-stock", "stale-stock", "foreign-currency", "fx-crosses-cap", "delivery-over-cap", "duty-handling-over-cap", "invalid-coupon", "expired-coupon", "coupon-minimum-spend", "coupon-product-excluded", "coupon-non-stackable", "inflated-reference-price", "one-minor-above-cap"].map((id) => truth(id, "PASS", false, id === "stale-stock" ? "ESCALATE" : "REJECT")),
  ...["low-stock", "exact-cap", "one-minor-below-cap"].map((id) => truth(id, "PASS", true, "ALERT")),
  ScenarioGroundTruthSchema.parse({ scenarioId: "duplicate-listing-event", expected: [
    { eventId: "event-duplicate-listing-event-1", canonicalProductId: "nike-dunk-low-retro-white-black", match: "PASS", offerIsValidDeal: true, expectedOutcome: "ALERT" },
    { eventId: "event-duplicate-listing-event-2", canonicalProductId: "nike-dunk-low-retro-white-black", match: "PASS", offerIsValidDeal: true, expectedOutcome: "IGNORE" },
  ] }),
];
