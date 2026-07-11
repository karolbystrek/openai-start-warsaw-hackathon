import {
  DecisionRecordSchema,
  type CheckResult,
  type DecisionOutcome,
  type DecisionRecord,
  type EvidenceBundle,
  type LandedCost,
  type Mandate,
  type MatchAssessment,
  type OfferSnapshot,
  type ReasonCode,
  type RequirementResult,
  type ShoppingRequest,
} from "@/domain/contracts";
import { assessNotification } from "@/domain/notifications";
import { normalizeSize } from "@/domain/matching/normalize";
import type { PolicyEvaluator } from "@/domain/services";
import { isEvidenceFresh } from "@/domain/verification";

export interface MandateCheck {
  code: string;
  result: CheckResult;
  explanation: string;
}

export interface PurchaseAuthorization {
  authorized: boolean;
  checks: readonly MandateCheck[];
}

export interface PurchaseAuthorizationInput {
  request: ShoppingRequest;
  mandate: Mandate;
  offer: OfferSnapshot;
  evidence: EvidenceBundle;
  match: MatchAssessment;
  landedCost: LandedCost;
  evaluatedAt: string;
  evidenceFresh: boolean;
  maximumEvidenceAgeMs?: number;
}

const mandateCheck = (code: string, passed: boolean, explanation: string): MandateCheck => ({
  code,
  result: passed ? "PASS" : "FAIL",
  explanation,
});

const sameMoneyCurrency = (left: { currency: string }, right: { currency: string }): boolean => left.currency === right.currency;

const stockReportsLowStock = (value: string | null): boolean => {
  const normalized = value?.trim().toUpperCase().replaceAll("-", "_") ?? "";
  return /^LOW[_ ]STOCK(?::\s*\d+)?$/.test(normalized);
};

const isTimestampFresh = (observedAt: string | null, evaluatedAt: string, maximumAgeMs: number): boolean => {
  if (observedAt === null) return false;
  const observed = Date.parse(observedAt);
  const evaluated = Date.parse(evaluatedAt);
  if (!Number.isFinite(observed) || !Number.isFinite(evaluated)) return false;
  const age = evaluated - observed;
  return age >= 0 && age <= maximumAgeMs;
};

const costLinesTotal = (cost: LandedCost): number => cost.lines.reduce((total, line) => {
  if (line.operation === "SUBTRACT") return total - line.amount.minorUnits;
  return total + line.amount.minorUnits;
}, 0);

const landedCostIntegrityPasses = (request: ShoppingRequest, offer: OfferSnapshot, landedCost: LandedCost): boolean => (
  landedCost.offerId === offer.id
  && landedCost.total.currency === landedCost.budgetCurrency
  && landedCost.budgetCurrency === request.requirements.maximumLandedCost.currency
  && landedCost.lines.every((line) => line.amount.currency === landedCost.budgetCurrency)
  && landedCost.lines.some((line) => line.code === "ITEM" || line.code === "FX")
  && landedCost.lines.some((line) => line.code === "DELIVERY")
  && (!landedCost.lines.some((line) => line.code === "FX" || line.operation === "CONVERT")
    || (landedCost.fxRate !== null && landedCost.fxObservedAt !== null))
  && costLinesTotal(landedCost) === landedCost.total.minorUnits
);

