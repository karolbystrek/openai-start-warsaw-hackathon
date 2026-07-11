import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { ShoppingBriefInterpretationSchema, type ShoppingBriefInterpretation } from "@/domain/contracts";
import type { BriefInterpreter } from "@/domain/services";
import { BRIEF_OUTPUT_SCHEMA_VERSION, BRIEF_PROMPT_VERSION } from "@/domain/brief/interpret";

const ModelBriefOutputSchema = ShoppingBriefInterpretationSchema.omit({ provenance: true });

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
          content: "Convert the shopping brief into the supplied draft schema. Preserve hard requirements, preferences, notification intent, and mandate intent separately. List every unresolved activation-critical ambiguity. Never infer a destination, invent evidence, activate consent, or relax a cap.",
        },
        { role: "user", content: sourceText },
      ],
      text: { format: zodTextFormat(ModelBriefOutputSchema, "shopping_brief_interpretation_v1") },
    });

    if (!response.output_parsed) throw new Error("OpenAI returned no parsed shopping request.");
    return ShoppingBriefInterpretationSchema.parse({
      ...response.output_parsed,
      originalText: sourceText,
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
