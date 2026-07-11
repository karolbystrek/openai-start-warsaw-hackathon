import type {
  DecisionRecord,
  EvidenceBundle,
  LandedCost,
  Mandate,
  MatchAssessment,
  OfferSnapshot,
  PricingSelection,
  ShoppingRequest,
  ShoppingBriefInterpretation,
  SimulatedOrder,
  SimulationEvent,
} from "@/domain/contracts";

export interface BriefInterpreter {
  interpret(sourceText: string): Promise<ShoppingBriefInterpretation>;
}

export interface ConfirmedBriefProjector {
  project(interpretation: ShoppingBriefInterpretation): ShoppingRequest | null;
}

export interface MatchService {
  assess(request: ShoppingRequest, offer: OfferSnapshot): Promise<MatchAssessment>;
}

export interface VerificationService {
  verify(request: ShoppingRequest, offer: OfferSnapshot, evidence: EvidenceBundle): Promise<EvidenceBundle>;
}

export interface LandedCostCalculator {
  calculate(request: ShoppingRequest, offer: OfferSnapshot, evidence: EvidenceBundle): Promise<LandedCost>;
  select?(request: ShoppingRequest, inputs: readonly {
    offer: OfferSnapshot;
    evidence: EvidenceBundle;
    sellerTrustRank?: number;
    preferredDeliveryMethods?: readonly string[];
  }[], fxQuoteOverrides?: readonly {
    baseCurrency: string;
    quoteCurrency: string;
    rate: string;
    observedAt: string;
  }[]): PricingSelection;
}

export interface PolicyEvaluator {
  evaluate(input: {
    request: ShoppingRequest;
    event: SimulationEvent;
    offer: OfferSnapshot;
    evidence: EvidenceBundle;
    match: MatchAssessment;
    landedCost: LandedCost | null;
    pricingSelection?: PricingSelection;
    mandate?: Mandate | null;
    previousDecisions?: readonly DecisionRecord[];
  }): Promise<DecisionRecord>;
}

export interface ReceiptProjection {
  concise(decision: DecisionRecord): string;
  expanded(decision: DecisionRecord): readonly string[];
}

export interface Clock {
  now(): string;
}

export interface SimulatorControl {
  play(): void;
  pause(): void;
  step(): SimulationEvent | null;
  reset(): void;
  setSpeed(multiplier: number): void;
  getState(): {
    status: "PLAYING" | "PAUSED" | "COMPLETE";
    speed: number;
    virtualTime: string;
    currentEvent: SimulationEvent | null;
    nextSequence: number;
    totalEvents: number;
  };
  subscribe(listener: (event: SimulationEvent) => void): () => void;
}

export interface CheckpointRepository {
  reset(): Promise<void>;
  saveRequest(request: ShoppingRequest): Promise<void>;
  getRequest(id: string, version: number): Promise<ShoppingRequest | null>;
  saveEvent(event: SimulationEvent): Promise<void>;
  listEvents(runId: string): Promise<readonly SimulationEvent[]>;
  saveDecision(decision: DecisionRecord): Promise<void>;
  listDecisions(requestId: string): Promise<readonly DecisionRecord[]>;
  saveMandate(mandate: Mandate): Promise<void>;
  getCurrentMandate(requestId: string, requestVersion: number, effectiveAt?: string): Promise<Mandate | null>;
  saveOrder(order: SimulatedOrder): Promise<void>;
  listOrders(requestId: string): Promise<readonly SimulatedOrder[]>;
  getOrderByDecision(decisionId: string): Promise<SimulatedOrder | null>;
}
