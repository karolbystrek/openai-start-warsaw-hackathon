import {
  ShoppingRequestSchema,
  type ShoppingBriefInterpretation,
  type ShoppingRequest,
} from "@/domain/contracts";
import type {
  BriefInterpreter,
  CheckpointRepository,
  ConfirmedBriefProjector,
} from "@/domain/services";

export interface ChatInterpretationResult {
  interpretation: ShoppingBriefInterpretation;
  requestDraft: ShoppingRequest | null;
  canConfirm: boolean;
}

export interface ChatConfirmationResult extends ChatInterpretationResult {
  confirmed: boolean;
  request: ShoppingRequest | null;
  monitoring: MonitoringActivationStatus;
}

export type MonitoringActivationStatus = "ACTIVE" | "DEFERRED";

export interface MonitoringActivationPort {
  requestActivated(request: ShoppingRequest): Promise<MonitoringActivationStatus>;
}

export class DeferredMonitoringActivation implements MonitoringActivationPort {
  async requestActivated(): Promise<MonitoringActivationStatus> {
    // Event-source wiring is intentionally deferred. This port is the seam used
    // later to subscribe an activated request to merchant simulation events.
    return "DEFERRED";
  }
}

type ChatRequestRepository = Pick<CheckpointRepository, "getRequest" | "saveRequest">;

export class ShoppingChatApplication {
  constructor(
    private readonly interpreter: BriefInterpreter,
    private readonly projector: ConfirmedBriefProjector,
    private readonly repository: ChatRequestRepository,
    private readonly monitoring: MonitoringActivationPort = new DeferredMonitoringActivation(),
  ) {}

  async interpret(userTurns: readonly string[]): Promise<ChatInterpretationResult> {
    const sourceText = this.toSourceText(userTurns);
    const interpretation = await this.interpreter.interpret(sourceText);
    const requestDraft = this.projector.project(interpretation);
    return {
      interpretation,
      requestDraft,
      canConfirm: requestDraft !== null,
    };
  }

  async confirm(userTurns: readonly string[]): Promise<ChatConfirmationResult> {
    const result = await this.interpret(userTurns);
    if (!result.requestDraft) {
      return { ...result, confirmed: false, request: null, monitoring: "DEFERRED" };
    }

    const existing = await this.repository.getRequest(
      result.requestDraft.id,
      result.requestDraft.version,
    );
    if (existing) {
      const monitoring = existing.lifecycle === "ACTIVE"
        ? await this.monitoring.requestActivated(existing)
        : "DEFERRED";
      return {
        ...result,
        confirmed: existing.lifecycle === "ACTIVE",
        request: existing,
        monitoring,
      };
    }

    const request = ShoppingRequestSchema.parse({
      ...result.requestDraft,
      lifecycle: "ACTIVE",
    });
    await this.repository.saveRequest(request);
    const monitoring = await this.monitoring.requestActivated(request);

    return { ...result, confirmed: true, request, monitoring };
  }

  private toSourceText(userTurns: readonly string[]): string {
    const turns = userTurns.map((turn) => turn.trim()).filter(Boolean);
    if (turns.length === 0) throw new Error("At least one user message is required.");
    return turns.join("\n");
  }
}
