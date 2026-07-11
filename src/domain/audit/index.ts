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
    return `${decision.outcome}: ${formatMoney(decision.landedCost.total)} landed — ${decision.primaryReason}.`;
  }

  expanded(decision: DecisionRecord): readonly string[] {
    const mandate = decision.mandateId ? `Mandate considered: ${decision.mandateId}.` : "No mandate authorized this decision.";
    return [
      `Decision ${decision.outcome} (${decision.primaryReason}); policy ${decision.policyVersion}.`,
      ...decision.landedCost.lines.map(formatLine),
      `= Landed cost: ${formatMoney(decision.landedCost.total)} [rule ${decision.landedCost.ruleVersion}]`,
      ...decision.requirements.map((item) => `${item.result}: ${item.requirement} — ${item.explanation}`),
      mandate,
      decision.notificationSuppressed ? "Notification suppressed as a duplicate or non-meaningful change." : "Notification was not suppressed.",
      `Evidence captured at ${decision.evidence.capturedAt}; decision recorded at ${decision.decidedAt}.`,
    ];
  }
}
