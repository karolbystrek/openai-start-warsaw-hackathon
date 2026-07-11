"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { ShoppingRequest } from "@/domain/contracts";

type Action = "PAUSE" | "RESUME" | "REVOKE";

export function RequestControls({ request }: { request: ShoppingRequest }) {
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  const perform = async (action: Action) => {
    setPending(action);
    setError(null);
    try {
      const response = await fetch("/api/request/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not update the shopping request.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the shopping request.");
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="request-controls card">
      <div>
        <p className="card-label">Monitoring lifecycle</p>
        <h2>{request.lifecycle}</h2>
        <p>Request version {request.version}. Pausing or revoking immediately removes active purchase consent.</p>
      </div>
      <div className="request-actions">
        {request.lifecycle === "ACTIVE" ? (
          <button type="button" disabled={pending !== null} onClick={() => perform("PAUSE")}>
            {pending === "PAUSE" ? "Pausing…" : "Pause monitoring"}
          </button>
        ) : request.lifecycle === "PAUSED" ? (
          <button type="button" disabled={pending !== null} onClick={() => perform("RESUME")}>
            {pending === "RESUME" ? "Resuming…" : "Resume monitoring"}
          </button>
        ) : null}
        {request.lifecycle !== "REVOKED" ? (
          <button className="danger" type="button" disabled={pending !== null} onClick={() => perform("REVOKE")}>
            {pending === "REVOKE" ? "Revoking…" : "Revoke request"}
          </button>
        ) : null}
      </div>
      {error ? <p className="control-error" role="alert">{error}</p> : null}
    </section>
  );
}
