import { ShoppingRequestSchema, type DecisionRecord, type EvidenceBundle, type LandedCost, type MatchAssessment, type OfferSnapshot, type ShoppingRequest } from "@/domain/contracts";
import type { BriefInterpreter, LandedCostCalculator, MatchService, PolicyEvaluator, ReceiptProjection, VerificationService } from "@/domain/services";
import { costsByOfferId, decisionsByOfferId, headlineRequest, matchesByOfferId } from "@/simulator/scenarios/headline";

export class DeterministicBriefInterpreter implements BriefInterpreter {
  async interpret(sourceText: string): Promise<ShoppingRequest> {
    return ShoppingRequestSchema.parse({ ...headlineRequest, originalText: sourceText });
  }
}

export class FixtureMatchService implements MatchService {
  async assess(_request: ShoppingRequest, offer: OfferSnapshot): Promise<MatchAssessment> {
    const match = matchesByOfferId.get(offer.id);
    if (!match) throw new Error(`No fixture match for offer ${offer.id}.`);
    return match;
  }
}

export class FixtureVerificationService implements VerificationService {
  async verify(_request: ShoppingRequest, _offer: OfferSnapshot, evidence: EvidenceBundle): Promise<EvidenceBundle> {
    return evidence;
  }
}

export class FixtureLandedCostCalculator implements LandedCostCalculator {
  async calculate(_request: ShoppingRequest, offer: OfferSnapshot): Promise<LandedCost> {
    const cost = costsByOfferId.get(offer.id);
    if (!cost) throw new Error(`No fixture landed cost for offer ${offer.id}.`);
    return cost;
  }
}

export class FixturePolicyEvaluator implements PolicyEvaluator {
  async evaluate(input: Parameters<PolicyEvaluator["evaluate"]>[0]): Promise<DecisionRecord> {
    const decision = decisionsByOfferId.get(input.offer.id);
    if (!decision) throw new Error(`No fixture decision for offer ${input.offer.id}.`);
    return decision;
  }
}

const formatMoney = (currency: string, minorUnits: number) => `${currency} ${(minorUnits / 100).toFixed(2)}`;

export class FixtureReceiptProjection implements ReceiptProjection {
  concise(decision: DecisionRecord): string {
    return `${decision.outcome}: ${formatMoney(decision.landedCost.total.currency, decision.landedCost.total.minorUnits)} landed — ${decision.primaryReason}.`;
  }

  expanded(decision: DecisionRecord): readonly string[] {
    return decision.requirements.map((item) => `${item.result}: ${item.requirement} — ${item.explanation}`);
  }
}
