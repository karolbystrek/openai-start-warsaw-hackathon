import type { ShoppingBriefInterpretation } from "@/domain/contracts";
import type { BriefInterpreter } from "@/domain/services";

export class ResilientBriefInterpreter implements BriefInterpreter {
  constructor(
    private readonly fallback: BriefInterpreter,
    private readonly live?: BriefInterpreter,
  ) {}

  async interpret(sourceText: string): Promise<ShoppingBriefInterpretation> {
    if (this.live) {
      try {
        return await this.live.interpret(sourceText);
      } catch {
        // A model or network failure must not break deterministic demo behavior.
      }
    }
    return this.fallback.interpret(sourceText);
  }
}
