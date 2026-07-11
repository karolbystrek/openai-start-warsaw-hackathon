import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;

export const StableIdSchema = z.string().trim().min(1);
export const TimestampSchema = z.iso.datetime({ offset: true });
export const CurrencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);
export const DecimalStringSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);

export const MoneySchema = z.object({
  currency: CurrencyCodeSchema,
  minorUnits: z.number().int().safe().nonnegative(),
});
export type Money = z.infer<typeof MoneySchema>;

export const CheckResultSchema = z.enum(["PASS", "FAIL", "UNKNOWN"]);
export type CheckResult = z.infer<typeof CheckResultSchema>;

export const DecisionOutcomeSchema = z.enum([
  "IGNORE",
  "REJECT",
  "ESCALATE",
  "ALERT",
  "BUY_SIMULATED",
]);
export type DecisionOutcome = z.infer<typeof DecisionOutcomeSchema>;

export const ReasonCodeSchema = z.enum([
  "MALFORMED_EVIDENCE",
  "STALE_CRITICAL_EVIDENCE",
  "HARD_REQUIREMENT_MISMATCH",
  "UNAVAILABLE_STOCK",
  "UNKNOWN_CRITICAL_FACT",
  "PRICING_INPUT_UNKNOWN",
  "LANDED_COST_ABOVE_CAP",
  "VALID_DEAL_ALERT",
  "VALID_MANDATE_PURCHASE",
  "DUPLICATE_SUPPRESSED",
]);
export type ReasonCode = z.infer<typeof ReasonCodeSchema>;

export const ProvenanceSchema = z.object({
  kind: z.enum(["OBSERVED", "SEEDED", "COMPUTED", "AI_DERIVED", "STUB"]),
  source: z.string().min(1),
  observedAt: TimestampSchema,
  adapterVersion: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  promptVersion: z.string().min(1).optional(),
  outputSchemaVersion: z.string().min(1).optional(),
  responseId: z.string().min(1).optional(),
  inputDigest: z.string().min(1).optional(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const ShoppingRequestSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: StableIdSchema,
  version: z.number().int().positive(),
  originalText: z.string().min(1),
  lifecycle: z.enum(["DRAFT", "ACTIVE", "PAUSED", "REVOKED", "FULFILLED"]),
  product: z.object({
    brand: z.string().min(1),
    model: z.string().min(1),
    category: z.string().min(1),
    identifiers: z.array(z.object({ type: z.enum(["GTIN", "EAN", "UPC", "MPN", "SKU"]), value: z.string().min(1) })),
  }),
  requirements: z.object({
    size: z.string().min(1),
    condition: z.enum(["NEW", "USED", "REFURBISHED"]),
    quantity: z.number().int().positive(),
    destinationCountry: z.string().regex(/^[A-Z]{2}$/),
    allowResellers: z.boolean(),
    maximumLandedCost: MoneySchema,
    latestDeliveryAt: TimestampSchema.optional(),
  }),
  preferences: z.array(z.string().min(1)),
  notificationPolicy: z.object({ mode: z.enum(["ONCE", "MEANINGFUL_IMPROVEMENT"]), improvementThresholdMinor: z.number().int().safe().nonnegative() }),
  unresolvedAmbiguities: z.array(z.string().min(1)),
  effectiveAt: TimestampSchema,
});
export type ShoppingRequest = z.infer<typeof ShoppingRequestSchema>;

export const BriefAmbiguitySchema = z.object({
  code: z.enum([
    "MISSING_PRODUCT",
    "MISSING_SIZE",
    "MISSING_CONDITION",
    "MISSING_DESTINATION",
    "MISSING_BUDGET",
    "MISSING_SELLER_POLICY",
    "UNCLEAR_DELIVERED_CAP",
    "CONFLICTING_REQUIREMENT",
    "AMBIGUOUS_PURCHASE_CONSENT",
  ]),
  fieldPath: z.string().min(1),
  blocking: z.boolean(),
  explanation: z.string().min(1),
  clarificationQuestion: z.string().min(1),
});
export type BriefAmbiguity = z.infer<typeof BriefAmbiguitySchema>;

export const ShoppingBriefInterpretationSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  originalText: z.string().min(1),
  requestDraft: z.object({
    product: z.object({
      brand: z.string().min(1).nullable(),
      model: z.string().min(1).nullable(),
      category: z.string().min(1).nullable(),
      identifiers: z.array(z.object({ type: z.enum(["GTIN", "EAN", "UPC", "MPN", "SKU"]), value: z.string().min(1) })),
    }),
    requirements: z.object({
      size: z.string().min(1).nullable(),
      condition: z.enum(["NEW", "USED", "REFURBISHED"]).nullable(),
      quantity: z.number().int().positive(),
      destinationCountry: z.string().regex(/^[A-Z]{2}$/).nullable(),
      allowResellers: z.boolean().nullable(),
      maximumLandedCost: MoneySchema.nullable(),
      capIncludesDelivery: z.boolean().nullable(),
      latestDeliveryAt: TimestampSchema.nullable().optional(),
    }),
    preferences: z.array(z.string().min(1)),
    notificationPolicy: z.object({
      mode: z.enum(["ONCE", "MEANINGFUL_IMPROVEMENT"]),
      improvementThresholdMinor: z.number().int().safe().nonnegative(),
    }),
  }),
  mandateIntent: z.object({
    requested: z.boolean(),
    requireLowStock: z.boolean().nullable(),
    minimumLandedCost: MoneySchema.nullable(),
    maximumLandedCost: MoneySchema.nullable(),
    requiresConfirmation: z.literal(true),
  }),
  ambiguities: z.array(BriefAmbiguitySchema),
  provenance: ProvenanceSchema,
});
export type ShoppingBriefInterpretation = z.infer<typeof ShoppingBriefInterpretationSchema>;

