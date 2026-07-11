import { SimulationStateSchema, type SimulationState } from "@/application/simulation-state";
import { recoverSimulator } from "@/application/simulator-recovery";
import type { EvaluationRepository } from "@/application/evaluation-repository";
import { ShoppingRequestSchema, type ShoppingBriefInterpretation, type ShoppingRequest } from "@/domain/contracts";
import type {
  BriefInterpreter,
  ConfirmedBriefProjector,
  LandedCostCalculator,
  MatchService,
  PolicyEvaluator,
  ReceiptProjection,
  SimulatorControl,
  VerificationService,
} from "@/domain/services";

export interface CheckpointApplicationDependencies {
  request: ShoppingRequest;
  runId: string;
  simulator: SimulatorControl;
  repository: EvaluationRepository;
  matching: MatchService;
  verification: VerificationService;
  pricing: LandedCostCalculator;
  policy: PolicyEvaluator;
  receipts: ReceiptProjection;
  briefInterpreter: BriefInterpreter;
  briefProjector: ConfirmedBriefProjector;
}

export class CheckpointApplication {
  private mutationTail: Promise<void> = Promise.resolve();
  private activeRequest: ShoppingRequest;

  constructor(private readonly dependencies: CheckpointApplicationDependencies) {
    this.activeRequest = dependencies.request;
  }

  private async serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationTail;
    let release = () => {};
    this.mutationTail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async getSimulationState(): Promise<SimulationState> {
    const { runId, simulator, repository, receipts } = this.dependencies;
    const request = this.activeRequest;
    const processedEvents = [...await repository.listEvents(runId)];
    recoverSimulator(simulator, processedEvents);
    const decisions = [...await repository.listDecisions(request.id)];
    const currentDecision = decisions.at(-1) ?? null;
    return SimulationStateSchema.parse({
      request,
      simulator: simulator.getState(),
      processedEvents,
      decisions,
      currentDecision,
      receipt: currentDecision ? {
        concise: receipts.concise(currentDecision),
        expanded: [...receipts.expanded(currentDecision)],
      } : null,
    });
  }

  async interpretBrief(sourceText: string): Promise<ShoppingBriefInterpretation> {
    return this.dependencies.briefInterpreter.interpret(sourceText);
  }

  async activateBrief(sourceText: string): Promise<{
    interpretation: ShoppingBriefInterpretation;
    state: SimulationState | null;
  }> {
    return this.serializeMutation(async () => {
      const interpretation = await this.dependencies.briefInterpreter.interpret(sourceText);
      const projected = this.dependencies.briefProjector.project(interpretation);
      if (!projected) return { interpretation, state: null };

      this.activeRequest = ShoppingRequestSchema.parse({ ...projected, lifecycle: "ACTIVE" });
      this.dependencies.simulator.reset();
      await this.dependencies.repository.reset();
      await this.dependencies.repository.saveRequest(this.activeRequest);
      return { interpretation, state: await this.getSimulationState() };
    });
  }

  async stepSimulation(expectedSequence: number): Promise<SimulationState> {
    return this.serializeMutation(() => this.stepSimulationOnce(expectedSequence));
  }

  private async stepSimulationOnce(expectedSequence: number): Promise<SimulationState> {
    const { runId, simulator, repository, matching, verification, pricing, policy } = this.dependencies;
    const request = this.activeRequest;
    await repository.saveRequest(request);
    recoverSimulator(simulator, await repository.listEvents(runId));
    if (simulator.getState().nextSequence !== expectedSequence) return this.getSimulationState();
    const event = simulator.step();
    if (!event) return this.getSimulationState();

    try {
      if (event.type === "OFFER_OBSERVED") {
        const previousDecisions = await repository.listDecisions(request.id);
        const match = await matching.assess(request, event.offer);
        const evidence = await verification.verify(request, event.offer, event.evidence);
        const landedCost = await pricing.calculate(request, event.offer, evidence);
        const decision = await policy.evaluate({
          request,
          event,
          offer: event.offer,
          evidence,
          match,
          landedCost,
          previousDecisions,
        });
        await repository.saveEvaluation(event, decision);
      } else {
        await repository.saveEvent(event);
      }
    } catch (error) {
      simulator.reset();
      recoverSimulator(simulator, await repository.listEvents(runId));
      throw error;
    }

    return this.getSimulationState();
  }

  async resetSimulation(): Promise<SimulationState> {
    return this.serializeMutation(() => this.resetSimulationOnce());
  }

  private async resetSimulationOnce(): Promise<SimulationState> {
    const { simulator, repository } = this.dependencies;
    const request = this.activeRequest;
    simulator.reset();
    await repository.reset();
    await repository.saveRequest(request);
    return this.getSimulationState();
  }
}