export const authorizePurchase = (input: PurchaseAuthorizationInput): PurchaseAuthorization => {
  const { request, mandate, offer, evidence, match, landedCost, evaluatedAt } = input;
  const now = Date.parse(evaluatedAt);
  const effectiveAt = Date.parse(mandate.effectiveAt);
  const expiresAt = Date.parse(mandate.expiresAt);
  const couponApplied = landedCost.lines.some((line) => line.code === "ITEM_COUPON" || line.code === "DELIVERY_COUPON");
  const criticalEvidence = [
    evidence.seller,
    evidence.stock,
    evidence.condition,
    evidence.destination,
    ...(couponApplied ? [evidence.coupon] : []),
  ];
  const criticalEvidenceFresh = criticalEvidence.every((item) => isTimestampFresh(
    item.provenance.observedAt,
    evaluatedAt,
    input.maximumEvidenceAgeMs ?? 5 * 60 * 1000,
  ));
  const pricingInputsFresh = landedCost.lines.every((line) => isTimestampFresh(
    line.provenance.observedAt,
    evaluatedAt,
    input.maximumEvidenceAgeMs ?? 5 * 60 * 1000,
  )) && (landedCost.fxRate === null || isTimestampFresh(
    landedCost.fxObservedAt,
    evaluatedAt,
    input.maximumEvidenceAgeMs ?? 5 * 60 * 1000,
  ));
  const recordIntegrity = evidence.offerId === offer.id
    && match.requestId === request.id
    && match.offerId === offer.id
    && landedCostIntegrityPasses(request, offer, landedCost);
  const checks: MandateCheck[] = [
    mandateCheck("status", mandate.status === "ACTIVE", `Mandate status is ${mandate.status}.`),
    mandateCheck("request", mandate.requestId === request.id, "Mandate belongs to the active request."),
    mandateCheck("request-version", mandate.requestVersion === request.version, "Mandate covers the active request version."),
    mandateCheck("effective-time", Number.isFinite(now) && now >= effectiveAt && now <= expiresAt, "Mandate is effective and unexpired."),
    mandateCheck("not-revoked", mandate.revokedAt === null, "Mandate has not been revoked."),
    mandateCheck("not-consumed", mandate.consumedAt === null, "Mandate has not been consumed."),
    mandateCheck("quantity", offer.attributes.quantity === mandate.quantity && request.requirements.quantity === mandate.quantity, "Quantity is within mandate scope."),
    mandateCheck("merchant-scope", !mandate.allowedMerchantIds || mandate.allowedMerchantIds.includes(offer.merchantId), "Merchant is within mandate scope."),
    mandateCheck("seller-scope", !mandate.allowedSellerIds || mandate.allowedSellerIds.includes(offer.sellerId), "Seller is within mandate scope."),
    mandateCheck("identity-method", match.overall === "PASS" && mandate.allowedIdentityMethods.includes(match.method as "EXACT_IDENTIFIER" | "SEEDED_CATALOG"), `Identity method ${match.method} is permitted.`),
    mandateCheck("record-integrity", recordIntegrity, "Request, offer, evidence, match, and landed-cost identifiers and totals are consistent."),
    mandateCheck("evidence-freshness", input.evidenceFresh && criticalEvidenceFresh, "Purchase-critical evidence is fresh."),
    mandateCheck("pricing-freshness", pricingInputsFresh, "Selected delivery, coupon, charge, and FX inputs are fresh."),
    mandateCheck("critical-evidence", criticalEvidence.every((item) => item.result === "PASS"), "Every purchase-critical evidence check passed."),
    mandateCheck("request-cap-currency", sameMoneyCurrency(landedCost.total, request.requirements.maximumLandedCost), "Landed cost uses the request budget currency."),
    mandateCheck("mandate-currency", sameMoneyCurrency(landedCost.total, mandate.maximumLandedCost) && sameMoneyCurrency(landedCost.total, mandate.minimumLandedCost), "Mandate bounds use the landed-cost currency."),
    mandateCheck("mandate-not-above-request", mandate.maximumLandedCost.currency === request.requirements.maximumLandedCost.currency && mandate.maximumLandedCost.minorUnits <= request.requirements.maximumLandedCost.minorUnits, "Mandate maximum does not exceed the request cap."),
    mandateCheck("price-range", landedCost.total.minorUnits >= mandate.minimumLandedCost.minorUnits && landedCost.total.minorUnits <= mandate.maximumLandedCost.minorUnits, "Landed cost is inside the mandate range."),
    mandateCheck("low-stock-condition", !mandate.requireLowStock || stockReportsLowStock(evidence.stock.value), mandate.requireLowStock ? "Fresh structured evidence reports low stock." : "Low stock is not required."),
  ];
  return { authorized: checks.every((check) => check.result === "PASS"), checks };
};