export const MandateSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: StableIdSchema,
  requestId: StableIdSchema,
  requestVersion: z.number().int().positive(),
  version: z.number().int().positive(),
  status: z.enum(["ACTIVE", "REVOKED", "EXPIRED", "CONSUMED"]),
  maximumLandedCost: MoneySchema,
  minimumLandedCost: MoneySchema,
  quantity: z.literal(1),
  requireLowStock: z.boolean(),
  allowedIdentityMethods: z.array(z.enum(["EXACT_IDENTIFIER", "SEEDED_CATALOG"])).min(1),
  allowedMerchantIds: z.array(StableIdSchema).min(1).optional(),
  allowedSellerIds: z.array(StableIdSchema).min(1).optional(),
  effectiveAt: TimestampSchema,
  expiresAt: TimestampSchema,
  revokedAt: TimestampSchema.nullable(),
  consumedAt: TimestampSchema.nullable(),
});
export type Mandate = z.infer<typeof MandateSchema>;

export const DeliveryOptionSchema = z.object({
  id: StableIdSchema,
  label: z.string().min(1),
  method: z.string().min(1).default("STANDARD"),
  price: MoneySchema.nullable(),
  eligibility: CheckResultSchema.default("UNKNOWN"),
  eligibilityReason: z.string().min(1).nullable().default(null),
  thresholdBasis: z.enum([
    "ITEM_BEFORE_DISCOUNTS",
    "ITEM_AFTER_DISCOUNTS",
    "CART_BEFORE_DISCOUNTS",
    "CART_AFTER_DISCOUNTS",
  ]).default("ITEM_BEFORE_DISCOUNTS"),
  minimumSubtotal: MoneySchema.nullable().default(null),
  entitlement: z.enum(["NONE", "MEMBERSHIP", "SUBSCRIPTION"]).default("NONE"),
  entitlementStatus: CheckResultSchema.default("UNKNOWN"),
  exclusions: z.array(z.string().min(1)).default([]),
  destinationCountries: z.array(z.string().regex(/^[A-Z]{2}$/)).optional(),
  sellerIds: z.array(StableIdSchema).optional(),
  productCategories: z.array(z.string().min(1)).optional(),
  requiredCouponCodes: z.array(z.string().min(1)).default([]),
  deliveryWindow: z.object({
    earliestAt: TimestampSchema.nullable(),
    latestAt: TimestampSchema.nullable(),
  }).nullable().default(null),
  observedAt: TimestampSchema,
  expiresAt: TimestampSchema.nullable().default(null),
  provenance: ProvenanceSchema,
});
export type DeliveryOption = z.infer<typeof DeliveryOptionSchema>;

export const CouponCandidateSchema = z.object({
  code: z.string().min(1),
  appliesTo: z.enum(["ITEM", "DELIVERY"]),
  amount: MoneySchema,
  eligibility: CheckResultSchema.default("UNKNOWN"),
  eligibilityReason: z.string().min(1).nullable().default(null),
  thresholdBasis: z.enum([
    "ITEM_BEFORE_DISCOUNTS",
    "ITEM_AFTER_DISCOUNTS",
    "CART_BEFORE_DISCOUNTS",
    "CART_AFTER_DISCOUNTS",
  ]).default("ITEM_BEFORE_DISCOUNTS"),
  minimumSubtotal: MoneySchema.nullable().default(null),
  merchantIds: z.array(StableIdSchema).optional(),
  sellerIds: z.array(StableIdSchema).optional(),
  stackable: z.boolean().default(false),
  combinableWith: z.array(z.string().min(1)).optional(),
  observedAt: TimestampSchema,
  expiresAt: TimestampSchema.nullable().default(null),
  provenance: ProvenanceSchema,
});
export type CouponCandidate = z.infer<typeof CouponCandidateSchema>;

