import { ScenarioFixtureSchema, type ScenarioFixture } from "@/domain/contracts";

export interface ScenarioSummary {
  id: string;
  fixtureVersion: string;
  seed: string;
  eventCount: number;
}

export class FixtureScenarioSource {
  private readonly scenarios: ReadonlyMap<string, ScenarioFixture>;

  constructor(fixtures: readonly ScenarioFixture[]) {
    this.scenarios = new Map(fixtures.map((fixture) => {
      const parsed = ScenarioFixtureSchema.parse(fixture);
      const ordered = [...parsed.events].sort((left, right) => left.sequence - right.sequence);
      if (ordered.some((event, index) => event.sequence !== index)) throw new Error(`Scenario ${parsed.id} has a non-contiguous event sequence.`);
      if (ordered.some((event, index) => index > 0 && Date.parse(event.occurredAt) < Date.parse(ordered[index - 1]!.occurredAt))) throw new Error(`Scenario ${parsed.id} has events outside virtual-time order.`);
      return [parsed.id, parsed] as const;
    }));
    if (this.scenarios.size !== fixtures.length) throw new Error("Scenario IDs must be unique.");
  }

  list(): readonly ScenarioSummary[] {
    return [...this.scenarios.values()].map((scenario) => ({
      id: scenario.id,
      fixtureVersion: scenario.fixtureVersion,
      seed: scenario.seed,
      eventCount: scenario.events.length,
    }));
  }

  get(id: string): ScenarioFixture {
    const scenario = this.scenarios.get(id);
    if (!scenario) throw new Error(`Unknown scenario ${id}.`);
    return ScenarioFixtureSchema.parse(scenario);
  }
}
