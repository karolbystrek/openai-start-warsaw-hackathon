import type { SimulationEvent } from "@/domain/contracts";
import type { SimulatorControl } from "@/domain/services";

export class FixtureSimulator implements SimulatorControl {
  private cursor = 0;
  private currentEvent: SimulationEvent | null = null;
  private status: "PLAYING" | "PAUSED" | "COMPLETE" = "PAUSED";
  private speed = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<(event: SimulationEvent) => void>();

  constructor(
    private readonly events: readonly SimulationEvent[],
    private readonly startTime: string,
  ) {}

  play(): void {
    if (this.cursor >= this.events.length) {
      this.status = "COMPLETE";
      return;
    }
    this.status = "PLAYING";
    this.scheduleNext();
  }

  pause(): void {
    this.clearTimer();
    if (this.status !== "COMPLETE") this.status = "PAUSED";
  }

  step(): SimulationEvent | null {
    this.clearTimer();
    const event = this.events[this.cursor] ?? null;
    if (!event) {
      this.status = "COMPLETE";
      return null;
    }
    this.currentEvent = event;
    this.cursor += 1;
    this.status = this.cursor >= this.events.length ? "COMPLETE" : "PAUSED";
    for (const listener of this.listeners) listener(event);
    return event;
  }

  reset(): void {
    this.clearTimer();
    this.cursor = 0;
    this.currentEvent = null;
    this.status = "PAUSED";
    this.speed = 1;
  }

  setSpeed(multiplier: number): void {
    if (!Number.isFinite(multiplier) || multiplier <= 0) throw new Error("Simulator speed must be positive.");
    this.speed = multiplier;
    if (this.status === "PLAYING") {
      this.clearTimer();
      this.scheduleNext();
    }
  }

  getState() {
    return {
      status: this.status,
      speed: this.speed,
      virtualTime: this.currentEvent?.occurredAt ?? this.startTime,
      currentEvent: this.currentEvent,
      nextSequence: this.cursor,
      totalEvents: this.events.length,
    };
  }

  subscribe(listener: (event: SimulationEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private scheduleNext(): void {
    if (this.status !== "PLAYING" || this.timer) return;
    const next = this.events[this.cursor];
    if (!next) {
      this.status = "COMPLETE";
      return;
    }
    const currentTime = this.currentEvent?.occurredAt ?? this.startTime;
    const virtualDelay = Math.max(0, Date.parse(next.occurredAt) - Date.parse(currentTime));
    this.timer = setTimeout(() => {
      this.timer = null;
      const event = this.events[this.cursor] ?? null;
      if (!event) {
        this.status = "COMPLETE";
        return;
      }
      this.currentEvent = event;
      this.cursor += 1;
      for (const listener of this.listeners) listener(event);
      if (this.cursor >= this.events.length) this.status = "COMPLETE";
      else this.scheduleNext();
    }, virtualDelay / this.speed);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