export const OfferSnapshotSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: StableIdSchema,
  listingId: StableIdSchema,
  merchantId: StableIdSchema,
  sellerId: StableIdSchema,
  title: z.string().min(1),
  listingRef: z.string().min(1),
  identifiers: z.array(z.object({ type: z.enum(["GTIN", "EAN", "UPC", "MPN", "SKU"]), value: z.string().min(1) })),
  attributes: z.object({
    brand: z.string().min(1).nullable(),
    model: z.string().min(1).nullable(),
    size: z.string().min(1).nullable(),
    condition: z.enum(["NEW", "USED", "REFURBISHED"]).nullable(),
    quantity: z.number().int().positive(),
  }),
  itemPrice: MoneySchema,
  deliveryPrice: MoneySchema,
  deliveryOptions: z.array(DeliveryOptionSchema).min(1).optional(),
  couponCandidates: z.array(CouponCandidateSchema).optional(),
  destinationCountries: z.array(z.string().regex(/^[A-Z]{2}$/)),
  observedAt: TimestampSchema,
});
export type OfferSnapshot = z.infer<typeof OfferSnapshotSchema>;

export const EvidenceItemSchema = z.object({
  key: z.string().min(1),
  result: CheckResultSchema,
  value: z.string().min(1).nullable(),
  provenance: ProvenanceSchema,
});
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const EvidenceBundleSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: StableIdSchema,
  offerId: StableIdSchema,
  seller: EvidenceItemSchema,
  stock: EvidenceItemSchema,
  condition: EvidenceItemSchema,
  destination: EvidenceItemSchema,
  coupon: EvidenceItemSchema,
  discount: EvidenceItemSchema,
  capturedAt: TimestampSchema,
});
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;

export const MatchAssessmentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: StableIdSchema,
  requestId: StableIdSchema,
  offerId: StableIdSchema,
  method: z.enum(["EXACT_IDENTIFIER", "SEEDED_CATALOG", "NORMALIZED", "ATTRIBUTE_LEVEL", "AI_ASSISTED", "UNRESOLVED"]),
  overall: CheckResultSchema,
  canonicalProductId: StableIdSchema.nullable().optional(),
  attributes: z.array(z.object({
    attribute: z.string().min(1),
    result: CheckResultSchema,
    evidence: z.string().min(1),
    provenance: ProvenanceSchema.optional(),
  })),
  stages: z.array(z.object({
    stage: z.enum(["EXACT_IDENTIFIER", "SEEDED_CATALOG", "NORMALIZED", "ATTRIBUTE_LEVEL", "AI_ASSISTED"]),
    result: CheckResultSchema,
    evidence: z.array(z.string().min(1)),
    candidateCanonicalIds: z.array(StableIdSchema),
    provenance: ProvenanceSchema,
  })).optional(),
  provenance: ProvenanceSchema,
});
export type MatchAssessment = z.infer<typeof MatchAssessmentSchema>;

export const LandedCostLineSchema = z.object({
  code: z.enum(["ITEM", "ITEM_COUPON", "DELIVERY", "DELIVERY_COUPON", "TAX", "DUTY", "HANDLING", "FX"]),
  label: z.string().min(1),
  amount: MoneySchema,
  operation: z.enum(["ADD", "SUBTRACT", "CONVERT"]),
  provenance: ProvenanceSchema,
});
export type LandedCostLine = z.infer<typeof LandedCostLineSchema>;

export const LandedCostSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: StableIdSchema,
  offerId: StableIdSchema,
  budgetCurrency: CurrencyCodeSchema,
  lines: z.array(LandedCostLineSchema).min(1),
  total: MoneySchema,
  fxRate: DecimalStringSchema.nullable(),
  fxObservedAt: TimestampSchema.nullable(),
  ruleVersion: z.string().min(1),
  provenance: ProvenanceSchema,
});
export type LandedCost = z.infer<typeof LandedCostSchema>;

export const PricingPathSchema = z.object({
  id: StableIdSchema,
  offerId: StableIdSchema,
  deliveryOptionId: StableIdSchema,
  deliveryMethod: z.string().min(1),
  couponCodes: z.array(z.string().min(1)),
  status: z.enum(["VALID", "REJECTED", "UNKNOWN"]),
  reasonCodes: z.array(z.string().min(1)),
  landedCost: LandedCostSchema.nullable(),
  deliveryLatestAt: TimestampSchema.nullable(),
  freshnessObservedAt: TimestampSchema,
  sellerTrustRank: z.number().int().nonnegative(),
  preferredMethodRank: z.number().int().nonnegative(),
  provenance: ProvenanceSchema,
});
export type PricingPath = z.infer<typeof PricingPathSchema>;

