import type { DecisionOutcome, DecisionRecord } from "@/domain/contracts";

export interface EvaluationExpectation {
  eventId: string;
  offerIsValidDeal: boolean;
  expectedOutcome: DecisionOutcome;
  expectedLandedCostMinor?: number;
}

export interface EvaluationMetrics {
  evaluated: number;
  strikeCount: number;
  validStrikeCount: number;
  strikePrecision: number | null;
  purchaseCount: number;
  invalidPurchaseCount: number;
  falseBuyRate: number | null;
  validDealCount: number;
  missedDealCount: number;
  dealRecall: number | null;
  escalationCount: number;
  unnecessaryEscalationCount: number;
  unnecessaryEscalationRate: number | null;
  duplicateAlertCount: number;
  duplicateAlertRate: number | null;
  checkedCostCount: number;
  exactCostCount: number;
  costCalculationExactness: number | null;
  completeExplanationCount: number;
  explanationCompleteness: number | null;
  failures: readonly EvaluationFailure[];
}

export interface EvaluationFailure {
  eventId: string;
  kind: "MISSING_DECISION" | "DUPLICATE_DECISION" | "UNEXPECTED_DECISION" | "OUTCOME_MISMATCH" | "FALSE_STRIKE" | "FALSE_BUY" | "MISSED_DEAL" | "UNNECESSARY_ESCALATION" | "DUPLICATE_ALERT" | "MISSING_EXPECTED_COST" | "COST_MISMATCH" | "INCOMPLETE_EXPLANATION";
  detail: string;
}

const rate = (numerator: number, denominator: number): number | null => denominator === 0 ? null : numerator / denominator;
const actionable = (outcome: DecisionOutcome): boolean => outcome === "ALERT" || outcome === "BUY_SIMULATED";

const explanationComplete = (decision: DecisionRecord): boolean => decision.requirements.length > 0
  && decision.requirements.every((item) => item.explanation.trim().length > 0)
  && (decision.landedCost
    ? decision.landedCost.lines.length > 0
      && decision.landedCost.lines.every((line) => line.provenance.source.trim().length > 0)
    : Boolean(decision.pricingSelection?.alternatives.some((path) => path.reasonCodes.length > 0)))
  && decision.primaryReason.length > 0;

