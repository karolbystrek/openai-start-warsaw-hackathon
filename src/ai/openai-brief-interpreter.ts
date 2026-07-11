import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { ShoppingRequestSchema, type ShoppingRequest } from "@/domain/contracts";
import type { BriefInterpreter } from "@/domain/services";

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

  async interpret(sourceText: string): Promise<ShoppingRequest> {
    const response = await this.client.responses.parse({
      model: this.model!,
      input: [
        {
          role: "system",
          content: "Convert the shopping brief into the supplied schema. Preserve hard requirements and list unresolved ambiguities. Never invent evidence or relax a cap.",
        },
        { role: "user", content: sourceText },
      ],
      text: { format: zodTextFormat(ShoppingRequestSchema, "shopping_request_v1") },
    });

    if (!response.output_parsed) throw new Error("OpenAI returned no parsed shopping request.");
    return ShoppingRequestSchema.parse(response.output_parsed);
  }
}
