import type { ShoppingBriefInterpretation } from "@/domain/contracts";
import type { BriefInterpreter } from "@/domain/services";

export class ResilientBriefInterpreter implements BriefInterpreter {
  constructor(
    private readonly fallback: BriefInterpreter,
    private readonly live?: BriefInterpreter,
  ) {}

  async interpret(sourceText: string): Promise<ShoppingBriefInterpretation> {
    const fallbackResult = await this.fallback.interpret(sourceText);
    if (!this.live) return fallbackResult;

    try {
      const liveResult = await this.live.interpret(sourceText);
      const fallbackBlocking = fallbackResult.ambiguities.filter((item) => item.blocking).length;
      const liveBlocking = liveResult.ambiguities.filter((item) => item.blocking).length;
      return liveBlocking < fallbackBlocking ? liveResult : fallbackResult;
    } catch {
      // A model or network failure must not break deterministic demo behavior.
    }
    return fallbackResult;
  }
}