export const calculateEvaluationMetrics = (
  decisions: readonly DecisionRecord[],
  expectations: readonly EvaluationExpectation[],
): EvaluationMetrics => {
  const failures: EvaluationFailure[] = [];
  const expectedEventIds = new Set(expectations.map((expectation) => expectation.eventId));
  const decisionsByEvent = new Map<string, DecisionRecord[]>();
  for (const decision of decisions) {
    const existing = decisionsByEvent.get(decision.eventId) ?? [];
    existing.push(decision);
    decisionsByEvent.set(decision.eventId, existing);
    if (!expectedEventIds.has(decision.eventId)) {
      failures.push({ eventId: decision.eventId, kind: "UNEXPECTED_DECISION", detail: "Runtime emitted a decision for an event absent from ground truth." });
    }
  }
  let strikeCount = 0;
  let validStrikeCount = 0;
  let purchaseCount = 0;
  let invalidPurchaseCount = 0;
  let validDealCount = 0;
  let missedDealCount = 0;
  let escalationCount = 0;
  let unnecessaryEscalationCount = 0;
  let duplicateAlertCount = 0;
  let checkedCostCount = 0;
  let exactCostCount = 0;
  let completeExplanationCount = 0;

  for (const expected of expectations) {
    const expectedStrike = expected.offerIsValidDeal && actionable(expected.expectedOutcome);
    if (expectedStrike) validDealCount += 1;
    const eventDecisions = decisionsByEvent.get(expected.eventId) ?? [];
    if (eventDecisions.length > 1) {
      failures.push({ eventId: expected.eventId, kind: "DUPLICATE_DECISION", detail: `Runtime emitted ${eventDecisions.length} decisions for one event.` });
    }
    const decision = eventDecisions[0];
    if (!decision) {
      failures.push({ eventId: expected.eventId, kind: "MISSING_DECISION", detail: "No runtime decision was emitted." });
      if (expectedStrike) missedDealCount += 1;
      continue;
    }

    if (decision.outcome !== expected.expectedOutcome) {
      failures.push({ eventId: expected.eventId, kind: "OUTCOME_MISMATCH", detail: `Expected ${expected.expectedOutcome}, received ${decision.outcome}.` });
    }
    if (actionable(decision.outcome)) {
      strikeCount += 1;
      if (expected.offerIsValidDeal) validStrikeCount += 1;
      else failures.push({ eventId: expected.eventId, kind: "FALSE_STRIKE", detail: `${decision.outcome} was emitted for an invalid deal.` });
    }
    if (decision.outcome === "BUY_SIMULATED") {
      purchaseCount += 1;
      if (!expected.offerIsValidDeal || expected.expectedOutcome !== "BUY_SIMULATED") {
        invalidPurchaseCount += 1;
        failures.push({ eventId: expected.eventId, kind: "FALSE_BUY", detail: "Purchase was not authorized by ground truth." });
      }
    }
    if (expectedStrike && !actionable(decision.outcome)) {
      missedDealCount += 1;
      failures.push({ eventId: expected.eventId, kind: "MISSED_DEAL", detail: `Valid deal resulted in ${decision.outcome}.` });
    }
    if (decision.outcome === "ESCALATE") {
      escalationCount += 1;
      if (expected.expectedOutcome !== "ESCALATE") {
        unnecessaryEscalationCount += 1;
        failures.push({ eventId: expected.eventId, kind: "UNNECESSARY_ESCALATION", detail: `Expected ${expected.expectedOutcome}.` });
      }
    }
    if (decision.outcome === "ALERT" && expected.expectedOutcome === "IGNORE") {
      duplicateAlertCount += 1;
      failures.push({ eventId: expected.eventId, kind: "DUPLICATE_ALERT", detail: "Alert was emitted when the scenario expected suppression." });
    }
    if (expected.expectedLandedCostMinor === undefined) {
      failures.push({ eventId: expected.eventId, kind: "MISSING_EXPECTED_COST", detail: "Ground truth does not declare the expected landed cost." });
    } else {
      checkedCostCount += 1;
      if (decision.landedCost?.total.minorUnits === expected.expectedLandedCostMinor) exactCostCount += 1;
      else failures.push({ eventId: expected.eventId, kind: "COST_MISMATCH", detail: `Expected ${expected.expectedLandedCostMinor} minor units, received ${decision.landedCost?.total.minorUnits ?? "no landed cost"}.` });
    }
    if (explanationComplete(decision)) completeExplanationCount += 1;
    else failures.push({ eventId: expected.eventId, kind: "INCOMPLETE_EXPLANATION", detail: "Decision is missing requirements, cost provenance, or a reason code." });
  }

  return {
    evaluated: expectations.length,
    strikeCount,
    validStrikeCount,
    strikePrecision: rate(validStrikeCount, strikeCount),
    purchaseCount,
    invalidPurchaseCount,
    falseBuyRate: rate(invalidPurchaseCount, purchaseCount),
    validDealCount,
    missedDealCount,
    dealRecall: rate(validDealCount - missedDealCount, validDealCount),
    escalationCount,
    unnecessaryEscalationCount,
    unnecessaryEscalationRate: rate(unnecessaryEscalationCount, escalationCount),
    duplicateAlertCount,
    duplicateAlertRate: rate(duplicateAlertCount, strikeCount),
    checkedCostCount,
    exactCostCount,
    costCalculationExactness: rate(exactCostCount, checkedCostCount),
    completeExplanationCount,
    explanationCompleteness: rate(completeExplanationCount, expectations.length),
    failures,
  };
};
