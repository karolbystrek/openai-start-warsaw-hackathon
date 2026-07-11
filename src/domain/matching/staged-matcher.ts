import {
  MatchAssessmentSchema,
  type MatchAssessment,
  type OfferSnapshot,
  type Provenance,
  type ShoppingRequest,
} from "@/domain/contracts";
import type { MatchService } from "@/domain/services";
import { demoCatalog, disclosedSeededMappings, type CatalogProduct } from "@/domain/catalog/demo-catalog";
import { normalizeIdentifier, normalizeSize, normalizeText } from "@/domain/matching/normalize";

export const MATCH_PROMPT_VERSION = "ambiguous-match-v1";
export const MATCH_OUTPUT_SCHEMA_VERSION = "ambiguous-match-assessment-v1";

export interface AmbiguousMatchResult {
  overall: "PASS" | "FAIL" | "UNKNOWN";
  canonicalProductId: string | null;
  attributes: MatchAssessment["attributes"];
  provenance: Provenance;
}

export interface AmbiguousMatchAssessor {
  assess(request: ShoppingRequest, offer: OfferSnapshot): Promise<AmbiguousMatchResult>;
}

const provenance = (kind: Provenance["kind"], source: string, observedAt: string): Provenance => ({
  kind,
  source,
  observedAt,
  adapterVersion: "staged-matcher-v1",
});

const candidateFromIdentifiers = (offer: OfferSnapshot, catalog: readonly CatalogProduct[]) => {
  const ids = new Set<string>();
  for (const observed of offer.identifiers) {
    const normalizedObserved = normalizeIdentifier(observed.value);
    for (const entry of catalog) {
      const matches = entry.identifiers.some((known) => known.type === observed.type
        && normalizeIdentifier(known.value) === normalizedObserved
        && (known.type !== "SKU" || known.merchantId === offer.merchantId));
      if (matches) ids.add(entry.id);
    }
  }
  return [...ids];
};

const candidateFromSeededAliases = (title: string) => {
  const normalizedTitle = normalizeText(title);
  return [...new Set(disclosedSeededMappings
    .filter((mapping) => normalizedTitle.includes(normalizeText(mapping.alias)))
    .map((mapping) => mapping.canonicalProductId))];
};

const candidateFromNormalizedTokens = (request: ShoppingRequest, offer: OfferSnapshot, catalog: readonly CatalogProduct[]) => {
  const haystack = normalizeText(`${offer.title} ${offer.attributes.brand ?? ""} ${offer.attributes.model ?? ""}`);
  const requestedBrand = normalizeText(request.product.brand);
  const requestedModelTokens = normalizeText(request.product.model).split(" ");
  return catalog.filter((entry) => {
    if (normalizeText(entry.brand) !== requestedBrand || !haystack.includes(requestedBrand)) return false;
    const modelTokens = normalizeText(entry.model).split(" ");
    return requestedModelTokens.every((token) => modelTokens.includes(token))
      && modelTokens.every((token) => haystack.includes(token));
  }).map((entry) => entry.id);
};

const compareAttributes = (request: ShoppingRequest, offer: OfferSnapshot, candidate: CatalogProduct | null) => {
  const observedAt = offer.observedAt;
  const computed = provenance("COMPUTED", "attribute-comparator", observedAt);
  const compare = (attribute: string, expected: string, actual: string | null, normalize: (value: string) => string = normalizeText) => ({
    attribute,
    result: actual === null ? "UNKNOWN" as const : normalize(expected) === normalize(actual) ? "PASS" as const : "FAIL" as const,
    evidence: actual === null ? `${attribute} is missing from the listing.` : `Expected ${expected}; observed ${actual}.`,
    provenance: computed,
  });
  const actualBrand = offer.attributes.brand ?? candidate?.brand ?? null;
  const actualModel = offer.attributes.model ?? candidate?.model ?? null;
  return [
    compare("brand", request.product.brand, actualBrand),
    compare("model", request.product.model, actualModel),
    compare("size", request.requirements.size, offer.attributes.size, normalizeSize),
    compare("condition", request.requirements.condition, offer.attributes.condition),
    {
      attribute: "quantity",
      result: offer.attributes.quantity === request.requirements.quantity ? "PASS" as const : "FAIL" as const,
      evidence: `Expected quantity ${request.requirements.quantity}; observed ${offer.attributes.quantity}.`,
      provenance: computed,
    },
  ];
};

