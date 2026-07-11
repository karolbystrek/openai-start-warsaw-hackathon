import type { OfferSnapshot, ShoppingRequest } from "@/domain/contracts";
import type { AmbiguousMatchAssessor, AmbiguousMatchResult } from "@/domain/matching/staged-matcher";
import { MATCH_OUTPUT_SCHEMA_VERSION, MATCH_PROMPT_VERSION } from "@/domain/matching/staged-matcher";
import { normalizeText } from "@/domain/matching/normalize";

const cacheKey = (request: ShoppingRequest, offer: OfferSnapshot) => normalizeText(`${request.product.brand}|${request.product.model}|${request.requirements.size}|${offer.title}`);

const cached: Readonly<Record<string, Omit<AmbiguousMatchResult, "provenance">>> = {
  [normalizeText("Nike|Dunk Low|EU 43|NKE Dunk Lo Retro Panda mens 43")]: {
    overall: "PASS",
    canonicalProductId: "nike-dunk-low-retro-white-black",
    attributes: [
      { attribute: "model", result: "PASS", evidence: "The listing phrase “Dunk Lo” is a shortened form of the requested model." },
      { attribute: "size", result: "PASS", evidence: "Listing title explicitly contains size 43." },
    ],
  },
};

export class CachedAmbiguousMatchAssessor implements AmbiguousMatchAssessor {
  async assess(request: ShoppingRequest, offer: OfferSnapshot): Promise<AmbiguousMatchResult> {
    const result = cached[cacheKey(request, offer)];
    if (!result) throw new Error("No version-compatible cached ambiguous match exists.");
    const provenance = {
      kind: "AI_DERIVED" as const,
      source: "committed-structured-output-cache",
      observedAt: offer.observedAt,
      adapterVersion: "match-cache-v1",
      model: "recorded-demo-output",
      promptVersion: MATCH_PROMPT_VERSION,
      outputSchemaVersion: MATCH_OUTPUT_SCHEMA_VERSION,
      responseId: "cached-match-nke-dunk-lo-v1",
      inputDigest: cacheKey(request, offer),
    };
    return {
      ...result,
      attributes: result.attributes.map((attribute) => ({ ...attribute, provenance })),
      provenance,
    };
  }
}
