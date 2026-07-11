import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type { OfferSnapshot, ShoppingRequest } from "@/domain/contracts";
import type { AmbiguousMatchAssessor, AmbiguousMatchResult } from "@/domain/matching/staged-matcher";
import { MATCH_OUTPUT_SCHEMA_VERSION, MATCH_PROMPT_VERSION } from "@/domain/matching/staged-matcher";

const ModelMatchSchema = z.object({
  overall: z.enum(["PASS", "FAIL", "UNKNOWN"]),
  canonicalProductId: z.string().min(1).nullable(),
  attributes: z.array(z.object({
    attribute: z.string().min(1),
    result: z.enum(["PASS", "FAIL", "UNKNOWN"]),
    evidence: z.string().min(1),
    requestField: z.string().min(1),
    offerField: z.string().min(1),
  })),
});

const digest = (value: string) => {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export class OpenAIAmbiguousMatchAssessor implements AmbiguousMatchAssessor {
  private readonly client: OpenAI;

  constructor(
    apiKey: string | undefined = process.env.OPENAI_API_KEY,
    private readonly model: string | undefined = process.env.OPENAI_MODEL,
  ) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required when live ambiguous matching is selected.");
    if (!model) throw new Error("OPENAI_MODEL is required when live ambiguous matching is selected.");
    this.client = new OpenAI({ apiKey });
  }

  async assess(request: ShoppingRequest, offer: OfferSnapshot): Promise<AmbiguousMatchResult> {
    const input = JSON.stringify({
      request: { product: request.product, requirements: { size: request.requirements.size, condition: request.requirements.condition, quantity: request.requirements.quantity } },
      offer: { title: offer.title, identifiers: offer.identifiers, attributes: offer.attributes },
    });
    const response = await this.client.responses.parse({
      model: this.model!,
      input: [
        { role: "system", content: "Assess only unresolved product identity facts. Cite exact request and offer field paths for every claim. Never override explicit contradictory identifiers or attributes. Use UNKNOWN when the supplied fields do not support a conclusion." },
        { role: "user", content: input },
      ],
      text: { format: zodTextFormat(ModelMatchSchema, "ambiguous_match_v1") },
    });
    if (!response.output_parsed) throw new Error("OpenAI returned no parsed match assessment.");
    const parsed = ModelMatchSchema.parse(response.output_parsed);
    const provenance = {
      kind: "AI_DERIVED" as const,
      source: "openai-responses-structured-output",
      observedAt: offer.observedAt,
      adapterVersion: "openai-match-v1",
      model: this.model!,
      promptVersion: MATCH_PROMPT_VERSION,
      outputSchemaVersion: MATCH_OUTPUT_SCHEMA_VERSION,
      responseId: response.id,
      inputDigest: digest(input),
    };
    return {
      overall: parsed.overall,
      canonicalProductId: parsed.canonicalProductId,
      attributes: parsed.attributes.map((attribute) => ({
        attribute: attribute.attribute,
        result: attribute.result,
        evidence: `${attribute.evidence} [${attribute.requestField} ↔ ${attribute.offerField}]`,
        provenance,
      })),
      provenance,
    };
  }
}
