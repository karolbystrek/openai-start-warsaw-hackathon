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
  scenarioRequests?: readonly ShoppingRequest[];
  scenarioResolver?: (request: ShoppingRequest) => {
    initialRequest: ShoppingRequest;
    runId: string;
    simulator: SimulatorControl;
  };
}

export class CheckpointApplication {
  private mutationTail: Promise<void> = Promise.resolve();
  private runtime: Pick<CheckpointApplicationDependencies, "initialRequest" | "runId" | "simulator">;

  constructor(private readonly dependencies: CheckpointApplicationDependencies) {
    this.runtime = {
      initialRequest: dependencies.initialRequest,
      runId: dependencies.runId,
      simulator: dependencies.simulator,
    };
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
    const { repository, receipts } = this.dependencies;
    const request = await this.loadCurrentRequest();
    const { runId, simulator } = this.runtime;
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

      const selected = this.dependencies.scenarioResolver?.(projected) ?? this.runtime;
      const { initialRequest, simulator } = selected;
      const { repository } = this.dependencies;
      const current = await repository.getCurrentRequest(initialRequest.id);
      const activated = ShoppingRequestSchema.parse({
        ...projected,
        id: initialRequest.id,
        version: (current?.version ?? 0) + 1,
        lifecycle: "ACTIVE",
        effectiveAt: initialRequest.effectiveAt,
      });
      simulator.reset();
      this.runtime = selected;
      await repository.resetToRequest(activated);
      return { interpretation, state: await this.getSimulationState() };
    });
  }

  async stepSimulation(expectedSequence: number): Promise<SimulationState> {
    return this.serializeMutation(() => this.stepSimulationOnce(expectedSequence));
  }

  private async stepSimulationOnce(expectedSequence: number): Promise<SimulationState> {
    const { repository, matching, verification, pricing, policy } = this.dependencies;
    await this.loadCurrentRequest();
    const { runId, simulator } = this.runtime;
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
    const { repository } = this.dependencies;
    const request = await this.loadCurrentRequest();
    const { simulator } = this.runtime;
    simulator.reset();
    await repository.resetToRequest(request);
    return this.getSimulationState();
  }

  private async loadCurrentRequest(effectiveAt?: string): Promise<ShoppingRequest> {
    const { initialRequest } = this.runtime;
    const { repository, scenarioRequests, scenarioResolver } = this.dependencies;
    const current = await repository.getCurrentRequest(initialRequest.id, effectiveAt);
    if (current) return current;

    if (scenarioResolver) {
      for (const scenarioRequest of scenarioRequests ?? []) {
        if (scenarioRequest.id === initialRequest.id) continue;
        const persisted = await repository.getCurrentRequest(scenarioRequest.id, effectiveAt);
        if (!persisted) continue;
        this.runtime = scenarioResolver(persisted);
        return persisted;
      }
    }

    await repository.saveRequest(initialRequest);
    const seeded = await repository.getCurrentRequest(initialRequest.id, effectiveAt);
    if (!seeded) throw new Error(`Could not load request ${initialRequest.id}.`);
    return seeded;
  }
}
