import type { SimulationEvent } from "@/domain/contracts";
import type { SimulatorControl } from "@/domain/services";

export class SimulatorRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimulatorRecoveryError";
  }
}

/**
 * Replays already persisted events into an in-memory simulator after a server
 * restart. SQLite remains the recovery source of truth; replay never evaluates
 * an offer or writes another decision.
 */
export function recoverSimulator(
  simulator: SimulatorControl,
  persistedEvents: readonly SimulationEvent[],
): void {
  let state = simulator.getState();

  if (persistedEvents.length === 0) {
    if (state.nextSequence > 0) simulator.reset();
    return;
  }

  if (state.nextSequence > persistedEvents.length) {
    throw new SimulatorRecoveryError(
      `Simulator cursor ${state.nextSequence} is ahead of ${persistedEvents.length} persisted events. Reset the scenario before continuing.`,
    );
  }

  while (state.nextSequence < persistedEvents.length) {
    const persisted = persistedEvents[state.nextSequence];
    const replayed = simulator.step();

    if (!persisted || !replayed || replayed.id !== persisted.id) {
      throw new SimulatorRecoveryError(
        `Fixture replay diverged at sequence ${state.nextSequence}. Reset the scenario before continuing.`,
      );
    }

    state = simulator.getState();
  }

  const expectedCurrentEvent = persistedEvents.at(-1);
  if (state.currentEvent?.id !== expectedCurrentEvent?.id) {
    throw new SimulatorRecoveryError(
      "Recovered simulator state does not match the latest persisted event.",
    );
  }
}
