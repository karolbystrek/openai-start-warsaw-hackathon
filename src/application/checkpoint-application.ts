import { SimulationStateSchema, type SimulationState } from "@/application/simulation-state";
import { recoverSimulator } from "@/application/simulator-recovery";
import type { EvaluationRepository } from "@/application/evaluation-repository";
import type { ShoppingRequest } from "@/domain/contracts";
import type {
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
}

export class CheckpointApplication {
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(private readonly dependencies: CheckpointApplicationDependencies) {}

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
    const { initialRequest, simulator, repository } = this.dependencies;
    simulator.reset();
    await repository.resetToRequest(initialRequest);
    return this.getSimulationState();
  }

  private async loadCurrentRequest(effectiveAt?: string): Promise<ShoppingRequest> {
    const { initialRequest, repository } = this.dependencies;
    const current = await repository.getCurrentRequest(initialRequest.id, effectiveAt);
    if (current) return current;
    await repository.saveRequest(initialRequest);
    const seeded = await repository.getCurrentRequest(initialRequest.id, effectiveAt);
    if (!seeded) throw new Error(`Could not load request ${initialRequest.id}.`);
    return seeded;
  }
}