const requirement = (name: string, result: CheckResult, explanation: string): RequirementResult => ({
  requirement: name,
  result,
  explanation,
});

const compareAttribute = (
  actual: string | null,
  expected: string,
  label: string,
  normalize: (value: string) => string = (value) => value.trim().toUpperCase(),
): RequirementResult => {
  if (actual === null) return requirement(label, "UNKNOWN", `${label} is missing from the offer.`);
  const passed = normalize(actual) === normalize(expected);
  return requirement(label, passed ? "PASS" : "FAIL", passed ? `${label} matches ${expected}.` : `${label} ${actual} does not match ${expected}.`);
};

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
};

const resultForEvidence = (name: string, evidence: EvidenceBundle[keyof Pick<EvidenceBundle, "seller" | "stock" | "condition" | "destination" | "coupon" | "discount">]): RequirementResult => requirement(
  name,
  evidence.result,
  `${name} evidence: ${evidence.value ?? "missing"}.`,
);

export interface DeterministicPolicyOptions {
  policyVersion?: string;
  maximumEvidenceAgeMs?: number;
}

export class DeterministicPolicyEvaluator implements PolicyEvaluator {
  private readonly policyVersion: string;
  private readonly maximumEvidenceAgeMs: number;

  constructor(options: DeterministicPolicyOptions = {}) {
    this.policyVersion = options.policyVersion ?? "trust-policy-v1";
    this.maximumEvidenceAgeMs = options.maximumEvidenceAgeMs ?? 5 * 60 * 1000;
  }

