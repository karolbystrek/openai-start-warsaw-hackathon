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
  initialRequest: ShoppingRequest;
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
    this.activeRequest = dependencies.initialRequest;
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
    const request = await this.loadCurrentRequest();
    const processedEvents = [...await repository.listEvents(runId)];
    recoverSimulator(simulator, processedEvents);
    const decisions = [...await repository.listDecisionsForRun({
      requestId: request.id,
      requestVersion: request.version,
      runId,
    })];
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
      await this.dependencies.repository.resetToRequest(this.activeRequest);
      return { interpretation, state: await this.getSimulationState() };
    });
  }

  async stepSimulation(expectedSequence: number): Promise<SimulationState> {
    return this.serializeMutation(() => this.stepSimulationOnce(expectedSequence));
  }

  private async stepSimulationOnce(expectedSequence: number): Promise<SimulationState> {
    const { runId, simulator, repository, matching, verification, pricing, policy } = this.dependencies;
    await this.loadCurrentRequest();
    recoverSimulator(simulator, await repository.listEvents(runId));
    if (simulator.getState().nextSequence !== expectedSequence) return this.getSimulationState();
    const event = simulator.step();
    if (!event) return this.getSimulationState();
    const request = await this.loadCurrentRequest(event.occurredAt);

    try {
      if (event.type === "OFFER_OBSERVED") {
        const previousDecisions = await repository.listDecisionsForRun({
          requestId: request.id,
          requestVersion: request.version,
          runId,
        });
        const match = await matching.assess(request, event.offer);
        const evidence = await verification.verify(request, event.offer, event.evidence);
        const pricingSelection = pricing.select?.(request, [{ offer: event.offer, evidence }]);
        const landedCost = pricingSelection
          ? pricingSelection.selectedPath?.landedCost ?? null
          : await pricing.calculate(request, event.offer, evidence);
        const decision = await policy.evaluate({
          request,
          event,
          offer: event.offer,
          evidence,
          match,
          landedCost,
          ...(pricingSelection ? { pricingSelection } : {}),
          previousDecisions,
        });
        const committed = await repository.saveEvaluation(
          request,
          event,
          decision,
          expectedSequence,
        );
        if (!committed) {
          simulator.reset();
          recoverSimulator(simulator, await repository.listEvents(runId));
        }
      } else {
        const committed = await repository.saveEventIfCurrent(event, expectedSequence);
        if (!committed) {
          simulator.reset();
          recoverSimulator(simulator, await repository.listEvents(runId));
        }
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
    const request = await this.loadCurrentRequest();
    simulator.reset();
    await repository.resetToRequest(request);
    return this.getSimulationState();
  }

  private async loadCurrentRequest(effectiveAt?: string): Promise<ShoppingRequest> {
    const { initialRequest, repository } = this.dependencies;
    const fallback = this.activeRequest ?? initialRequest;
    const current = await repository.getCurrentRequest(fallback.id, effectiveAt);
    if (current) {
      this.activeRequest = current;
      return current;
    }
    await repository.saveRequest(fallback);
    const seeded = await repository.getCurrentRequest(fallback.id, effectiveAt);
    if (!seeded) throw new Error(`Could not load request ${fallback.id}.`);
    this.activeRequest = seeded;
    return seeded;
  }
}