export const PricingSelectionSchema = z.object({
  selectedPathId: StableIdSchema.nullable(),
  selectedPath: PricingPathSchema.nullable(),
  alternatives: z.array(PricingPathSchema),
  tieBreaker: z.literal("TOTAL_THEN_DELIVERY_THEN_FRESHNESS_THEN_SELLER_TRUST_THEN_PREFERENCE_THEN_PATH_ID"),
});
export type PricingSelection = z.infer<typeof PricingSelectionSchema>;

export const RequirementResultSchema = z.object({
  requirement: z.string().min(1),
  result: CheckResultSchema,
  explanation: z.string().min(1),
});
export type RequirementResult = z.infer<typeof RequirementResultSchema>;

export const DecisionRecordSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: StableIdSchema,
  requestId: StableIdSchema,
  requestVersion: z.number().int().positive(),
  eventId: StableIdSchema,
  offer: OfferSnapshotSchema,
  evidence: EvidenceBundleSchema,
  match: MatchAssessmentSchema,
  landedCost: LandedCostSchema.nullable(),
  pricingSelection: PricingSelectionSchema.optional(),
  mandateAuthorization: z.object({
    mandateId: StableIdSchema,
    mandateVersion: z.number().int().positive(),
    checks: z.array(RequirementResultSchema),
  }).optional(),
  notificationAssessment: z.object({
    fingerprint: z.string().min(1),
    reason: z.enum(["FIRST_MEANINGFUL_ALERT", "ONCE_ALREADY_SENT", "NO_MEANINGFUL_IMPROVEMENT", "MEANINGFUL_IMPROVEMENT"]).optional(),
    suppressionReason: z.string().min(1).nullable(),
    improvementMinor: z.number().int().safe().nullable(),
  }).optional(),
  outcome: DecisionOutcomeSchema,
  primaryReason: ReasonCodeSchema,
  requirements: z.array(RequirementResultSchema),
  mandateId: StableIdSchema.nullable(),
  notificationSuppressed: z.boolean(),
  policyVersion: z.string().min(1),
  provenance: ProvenanceSchema,
  decidedAt: TimestampSchema,
});
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

const SimulationEventBaseSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: StableIdSchema,
  runId: StableIdSchema,
  sequence: z.number().int().nonnegative(),
  occurredAt: TimestampSchema,
});

export const SimulationEventSchema = z.discriminatedUnion("type", [
  SimulationEventBaseSchema.extend({ type: z.literal("OFFER_OBSERVED"), offer: OfferSnapshotSchema, evidence: EvidenceBundleSchema }),
  SimulationEventBaseSchema.extend({ type: z.literal("STOCK_CHANGED"), offerId: StableIdSchema, stockState: z.enum(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"]), quantityAvailable: z.number().int().nonnegative().nullable() }),
  SimulationEventBaseSchema.extend({ type: z.literal("PRICE_CHANGED"), offerId: StableIdSchema, itemPrice: MoneySchema, deliveryPrice: MoneySchema }),
  SimulationEventBaseSchema.extend({ type: z.literal("COUPON_CHANGED"), offerId: StableIdSchema, couponCode: z.string().min(1), status: z.enum(["VALID", "INVALID", "EXPIRED"]) }),
  SimulationEventBaseSchema.extend({ type: z.literal("FX_CHANGED"), baseCurrency: CurrencyCodeSchema, quoteCurrency: CurrencyCodeSchema, rate: DecimalStringSchema }),
  SimulationEventBaseSchema.extend({ type: z.literal("SELLER_CHANGED"), sellerId: StableIdSchema, status: z.enum(["VERIFIED", "UNVERIFIED", "BLOCKED"]) }),
]);
export type SimulationEvent = z.infer<typeof SimulationEventSchema>;

export const ScenarioFixtureSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: StableIdSchema,
  fixtureVersion: z.string().min(1),
  seed: z.string().min(1),
  virtualStartAt: TimestampSchema,
  request: ShoppingRequestSchema,
  events: z.array(SimulationEventSchema),
});
export type ScenarioFixture = z.infer<typeof ScenarioFixtureSchema>;

export const SimulatedOrderSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: StableIdSchema,
  idempotencyKey: StableIdSchema,
  requestId: StableIdSchema,
  requestVersion: z.number().int().positive(),
  mandateId: StableIdSchema,
  decisionId: StableIdSchema,
  offerId: StableIdSchema,
  quantity: z.literal(1),
  paid: MoneySchema,
  status: z.enum(["PLACED", "CANCELLED"]),
  createdAt: TimestampSchema,
});
export type SimulatedOrder = z.infer<typeof SimulatedOrderSchema>;
