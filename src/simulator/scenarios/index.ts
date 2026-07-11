import { FixtureScenarioSource } from "@/simulator/scenario-source";
import type { ShoppingRequest } from "@/domain/contracts";
import { FixtureSimulator } from "@/simulator/fixture-simulator";
import { adversarialScenarios } from "@/simulator/scenarios/adversarial";
import { headlineScenario } from "@/simulator/scenarios/headline";
import { presentationProductScenarios } from "@/simulator/scenarios/presentation-products";

const curatedPresentationScenarios = [headlineScenario, ...presentationProductScenarios] as const;

export const presentationScenarioRequests = curatedPresentationScenarios.map((scenario) => scenario.request);

export const fixtureScenarioSource = new FixtureScenarioSource([
  headlineScenario,
  ...presentationProductScenarios,
  ...adversarialScenarios,
]);

export function resolvePresentationScenario(request: ShoppingRequest) {
  const normalizedBrand = request.product.brand.toLowerCase();
  const normalizedModel = request.product.model.toLowerCase();
  const scenario = curatedPresentationScenarios.find((candidate) => {
    const candidateBrand = candidate.request.product.brand.toLowerCase();
    const candidateModel = candidate.request.product.model.toLowerCase();
    return candidateBrand === normalizedBrand
      && (normalizedModel.includes(candidateModel) || candidateModel.includes(normalizedModel));
  });
  if (!scenario) {
    throw new Error("Only the three curated presentation products can activate monitoring.");
  }
  return {
    initialRequest: scenario.request,
    runId: scenario.id,
    simulator: new FixtureSimulator(scenario.events, scenario.virtualStartAt),
  };
}
