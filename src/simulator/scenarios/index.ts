import { FixtureScenarioSource } from "@/simulator/scenario-source";
import { adversarialScenarios } from "@/simulator/scenarios/adversarial";
import { headlineScenario } from "@/simulator/scenarios/headline";

export const fixtureScenarioSource = new FixtureScenarioSource([
  headlineScenario,
  ...adversarialScenarios,
]);
