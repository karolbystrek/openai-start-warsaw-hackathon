import type { DecisionRecord, LandedCostLine, Money } from "@/domain/contracts";
import type { ReceiptProjection } from "@/domain/services";

const currencyDigits: Readonly<Record<string, number>> = {
  BHD: 3,
  JOD: 3,
  JPY: 0,
  KWD: 3,
  OMR: 3,
};

export const formatMoney = (money: Money): string => {
  const digits = currencyDigits[money.currency] ?? 2;
  if (digits === 0) return `${money.currency} ${money.minorUnits}`;
  const divisor = 10 ** digits;
  const whole = Math.floor(money.minorUnits / divisor);
  const fraction = String(money.minorUnits % divisor).padStart(digits, "0");
  return `${money.currency} ${whole}.${fraction}`;
};

const formatLine = (line: LandedCostLine): string => {
  const sign = line.operation === "SUBTRACT" ? "−" : "+";
  const operation = line.operation === "CONVERT" ? "converted" : sign;
  return `${operation} ${line.label}: ${formatMoney(line.amount)} [${line.provenance.source}]`;
};

export class DeterministicReceiptProjection implements ReceiptProjection {
  concise(decision: DecisionRecord): string {
    return decision.landedCost
      ? `${decision.outcome}: ${formatMoney(decision.landedCost.total)} landed — ${decision.primaryReason}.`
      : `${decision.outcome}: landed cost unavailable — ${decision.primaryReason}.`;
  }

  expanded(decision: DecisionRecord): readonly string[] {
    const mandate = decision.mandateAuthorization
      ? `Mandate considered: ${decision.mandateAuthorization.mandateId} version ${decision.mandateAuthorization.mandateVersion}; ${decision.mandateAuthorization.checks.filter((check) => check.result !== "PASS").length} authorization checks did not pass.`
      : decision.mandateId ? `Mandate considered: ${decision.mandateId}.` : "No mandate authorized this decision.";
    const notification = decision.notificationAssessment
      ? `Notification fingerprint ${decision.notificationAssessment.fingerprint}; ${decision.notificationAssessment.reason ?? decision.notificationAssessment.suppressionReason ?? "not suppressed"}; improvement ${decision.notificationAssessment.improvementMinor ?? "not applicable"} minor units.`
      : decision.notificationSuppressed
        ? `Notification suppressed (${decision.primaryReason === "DUPLICATE_SUPPRESSED" ? "same canonical product and variant without a meaningful improvement" : decision.primaryReason}).`
        : "Notification was not suppressed.";
    const pricingSelection = decision.pricingSelection
      ? [
          decision.pricingSelection.selectedPath
            ? `Selected pricing path ${decision.pricingSelection.selectedPath.id} (${decision.pricingSelection.selectedPath.deliveryOptionId}; coupons ${decision.pricingSelection.selectedPath.couponCodes.join("+") || "none"}).`
            : "No valid pricing path was selected.",
          ...decision.pricingSelection.alternatives.map((path) => `Pricing path ${path.id}: ${path.status} — ${path.reasonCodes.join(", ") || "eligible but not selected"}.`),
        ]
      : [];
    return [
      `Decision ${decision.outcome} (${decision.primaryReason}); policy ${decision.policyVersion}.`,
      ...pricingSelection,
      ...(decision.landedCost
        ? [
            ...decision.landedCost.lines.map(formatLine),
            `= Landed cost: ${formatMoney(decision.landedCost.total)} [rule ${decision.landedCost.ruleVersion}]`,
          ]
        : ["Landed cost unavailable; no valid deterministic pricing path was selected."]),
      ...decision.requirements.map((item) => `${item.result}: ${item.requirement} — ${item.explanation}`),
      mandate,
      notification,
      `Evidence captured at ${decision.evidence.capturedAt}; decision recorded at ${decision.decidedAt}.`,
    ];
  }
}
