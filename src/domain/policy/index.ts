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
}

const mandateCheck = (code: string, passed: boolean, explanation: string): MandateCheck => ({
  code,
  result: passed ? "PASS" : "FAIL",
  explanation,
});

const sameMoneyCurrency = (left: { currency: string }, right: { currency: string }): boolean => left.currency === right.currency;

export const authorizePurchase = (input: PurchaseAuthorizationInput): PurchaseAuthorization => {
  const { request, mandate, offer, evidence, match, landedCost, evaluatedAt } = input;
  const now = Date.parse(evaluatedAt);
  const effectiveAt = Date.parse(mandate.effectiveAt);
  const expiresAt = Date.parse(mandate.expiresAt);
  const stock = evidence.stock.value?.trim().toUpperCase().replaceAll("-", "_") ?? "";
  const criticalEvidence = [evidence.seller, evidence.stock, evidence.condition, evidence.destination];
  const checks: MandateCheck[] = [
    mandateCheck("status", mandate.status === "ACTIVE", `Mandate status is ${mandate.status}.`),
    mandateCheck("request", mandate.requestId === request.id, "Mandate belongs to the active request."),
    mandateCheck("request-version", mandate.requestVersion === request.version, "Mandate covers the active request version."),
    mandateCheck("effective-time", Number.isFinite(now) && now >= effectiveAt && now <= expiresAt, "Mandate is effective and unexpired."),
    mandateCheck("not-revoked", mandate.revokedAt === null, "Mandate has not been revoked."),
    mandateCheck("not-consumed", mandate.consumedAt === null, "Mandate has not been consumed."),
    mandateCheck("quantity", offer.attributes.quantity === mandate.quantity && request.requirements.quantity === mandate.quantity, "Quantity is within mandate scope."),
    mandateCheck("identity-method", match.overall === "PASS" && mandate.allowedIdentityMethods.includes(match.method as "EXACT_IDENTIFIER" | "SEEDED_CATALOG"), `Identity method ${match.method} is permitted.`),
    mandateCheck("evidence-freshness", input.evidenceFresh, "Purchase-critical evidence is fresh."),
    mandateCheck("critical-evidence", criticalEvidence.every((item) => item.result === "PASS"), "Every purchase-critical evidence check passed."),
    mandateCheck("request-cap-currency", sameMoneyCurrency(landedCost.total, request.requirements.maximumLandedCost), "Landed cost uses the request budget currency."),
    mandateCheck("mandate-currency", sameMoneyCurrency(landedCost.total, mandate.maximumLandedCost) && sameMoneyCurrency(landedCost.total, mandate.minimumLandedCost), "Mandate bounds use the landed-cost currency."),
    mandateCheck("mandate-not-above-request", mandate.maximumLandedCost.currency === request.requirements.maximumLandedCost.currency && mandate.maximumLandedCost.minorUnits <= request.requirements.maximumLandedCost.minorUnits, "Mandate maximum does not exceed the request cap."),
    mandateCheck("price-range", landedCost.total.minorUnits >= mandate.minimumLandedCost.minorUnits && landedCost.total.minorUnits <= mandate.maximumLandedCost.minorUnits, "Landed cost is inside the mandate range."),
    mandateCheck("low-stock-condition", !mandate.requireLowStock || stock === "LOW_STOCK", mandate.requireLowStock ? "Fresh structured evidence reports low stock." : "Low stock is not required."),
  ];
  return { authorized: checks.every((check) => check.result === "PASS"), checks };
};

const requirement = (name: string, result: CheckResult, explanation: string): RequirementResult => ({
  requirement: name,
  result,
  explanation,
});

const compareAttribute = (actual: string | null, expected: string, label: string): RequirementResult => {
  if (actual === null) return requirement(label, "UNKNOWN", `${label} is missing from the offer.`);
  const passed = actual.trim().toUpperCase() === expected.trim().toUpperCase();
  return requirement(label, passed ? "PASS" : "FAIL", passed ? `${label} matches ${expected}.` : `${label} ${actual} does not match ${expected}.`);
};

