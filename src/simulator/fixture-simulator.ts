import type { SimulationEvent } from "@/domain/contracts";
import type { SimulatorControl } from "@/domain/services";

export class FixtureSimulator implements SimulatorControl {
  private cursor = 0;
  private currentEvent: SimulationEvent | null = null;
  private status: "PLAYING" | "PAUSED" | "COMPLETE" = "PAUSED";
  private speed = 1;

  constructor(
    private readonly events: readonly SimulationEvent[],
    private readonly startTime: string,
  ) {}

  play(): void {
    if (this.cursor < this.events.length) this.status = "PLAYING";
  }

  pause(): void {
    if (this.status !== "COMPLETE") this.status = "PAUSED";
  }

  step(): SimulationEvent | null {
    const event = this.events[this.cursor] ?? null;
    if (!event) {
      this.status = "COMPLETE";
      return null;
    }
    this.currentEvent = event;
    this.cursor += 1;
    this.status = this.cursor >= this.events.length ? "COMPLETE" : "PAUSED";
    return event;
  }

  reset(): void {
    this.cursor = 0;
    this.currentEvent = null;
    this.status = "PAUSED";
    this.speed = 1;
  }

  setSpeed(multiplier: number): void {
    if (!Number.isFinite(multiplier) || multiplier <= 0) throw new Error("Simulator speed must be positive.");
    this.speed = multiplier;
  }

  getState() {
    return {
      status: this.status,
      speed: this.speed,
      virtualTime: this.currentEvent?.occurredAt ?? this.startTime,
      currentEvent: this.currentEvent,
      nextSequence: this.cursor,
    };
  }
}