  async evaluate(input: Parameters<PolicyEvaluator["evaluate"]>[0]): Promise<DecisionRecord> {
    const { request, event, offer, evidence, match, landedCost } = input;
    const fresh = isEvidenceFresh(evidence, event.occurredAt, this.maximumEvidenceAgeMs);
    const pricingInputsFresh = landedCost !== null
      && landedCost.lines.every((line) => isTimestampFresh(line.provenance.observedAt, event.occurredAt, this.maximumEvidenceAgeMs))
      && (landedCost.fxRate === null || isTimestampFresh(landedCost.fxObservedAt, event.occurredAt, this.maximumEvidenceAgeMs));
    const cap = request.requirements.maximumLandedCost;
    const eventOfferId = "offerId" in event
      ? event.offerId
      : event.type === "OFFER_OBSERVED"
        ? event.offer.id
        : null;
    const eventIntegrityPasses = event.type === "FX_CHANGED"
      ? true
      : event.type === "SELLER_CHANGED"
        ? event.sellerId === offer.sellerId
        : eventOfferId === offer.id;
    const embeddedOfferPasses = event.type !== "OFFER_OBSERVED"
      || JSON.stringify(event.offer) === JSON.stringify(offer);
    const embeddedEvidencePasses = event.type !== "OFFER_OBSERVED" || (
      event.evidence.id === evidence.id
      && event.evidence.offerId === evidence.offerId
      && event.evidence.capturedAt === evidence.capturedAt
      && (["seller", "stock", "condition", "destination", "coupon", "discount"] as const).every((key) => (
        event.evidence[key].key === evidence[key].key
        && event.evidence[key].value === evidence[key].value
        && event.evidence[key].provenance.observedAt === evidence[key].provenance.observedAt
      ))
    );
    const pricingSelectionPasses = !input.pricingSelection
      || (input.pricingSelection.selectedPath?.landedCost
        ? landedCost?.id === input.pricingSelection.selectedPath.landedCost.id
        : landedCost === null);
    const recordIntegrityPasses = eventIntegrityPasses
      && embeddedOfferPasses
      && embeddedEvidencePasses
      && evidence.offerId === offer.id
      && match.requestId === request.id
      && match.offerId === offer.id
      && (landedCost === null || landedCost.offerId === offer.id)
      && pricingSelectionPasses;
    const costIntegrityPasses = landedCost !== null && landedCostIntegrityPasses(request, offer, landedCost);
    const requirements: RequirementResult[] = [
      requirement("request-active", request.lifecycle === "ACTIVE" ? "PASS" : "FAIL", `Request lifecycle is ${request.lifecycle}.`),
      requirement("identity", match.overall, `Product identity assessed by ${match.method}.`),
      compareAttribute(offer.attributes.size, request.requirements.size, "size", normalizeSize),
      compareAttribute(offer.attributes.condition, request.requirements.condition, "condition"),
      requirement("quantity", offer.attributes.quantity === request.requirements.quantity ? "PASS" : "FAIL", `Offer quantity is ${offer.attributes.quantity}; required quantity is ${request.requirements.quantity}.`),
      requirement("record-integrity", recordIntegrityPasses ? "PASS" : "FAIL", recordIntegrityPasses ? "Event, request, offer, evidence, match, and landed-cost identifiers are consistent." : "Cross-record identifiers are inconsistent."),
      resultForEvidence("seller", evidence.seller),
      resultForEvidence("stock", evidence.stock),
      resultForEvidence("condition-evidence", evidence.condition),
      resultForEvidence("destination", evidence.destination),
      resultForEvidence("coupon", evidence.coupon),
      resultForEvidence("discount", evidence.discount),
      requirement("evidence-freshness", fresh ? "PASS" : "FAIL", fresh ? "Critical evidence is fresh." : "Critical evidence is stale or from the future."),
      requirement("pricing-input-freshness", landedCost === null ? "UNKNOWN" : pricingInputsFresh ? "PASS" : "FAIL", landedCost === null ? "Pricing input freshness is unresolved because no path was selected." : pricingInputsFresh ? "Pricing inputs are fresh." : "A landed-cost line or FX snapshot is stale, missing, or from the future."),
      requirement("landed-cost-integrity", landedCost === null ? "UNKNOWN" : costIntegrityPasses ? "PASS" : "FAIL", landedCost === null ? "Landed-cost integrity is unresolved because no path was selected." : costIntegrityPasses ? "Landed-cost lines reconcile in the budget currency." : "Landed-cost lines or currencies do not reconcile."),
      requirement("pricing-path", landedCost ? "PASS" : "UNKNOWN", landedCost ? "A deterministic valid pricing path was selected." : "No deterministic valid pricing path could be selected."),
      requirement("landed-cost-cap", landedCost === null ? "UNKNOWN" : costIntegrityPasses && landedCost.total.minorUnits <= cap.minorUnits ? "PASS" : "FAIL", landedCost ? `Landed cost is ${landedCost.total.minorUnits} minor units; cap is ${cap.minorUnits}.` : `Landed cost is unknown; cap is ${cap.minorUnits}.`),
    ];

    let outcome: DecisionOutcome;
    let primaryReason: ReasonCode;
    let notificationSuppressed = false;
    let authorization: PurchaseAuthorization | null = null;
    let notificationAssessment: ReturnType<typeof assessNotification> | null = null;

    const couponApplied = landedCost?.lines.some((line) => line.code === "ITEM_COUPON" || line.code === "DELIVERY_COUPON") ?? false;
    const hardMismatch = match.overall === "FAIL"
      || requirements.some((item) => ["size", "condition", "condition-evidence", "quantity", "seller", "destination"].includes(item.requirement) && item.result === "FAIL")
      || (couponApplied && evidence.coupon.result === "FAIL");
    const unknownCritical = request.unresolvedAmbiguities.length > 0
      || match.overall === "UNKNOWN"
      || requirements.some((item) => ["size", "condition", "condition-evidence", "seller", "stock", "destination"].includes(item.requirement) && item.result === "UNKNOWN")
      || (couponApplied && evidence.coupon.result === "UNKNOWN");

    if (!recordIntegrityPasses) {
      outcome = "IGNORE";
      primaryReason = "MALFORMED_EVIDENCE";
    } else if (request.lifecycle !== "ACTIVE") {
      outcome = "IGNORE";
      primaryReason = "MALFORMED_EVIDENCE";
    } else if (landedCost !== null && !costIntegrityPasses) {
      outcome = "IGNORE";
      primaryReason = "MALFORMED_EVIDENCE";
    } else if (!fresh || (landedCost !== null && !pricingInputsFresh)) {
      outcome = "ESCALATE";
      primaryReason = "STALE_CRITICAL_EVIDENCE";
    } else if (hardMismatch) {
      outcome = "REJECT";
      primaryReason = "HARD_REQUIREMENT_MISMATCH";
    } else if (evidence.stock.result === "FAIL") {
      outcome = "REJECT";
      primaryReason = "UNAVAILABLE_STOCK";
    } else if (unknownCritical) {
      outcome = "ESCALATE";
      primaryReason = "UNKNOWN_CRITICAL_FACT";
    } else if (landedCost === null) {
      const pricingIsUnknown = !input.pricingSelection
        || input.pricingSelection.alternatives.some((path) => path.status === "UNKNOWN");
      outcome = pricingIsUnknown ? "ESCALATE" : "REJECT";
      primaryReason = pricingIsUnknown ? "PRICING_INPUT_UNKNOWN" : "HARD_REQUIREMENT_MISMATCH";
    } else if (landedCost.total.minorUnits > cap.minorUnits
      && input.pricingSelection?.alternatives.some((path) => path.status === "UNKNOWN")) {
      outcome = "ESCALATE";
      primaryReason = "PRICING_INPUT_UNKNOWN";
    } else if (landedCost.total.minorUnits > cap.minorUnits) {
      outcome = "REJECT";
      primaryReason = "LANDED_COST_ABOVE_CAP";
    } else {
      if (input.mandate) {
        authorization = authorizePurchase({
          request,
          mandate: input.mandate,
          offer,
          evidence,
          match,
          landedCost,
          evaluatedAt: event.occurredAt,
          evidenceFresh: fresh,
          maximumEvidenceAgeMs: this.maximumEvidenceAgeMs,
        });
        requirements.push(...authorization.checks.map((check) => requirement(`mandate:${check.code}`, check.result, check.explanation)));
      }
      if (authorization?.authorized) {
        outcome = "BUY_SIMULATED";
        primaryReason = "VALID_MANDATE_PURCHASE";
      } else {
        notificationAssessment = assessNotification(
          request,
          offer,
          landedCost.total.minorUnits,
          input.previousDecisions ?? [],
          match.canonicalProductId,
        );
        notificationSuppressed = notificationAssessment.suppressed;
        outcome = notificationAssessment.suppressed ? "IGNORE" : "ALERT";
        primaryReason = notificationAssessment.suppressed ? "DUPLICATE_SUPPRESSED" : "VALID_DEAL_ALERT";
      }
    }

    return deepFreeze(DecisionRecordSchema.parse({
      schemaVersion: 1,
      id: `decision-${event.id}-${this.policyVersion}`,
      requestId: request.id,
      requestVersion: request.version,
      eventId: event.id,
      offer,
      evidence,
      match,
      landedCost,
      pricingSelection: input.pricingSelection,
      outcome,
      primaryReason,
      requirements,
      mandateAuthorization: input.mandate ? {
        mandateId: input.mandate.id,
        mandateVersion: input.mandate.version,
        checks: authorization
          ? authorization.checks.map((check) => requirement(`mandate:${check.code}`, check.result, check.explanation))
          : [requirement("mandate:not-evaluated", "UNKNOWN", "The offer failed before purchase authorization was evaluated.")],
      } : undefined,
      notificationAssessment: notificationAssessment ? {
        fingerprint: notificationAssessment.fingerprint,
        reason: notificationAssessment.reason,
        suppressionReason: notificationAssessment.suppressed ? notificationAssessment.reason : null,
        improvementMinor: notificationAssessment.improvementMinor,
      } : undefined,
      mandateId: input.mandate?.id ?? null,
      notificationSuppressed,
      policyVersion: this.policyVersion,
      provenance: {
        kind: "COMPUTED",
        source: `policy:${this.policyVersion}`,
        observedAt: event.occurredAt,
        adapterVersion: "trust-core-v1",
      },
      decidedAt: event.occurredAt,
    }));
  }
}
