"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SimulatorControls({
  complete,
  nextSequence,
}: {
  complete: boolean;
  nextSequence: number;
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
      if (!response.ok) throw new Error(`Simulation ${action} failed.`);
      router.refresh();
    } catch (cause) {
      console.error(cause);
      setError(`Could not ${action} the scenario. The saved state is unchanged; try again.`);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="control-area">
      <div className="controls" aria-label="Simulation controls">
        <button type="button" onClick={() => perform("step")} disabled={pending !== null || complete}>
          {pending === "step" ? "Stepping…" : complete ? "Scenario complete" : "Step event"}
        </button>
        <button className="secondary" type="button" onClick={() => perform("reset")} disabled={pending !== null}>
          {pending === "reset" ? "Resetting…" : "Reset"}
        </button>
      </div>
      {error ? <p className="control-error" role="alert">{error}</p> : null}
    </div>
  );
}