const digest = (value: string) => {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export class StagedMatchService implements MatchService {
  constructor(
    private readonly catalog: readonly CatalogProduct[] = demoCatalog,
    private readonly aiAssessor?: AmbiguousMatchAssessor,
  ) {}

  async assess(request: ShoppingRequest, offer: OfferSnapshot): Promise<MatchAssessment> {
    const stages: NonNullable<MatchAssessment["stages"]> = [];
    const exactCandidates = candidateFromIdentifiers(offer, this.catalog);
    stages.push({
      stage: "EXACT_IDENTIFIER",
      result: exactCandidates.length === 1 ? "PASS" : exactCandidates.length > 1 ? "FAIL" : "UNKNOWN",
      evidence: exactCandidates.length ? [`Identifiers resolved to: ${exactCandidates.join(", ")}.`] : ["No catalog identifier matched."],
      candidateCanonicalIds: exactCandidates,
      provenance: provenance("COMPUTED", "catalog-identifier-index", offer.observedAt),
    });

    if (exactCandidates.length > 1) return this.finish(request, offer, "UNRESOLVED", "FAIL", null, [], stages);

    const seededCandidates = exactCandidates.length === 0 ? candidateFromSeededAliases(offer.title) : [];
    stages.push({
      stage: "SEEDED_CATALOG",
      result: seededCandidates.length === 1 ? "PASS" : seededCandidates.length > 1 ? "FAIL" : "UNKNOWN",
      evidence: seededCandidates.length ? [`Disclosed alias resolved to: ${seededCandidates.join(", ")}.`] : ["No disclosed seeded alias matched."],
      candidateCanonicalIds: seededCandidates,
      provenance: provenance("SEEDED", "disclosed-demo-alias-map", offer.observedAt),
    });
    if (seededCandidates.length > 1) return this.finish(request, offer, "UNRESOLVED", "FAIL", null, [], stages);

    const normalizedCandidates = exactCandidates.length === 0 && seededCandidates.length === 0
      ? candidateFromNormalizedTokens(request, offer, this.catalog)
      : [];
    stages.push({
      stage: "NORMALIZED",
      result: normalizedCandidates.length === 1 ? "PASS" : normalizedCandidates.length > 1 ? "UNKNOWN" : "UNKNOWN",
      evidence: normalizedCandidates.length ? [`Normalized tokens produced: ${normalizedCandidates.join(", ")}.`] : ["Normalized tokens did not produce a unique catalog candidate."],
      candidateCanonicalIds: normalizedCandidates,
      provenance: provenance("COMPUTED", "catalog-token-normalizer", offer.observedAt),
    });

    const candidateIds = exactCandidates.length ? exactCandidates : seededCandidates.length ? seededCandidates : normalizedCandidates;
    const candidate = candidateIds.length === 1 ? this.catalog.find((entry) => entry.id === candidateIds[0]) ?? null : null;
    const attributes = compareAttributes(request, offer, candidate);
    const attributeOverall = attributes.some((item) => item.result === "FAIL") ? "FAIL" : attributes.some((item) => item.result === "UNKNOWN") ? "UNKNOWN" : "PASS";
    stages.push({
      stage: "ATTRIBUTE_LEVEL",
      result: attributeOverall,
      evidence: attributes.map((item) => item.evidence),
      candidateCanonicalIds: candidate ? [candidate.id] : [],
      provenance: provenance("COMPUTED", "attribute-comparator", offer.observedAt),
    });

    const deterministicMethod = exactCandidates.length === 1
      ? "EXACT_IDENTIFIER" as const
      : seededCandidates.length === 1
        ? "SEEDED_CATALOG" as const
        : normalizedCandidates.length === 1
          ? "NORMALIZED" as const
          : "ATTRIBUTE_LEVEL" as const;
    if (attributeOverall === "FAIL") return this.finish(request, offer, deterministicMethod, "FAIL", candidate?.id ?? null, attributes, stages);
    if (candidate && attributeOverall === "PASS") return this.finish(request, offer, deterministicMethod, "PASS", candidate.id, attributes, stages);

    if (this.aiAssessor) {
      try {
        const ai = await this.aiAssessor.assess(request, offer);
        stages.push({
          stage: "AI_ASSISTED",
          result: ai.overall,
          evidence: ai.attributes.map((item) => item.evidence),
          candidateCanonicalIds: ai.canonicalProductId ? [ai.canonicalProductId] : [],
          provenance: ai.provenance,
        });
        return this.finish(request, offer, "AI_ASSISTED", ai.overall, ai.canonicalProductId, ai.attributes, stages, ai.provenance);
      } catch {
        stages.push({
          stage: "AI_ASSISTED",
          result: "UNKNOWN",
          evidence: ["AI assessment was unavailable or invalid; identity remains unresolved."],
          candidateCanonicalIds: [],
          provenance: provenance("COMPUTED", "ai-failure-fallback", offer.observedAt),
        });
      }
    }
    return this.finish(request, offer, "UNRESOLVED", "UNKNOWN", null, attributes, stages);
  }

  private finish(
    request: ShoppingRequest,
    offer: OfferSnapshot,
    method: MatchAssessment["method"],
    overall: MatchAssessment["overall"],
    canonicalProductId: string | null,
    attributes: MatchAssessment["attributes"],
    stages: NonNullable<MatchAssessment["stages"]>,
    finalProvenance: Provenance = provenance("COMPUTED", "staged-match-service", offer.observedAt),
  ): MatchAssessment {
    return MatchAssessmentSchema.parse({
      schemaVersion: 1,
      id: `match-${offer.id}-${digest(`${request.id}:${request.version}:${offer.id}`)}`,
      requestId: request.id,
      offerId: offer.id,
      method,
      overall,
      canonicalProductId,
      attributes,
      stages,
      provenance: finalProvenance,
    });
  }
}
