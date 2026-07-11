import type { DecisionRecord, OfferSnapshot, ShoppingRequest } from "@/domain/contracts";

export interface NotificationAssessment {
  fingerprint: string;
  suppressed: boolean;
  reason: "FIRST_MEANINGFUL_ALERT" | "ONCE_ALREADY_SENT" | "NO_MEANINGFUL_IMPROVEMENT" | "MEANINGFUL_IMPROVEMENT";
  improvementMinor: number | null;
}

const comparableDecisions = (decisions: readonly DecisionRecord[]): readonly DecisionRecord[] => decisions.filter(
  (decision) => decision.outcome === "ALERT" || decision.outcome === "BUY_SIMULATED",
);

export const notificationFingerprint = (request: ShoppingRequest, offer: OfferSnapshot): string => {
  const identifiers = offer.identifiers
    .map((identifier) => `${identifier.type}:${identifier.value.trim().toUpperCase()}`)
    .sort()
    .join(",");
  const identity = identifiers || [
    offer.attributes.brand,
    offer.attributes.model,
    offer.attributes.size,
    offer.attributes.condition,
  ].map((value) => value?.trim().toUpperCase() ?? "UNKNOWN").join(":");
  return `${request.id}:v${request.version}:${identity}`;
};

export const assessNotification = (
  request: ShoppingRequest,
  offer: OfferSnapshot,
  landedCostMinor: number,
  previousDecisions: readonly DecisionRecord[],
): NotificationAssessment => {
  const fingerprint = notificationFingerprint(request, offer);
  const previous = comparableDecisions(previousDecisions).filter(
    (decision) => notificationFingerprint(request, decision.offer) === fingerprint,
  );
  if (previous.length === 0) {
    return { fingerprint, suppressed: false, reason: "FIRST_MEANINGFUL_ALERT", improvementMinor: null };
  }
  if (request.notificationPolicy.mode === "ONCE") {
    return { fingerprint, suppressed: true, reason: "ONCE_ALREADY_SENT", improvementMinor: null };
  }

  const bestPrevious = Math.min(...previous.map((decision) => decision.landedCost.total.minorUnits));
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
