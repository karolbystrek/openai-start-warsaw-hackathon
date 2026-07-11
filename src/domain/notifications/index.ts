import type { DecisionRecord, OfferSnapshot, ShoppingRequest } from "@/domain/contracts";

export interface NotificationAssessment {
  fingerprint: string;
  suppressed: boolean;
  reason: "FIRST_MEANINGFUL_ALERT" | "ONCE_ALREADY_SENT" | "NO_MEANINGFUL_IMPROVEMENT" | "MEANINGFUL_IMPROVEMENT";
  improvementMinor: number | null;
}

const comparableDecisions = (decisions: readonly DecisionRecord[]): readonly DecisionRecord[] => decisions.filter(
  (decision) => (decision.outcome === "ALERT" || decision.outcome === "BUY_SIMULATED") && decision.landedCost !== null,
);

export const notificationFingerprint = (
  request: ShoppingRequest,
  offer: OfferSnapshot,
  canonicalProductId?: string | null,
): string => {
  // The request describes the canonical product being monitored. Merchant-owned
  // listing/SKU identifiers are intentionally excluded so the same variant from
  // two merchants cannot bypass suppression.
  const identifiers = request.product.identifiers
    .filter((identifier) => identifier.type !== "SKU")
    .map((identifier) => `${identifier.type}:${identifier.value.trim().toUpperCase()}`)
    .sort()
    .join(",");
  const identity = canonicalProductId?.trim().toUpperCase() || identifiers || [
    request.product.brand,
    request.product.model,
    request.product.category,
  ].map((value) => value.trim().toUpperCase().replace(/\s+/g, " ")).join(":");
  const variant = [
    request.requirements.size,
    request.requirements.condition,
    String(request.requirements.quantity),
  ].map((value) => value?.trim().toUpperCase().replace(/\s+/g, " ") ?? "UNKNOWN").join(":");
  return `${request.id}:v${request.version}:${identity}:${variant}`;
};

export const assessNotification = (
  request: ShoppingRequest,
  offer: OfferSnapshot,
  landedCostMinor: number,
  previousDecisions: readonly DecisionRecord[],
  canonicalProductId?: string | null,
): NotificationAssessment => {
  const fingerprint = notificationFingerprint(request, offer, canonicalProductId);
  const fallbackFingerprint = notificationFingerprint(request, offer);
  const previous = comparableDecisions(previousDecisions).filter(
    (decision) => notificationFingerprint(request, decision.offer, decision.match.canonicalProductId) === fingerprint
      || notificationFingerprint(request, decision.offer) === fallbackFingerprint,
  );
  if (previous.length === 0) {
    return { fingerprint, suppressed: false, reason: "FIRST_MEANINGFUL_ALERT", improvementMinor: null };
  }
  if (request.notificationPolicy.mode === "ONCE") {
    return { fingerprint, suppressed: true, reason: "ONCE_ALREADY_SENT", improvementMinor: null };
  }

  const bestPrevious = Math.min(...previous.map((decision) => decision.landedCost!.total.minorUnits));
  const improvementMinor = bestPrevious - landedCostMinor;
  const meaningful = improvementMinor >= request.notificationPolicy.improvementThresholdMinor
    && improvementMinor > 0;
  return {
    fingerprint,
    suppressed: !meaningful,
    reason: meaningful ? "MEANINGFUL_IMPROVEMENT" : "NO_MEANINGFUL_IMPROVEMENT",
    improvementMinor,
  };
};
