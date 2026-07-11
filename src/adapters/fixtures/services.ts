import { DecisionRecordSchema, type DecisionRecord, type EvidenceBundle, type LandedCost, type MatchAssessment, type OfferSnapshot, type ShoppingRequest } from "@/domain/contracts";
import type { LandedCostCalculator, MatchService, PolicyEvaluator, ReceiptProjection, VerificationService } from "@/domain/services";
import { costsByOfferId, decisionsByOfferId } from "@/adapters/fixtures/trust-core-fixtures";
import { StagedMatchService } from "@/domain/matching/staged-matcher";
import { CachedAmbiguousMatchAssessor } from "@/ai/cached-ambiguous-match";

export class FixtureMatchService implements MatchService {
  private readonly matcher = new StagedMatchService(undefined, new CachedAmbiguousMatchAssessor());

  async assess(request: ShoppingRequest, offer: OfferSnapshot): Promise<MatchAssessment> {
    return this.matcher.assess(request, offer);
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
    return DecisionRecordSchema.parse({
      ...decision,
      offer: input.offer,
      evidence: input.evidence,
      match: input.match,
      landedCost: input.landedCost,
    });
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
