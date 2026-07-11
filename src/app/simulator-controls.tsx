"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SimulatorControls({ complete }: { complete: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<"step" | "reset" | null>(null);

  const perform = async (action: "step" | "reset") => {
    setPending(action);
    try {
      const response = await fetch(`/api/simulation/${action}`, { method: "POST" });
      if (!response.ok) throw new Error(`Simulation ${action} failed.`);
      router.refresh();
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="controls" aria-label="Simulation controls">
      <button type="button" onClick={() => perform("step")} disabled={pending !== null || complete}>
        {pending === "step" ? "Stepping…" : complete ? "Scenario complete" : "Step event"}
      </button>
      <button className="secondary" type="button" onClick={() => perform("reset")} disabled={pending !== null}>
        {pending === "reset" ? "Resetting…" : "Reset"}
      </button>
    </div>
  );
}
