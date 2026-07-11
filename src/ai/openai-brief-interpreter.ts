import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { ShoppingBriefInterpretationSchema, type ShoppingBriefInterpretation } from "@/domain/contracts";
import type { BriefInterpreter } from "@/domain/services";
import { demoCatalog } from "@/domain/catalog/demo-catalog";
import {
  BRIEF_OUTPUT_SCHEMA_VERSION,
  BRIEF_PROMPT_VERSION,
  catalogProductFromText,
  categoryRequiresSize,
} from "@/domain/brief/interpret";

const ModelBriefOutputSchema = ShoppingBriefInterpretationSchema.omit({ provenance: true });
const catalogGuide = demoCatalog.map((product) => `${product.brand} ${product.model} (${product.category})`).join("; ");

function enforceMaximumLandedCost(output: z.infer<typeof ModelBriefOutputSchema>) {
  const maximumLandedCost = output.requestDraft.requirements.maximumLandedCost;
  if (!maximumLandedCost) return output;

  return {
    ...output,
    requestDraft: {
      ...output.requestDraft,
      requirements: {
        ...output.requestDraft.requirements,
        capIncludesDelivery: true as const,
      },
    },
    ambiguities: output.ambiguities.filter((item) => item.code !== "UNCLEAR_DELIVERED_CAP"),
  };
}

export class OpenAIBriefInterpreter implements BriefInterpreter {
  private readonly client: OpenAI;

  constructor(
    apiKey: string | undefined = process.env.OPENAI_API_KEY,
    private readonly model: string | undefined = process.env.OPENAI_MODEL,
  ) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required when the OpenAI brief interpreter is selected.");
    if (!model) throw new Error("OPENAI_MODEL is required when the OpenAI brief interpreter is selected.");
    this.client = new OpenAI({ apiKey });
  }

  async interpret(sourceText: string): Promise<ShoppingBriefInterpretation> {
    const response = await this.client.responses.parse({
      model: this.model!,
      input: [
        {
          role: "system",
          content: [
            "Convert the cumulative shopping conversation into the supplied draft schema.",
            "Preserve hard requirements, soft preferences, notification intent, and mandate intent separately.",
            "Any monetary ceiling is the maximum total landed cost, including item price, delivery, taxes, duties, fees, currency conversion, and valid discounts; set capIncludesDelivery to true and never ask whether the cap includes those costs.",
            "Ask only for facts needed to evaluate delivered cost and product identity: exact product, applicable variant or size, condition, destination, delivered budget, and seller-channel policy.",
            "For products where sizing is not meaningful, set size to N/A and do not emit MISSING_SIZE.",
            "Do not mark a brief incomplete merely because color or another optional preference was omitted.",
            "Use MISSING_SELLER_POLICY when the user has not said whether resellers or marketplaces are allowed.",
            "List each unresolved activation-critical ambiguity with a short, natural clarification question.",
            "Never infer a destination, seller policy, evidence, purchase consent, or permission to relax a cap.",
            `Supported deterministic demo catalog: ${catalogGuide}.`,
          ].join(" "),
        },
        { role: "user", content: sourceText },
      ],
      text: { format: zodTextFormat(ModelBriefOutputSchema, "shopping_brief_interpretation_v1") },
    });

    if (!response.output_parsed) throw new Error("OpenAI returned no parsed shopping request.");
    const output = enforceMaximumLandedCost(response.output_parsed);
    const catalogProduct = catalogProductFromText(`${sourceText} ${output.requestDraft.product.brand ?? ""} ${output.requestDraft.product.model ?? ""}`);
    const requirements = output.requestDraft.requirements;
    const requiresSize = categoryRequiresSize(catalogProduct?.category ?? output.requestDraft.product.category);
    const ambiguityCodes = new Set(output.ambiguities.map((item) => item.code));
    const ambiguities = output.ambiguities.filter((item) => requiresSize || item.code !== "MISSING_SIZE");
    const addAmbiguity = (
      code: typeof output.ambiguities[number]["code"],
      fieldPath: string,
      explanation: string,
      clarificationQuestion: string,
    ) => {
      if (ambiguityCodes.has(code)) return;
      ambiguityCodes.add(code);
      ambiguities.push({ code, fieldPath, blocking: true, explanation, clarificationQuestion });
    };

    if (!catalogProduct && (!output.requestDraft.product.brand || !output.requestDraft.product.model || !output.requestDraft.product.category)) {
      addAmbiguity("MISSING_PRODUCT", "requestDraft.product", "An exact product could not be identified.", "What exact brand and model should I search for?");
    }
    if (requiresSize && !requirements.size) {
      addAmbiguity("MISSING_SIZE", "requestDraft.requirements.size", "This product requires a size or variant.", "Which size do you need?");
    }
    if (!requirements.condition) {
      addAmbiguity("MISSING_CONDITION", "requestDraft.requirements.condition", "Acceptable condition is required.", "Should it be new, used, or refurbished?");
    }
    if (!requirements.destinationCountry) {
      addAmbiguity("MISSING_DESTINATION", "requestDraft.requirements.destinationCountry", "Delivered cost requires a destination.", "Which country should it be delivered to?");
    }
    if (!requirements.maximumLandedCost) {
      addAmbiguity("MISSING_BUDGET", "requestDraft.requirements.maximumLandedCost", "A delivered spending ceiling is required.", "What is your maximum delivered price and currency?");
    }
    if (requirements.maximumLandedCost && requirements.capIncludesDelivery !== true) {
      addAmbiguity("UNCLEAR_DELIVERED_CAP", "requestDraft.requirements.capIncludesDelivery", "The budget must explicitly cover delivery and fees.", "Does that maximum include delivery, duties, and fees?");
    }
    if (requirements.allowResellers === null) {
      addAmbiguity("MISSING_SELLER_POLICY", "requestDraft.requirements.allowResellers", "Seller-channel permission must be explicit.", "May I include trusted resellers and marketplaces, or official retailers only?");
    }

    return ShoppingBriefInterpretationSchema.parse({
      ...output,
      originalText: sourceText,
      requestDraft: {
        ...output.requestDraft,
        product: catalogProduct ? {
          brand: catalogProduct.brand,
          model: catalogProduct.model,
          category: catalogProduct.category,
          identifiers: catalogProduct.identifiers
            .filter((identifier) => !identifier.fixtureOnly)
            .map(({ type, value }) => ({ type, value })),
        } : output.requestDraft.product,
        requirements: {
          ...requirements,
          size: requiresSize ? requirements.size : requirements.size ?? "N/A",
        },
      },
      ambiguities,
      provenance: {
        kind: "AI_DERIVED",
        source: "openai-responses-structured-output",
        observedAt: new Date().toISOString(),
        adapterVersion: "openai-brief-v1",
        model: this.model,
        promptVersion: BRIEF_PROMPT_VERSION,
        outputSchemaVersion: BRIEF_OUTPUT_SCHEMA_VERSION,
        responseId: response.id,
      },
    });
  }
}