const costLinesTotal = (cost: LandedCost): number => cost.lines.reduce((total, line) => {
  if (line.operation === "SUBTRACT") return total - line.amount.minorUnits;
  return total + line.amount.minorUnits;
}, 0);

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
    const cap = request.requirements.maximumLandedCost;
    const costIntegrityPasses = landedCost.total.currency === landedCost.budgetCurrency
      && landedCost.budgetCurrency === cap.currency
      && costLinesTotal(landedCost) === landedCost.total.minorUnits;
    const requirements: RequirementResult[] = [
      requirement("request-active", request.lifecycle === "ACTIVE" ? "PASS" : "FAIL", `Request lifecycle is ${request.lifecycle}.`),
      requirement("identity", match.overall, `Product identity assessed by ${match.method}.`),
      compareAttribute(offer.attributes.size, request.requirements.size, "size"),
      compareAttribute(offer.attributes.condition, request.requirements.condition, "condition"),
      requirement("quantity", offer.attributes.quantity === request.requirements.quantity ? "PASS" : "FAIL", `Offer quantity is ${offer.attributes.quantity}; required quantity is ${request.requirements.quantity}.`),
      resultForEvidence("seller", evidence.seller),
      resultForEvidence("stock", evidence.stock),
      resultForEvidence("condition-evidence", evidence.condition),
      resultForEvidence("destination", evidence.destination),
      resultForEvidence("coupon", evidence.coupon),
      resultForEvidence("discount", evidence.discount),
      requirement("evidence-freshness", fresh ? "PASS" : "FAIL", fresh ? "Critical evidence is fresh." : "Critical evidence is stale or from the future."),
      requirement("landed-cost-integrity", costIntegrityPasses ? "PASS" : "FAIL", costIntegrityPasses ? "Landed-cost lines reconcile in the budget currency." : "Landed-cost lines or currencies do not reconcile."),
      requirement("landed-cost-cap", costIntegrityPasses && landedCost.total.minorUnits <= cap.minorUnits ? "PASS" : "FAIL", `Landed cost is ${landedCost.total.minorUnits} minor units; cap is ${cap.minorUnits}.`),
    ];

    let outcome: DecisionOutcome;
    let primaryReason: ReasonCode;
    let notificationSuppressed = false;
    let authorization: PurchaseAuthorization | null = null;

    const hardMismatch = match.overall === "FAIL"
      || requirements.some((item) => ["size", "condition", "condition-evidence", "quantity", "seller", "destination"].includes(item.requirement) && item.result === "FAIL");
    const unknownCritical = request.unresolvedAmbiguities.length > 0
      || match.overall === "UNKNOWN"
      || requirements.some((item) => ["size", "condition", "condition-evidence", "seller", "stock", "destination"].includes(item.requirement) && item.result === "UNKNOWN");

    if (request.lifecycle !== "ACTIVE") {
      outcome = "IGNORE";
      primaryReason = "MALFORMED_EVIDENCE";
    } else if (!costIntegrityPasses) {
      outcome = "IGNORE";
      primaryReason = "MALFORMED_EVIDENCE";
    } else if (!fresh) {
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
        });
        requirements.push(...authorization.checks.map((check) => requirement(`mandate:${check.code}`, check.result, check.explanation)));
      }
      if (authorization?.authorized) {
        outcome = "BUY_SIMULATED";
        primaryReason = "VALID_MANDATE_PURCHASE";
      } else {
        const notification = assessNotification(request, offer, landedCost.total.minorUnits, input.previousDecisions ?? []);
        notificationSuppressed = notification.suppressed;
        outcome = notification.suppressed ? "IGNORE" : "ALERT";
        primaryReason = notification.suppressed ? "DUPLICATE_SUPPRESSED" : "VALID_DEAL_ALERT";
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
      outcome,
      primaryReason,
      requirements,
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
