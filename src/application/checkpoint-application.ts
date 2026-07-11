import { SimulationStateSchema, type SimulationState } from "@/application/simulation-state";
import type { ShoppingRequest } from "@/domain/contracts";
import type {
  CheckpointRepository,
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
  repository: CheckpointRepository;
  matching: MatchService;
  verification: VerificationService;
  pricing: LandedCostCalculator;
  policy: PolicyEvaluator;
  receipts: ReceiptProjection;
}

export class CheckpointApplication {
  constructor(private readonly dependencies: CheckpointApplicationDependencies) {}

  async getSimulationState(): Promise<SimulationState> {
    const { request, runId, simulator, repository, receipts } = this.dependencies;
    const decisions = [...await repository.listDecisions(request.id)];
    const currentDecision = decisions.at(-1) ?? null;
    return SimulationStateSchema.parse({
      request,
      simulator: simulator.getState(),
      processedEvents: await repository.listEvents(runId),
      decisions,
      currentDecision,
      receipt: currentDecision ? {
        concise: receipts.concise(currentDecision),
        expanded: [...receipts.expanded(currentDecision)],
      } : null,
    });
  }

  async stepSimulation(): Promise<SimulationState> {
    const { request, simulator, repository, matching, verification, pricing, policy } = this.dependencies;
    await repository.saveRequest(request);
    const event = simulator.step();
    if (!event) return this.getSimulationState();
    await repository.saveEvent(event);

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
      await repository.saveDecision(decision);
    }

    return this.getSimulationState();
  }

  async resetSimulation(): Promise<SimulationState> {
    const { request, simulator, repository } = this.dependencies;
    simulator.reset();
    await repository.reset();
    await repository.saveRequest(request);
    return this.getSimulationState();
  }
}
