"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SimulatorControls({
  complete,
  nextSequence,
  requestActive,
}: {
  complete: boolean;
  nextSequence: number;
  requestActive: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"step" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const perform = async (action: "step" | "reset") => {
    setPending(action);
    setError(null);
    try {
      const request: RequestInit = action === "step"
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expectedSequence: nextSequence }),
          }
        : { method: "POST" };
      const response = await fetch(`/api/simulation/${action}`, request);
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? `Simulation ${action} failed.`);
      router.refresh();
    } catch (cause) {
      console.error(cause);
      setError(cause instanceof Error
        ? cause.message
        : `Could not ${action} the scenario. The saved state is unchanged; try again.`);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="control-area">
      <div className="controls" aria-label="Simulation controls">
        <button type="button" onClick={() => perform("step")} disabled={pending !== null || complete || !requestActive}>
          {pending === "step" ? "Stepping…" : complete ? "Scenario complete" : !requestActive ? "Monitoring inactive" : "Step event"}
        </button>
        <button className="secondary" type="button" onClick={() => perform("reset")} disabled={pending !== null}>
          {pending === "reset" ? "Resetting…" : "Reset"}
        </button>
      </div>
      {error ? <p className="control-error" role="alert">{error}</p> : null}
    </div>
  );
}
