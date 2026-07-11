import {
  EvidenceBundleSchema,
  type CheckResult,
  type EvidenceBundle,
  type EvidenceItem,
  type OfferSnapshot,
  type Provenance,
  type ShoppingRequest,
} from "@/domain/contracts";
import type { VerificationService } from "@/domain/services";

const normalized = (value: string | null): string => value?.trim().toUpperCase().replaceAll("-", "_") ?? "";

const isLowStockValue = (value: string): boolean => /^LOW[_ ]STOCK(?::\s*\d+)?$/.test(value);

const computedProvenance = (source: string, observedAt: string): Provenance => ({
  kind: "COMPUTED",
  source,
  observedAt,
  adapterVersion: "trust-core-v1",
});

const derivedItem = (
  original: EvidenceItem,
  result: CheckResult,
  source: string,
): EvidenceItem => ({
  ...original,
  result,
  provenance: computedProvenance(source, original.provenance.observedAt),
});

const stockResult = (evidence: EvidenceItem): CheckResult => {
  const value = normalized(evidence.value);
  if (value === "IN_STOCK" || isLowStockValue(value)) return evidence.result === "PASS" ? "PASS" : evidence.result;
  if (value === "OUT_OF_STOCK" || value === "UNAVAILABLE") return "FAIL";
  return evidence.result === "FAIL" ? "FAIL" : "UNKNOWN";
};

const sellerResult = (request: ShoppingRequest, evidence: EvidenceItem): CheckResult => {
  const value = normalized(evidence.value);
  if (value === "BLOCKED" || value === "UNVERIFIED") return "FAIL";
  if (value.includes("RESELLER") || value.includes("MARKETPLACE")) {
    return request.requirements.allowResellers && evidence.result === "PASS" ? "PASS" : "FAIL";
  }
  if (value === "VERIFIED" || value === "VERIFIED_MERCHANT" || value === "MERCHANT_OWNED") {
    return evidence.result === "PASS" ? "PASS" : evidence.result;
  }
  return evidence.result === "FAIL" ? "FAIL" : "UNKNOWN";
};

export class DeterministicVerificationService implements VerificationService {
  async verify(
    request: ShoppingRequest,
    offer: OfferSnapshot,
    evidence: EvidenceBundle,
  ): Promise<EvidenceBundle> {
    const observedCondition: CheckResult = offer.attributes.condition === null
      ? "UNKNOWN"
      : offer.attributes.condition === request.requirements.condition ? "PASS" : "FAIL";
    const condition: CheckResult = observedCondition === "PASS" ? evidence.condition.result : observedCondition;
    const observedDestination: CheckResult = offer.destinationCountries.includes(request.requirements.destinationCountry)
      ? "PASS"
      : "FAIL";
    const destination: CheckResult = observedDestination === "PASS" ? evidence.destination.result : observedDestination;
    const coupon: CheckResult = normalized(evidence.coupon.value) === "NONE"
      ? "PASS"
      : evidence.coupon.result;
    const discount: CheckResult = normalized(evidence.discount.value) === "NOT_REQUIRED"
      ? "PASS"
      : evidence.discount.result;

    return EvidenceBundleSchema.parse({
      ...evidence,
      seller: derivedItem(evidence.seller, sellerResult(request, evidence.seller), "verify:seller"),
      stock: derivedItem(evidence.stock, stockResult(evidence.stock), "verify:stock"),
      condition: derivedItem(evidence.condition, condition, "verify:condition"),
      destination: derivedItem(evidence.destination, destination, "verify:destination"),
      coupon: derivedItem(evidence.coupon, coupon, "verify:coupon"),
      discount: derivedItem(evidence.discount, discount, "verify:discount"),
    });
  }
}

export const evidenceAgeMs = (evidence: EvidenceBundle, at: string): number => {
  const capturedAt = Date.parse(evidence.capturedAt);
  const evaluatedAt = Date.parse(at);
  if (!Number.isFinite(capturedAt) || !Number.isFinite(evaluatedAt)) return Number.POSITIVE_INFINITY;
  return evaluatedAt - capturedAt;
};

export const isEvidenceFresh = (
  evidence: EvidenceBundle,
  at: string,
  maximumAgeMs: number,
): boolean => {
  const evaluatedAt = Date.parse(at);
  if (!Number.isFinite(evaluatedAt)) return false;
  const bundleAge = evidenceAgeMs(evidence, at);
  if (bundleAge < 0 || bundleAge > maximumAgeMs) return false;

  return [
    evidence.seller,
    evidence.stock,
    evidence.condition,
    evidence.destination,
  ].every((item) => {
    const observedAt = Date.parse(item.provenance.observedAt);
    if (!Number.isFinite(observedAt)) return false;
    const age = evaluatedAt - observedAt;
    return age >= 0 && age <= maximumAgeMs;
  });
};
