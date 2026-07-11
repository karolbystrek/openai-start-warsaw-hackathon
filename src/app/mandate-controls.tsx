"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { formatMoney } from "@/app/format-money";
import type { Mandate, SimulatedOrder } from "@/domain/contracts";

export function MandateControls({
  currency,
  maximumLandedCostMinor,
  mandate,
  order,
  requestActive,
}: {
  currency: string;
  maximumLandedCostMinor: number;
  mandate: Mandate | null;
  order: SimulatedOrder | null;
  requestActive: boolean;
}) {
  const router = useRouter();
  const [consented, setConsented] = useState(false);
  const [pending, setPending] = useState<"confirm" | "revoke" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const minimumLandedCostMinor = Math.max(0, maximumLandedCostMinor - 500);

  const perform = async (action: "confirm" | "revoke") => {
    setPending(action);
    setError(null);
    try {
      const request: RequestInit = action === "confirm"
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              confirmed: true,
              minimumLandedCostMinor,
              maximumLandedCostMinor,
              requireLowStock: true,
            }),
          }
        : { method: "POST" };
      const response = await fetch(`/api/mandate/${action}`, request);
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `Could not ${action} the mandate.`);
      setConsented(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not ${action} the mandate.`);
    } finally {
      setPending(null);
    }
  };

  return (
    <section className={`mandate-card card ${mandate?.status.toLowerCase() ?? "inactive"}`}>
      <div className="section-heading">
        <div>
          <p className="card-label">Standing purchase consent</p>
          <h2>{mandate ? mandate.status : "Not authorized"}</h2>
        </div>
        <span className={`mandate-status ${mandate?.status.toLowerCase() ?? "inactive"}`}>
          {mandate ? `v${mandate.version}` : "Off"}
        </span>
      </div>

      {order ? (
        <div className="purchase-receipt">
          <strong>Simulated purchase placed</strong>
          <p>{formatMoney(order.paid.currency, order.paid.minorUnits)} paid for quantity {order.quantity}.</p>
          <dl>
            <div><dt>Order</dt><dd>{order.id}</dd></div>
            <div><dt>Offer</dt><dd>{order.offerId}</dd></div>
            <div><dt>Mandate</dt><dd>{order.mandateId}</dd></div>
          </dl>
        </div>
      ) : mandate?.status === "ACTIVE" ? (
        <>
          <p className="mandate-copy">
            Buy one item only when the landed cost is between {formatMoney(currency, minimumLandedCostMinor)} and {formatMoney(currency, maximumLandedCostMinor)}, stock is low, and every purchase-critical check passes.
          </p>
          <dl>
            <div><dt>Identity</dt><dd>Exact or seeded only</dd></div>
            <div><dt>Expires</dt><dd>{new Date(mandate.expiresAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</dd></div>
            <div><dt>Revocation</dt><dd>Immediate</dd></div>
          </dl>
          <button className="mandate-button secondary" type="button" disabled={pending !== null} onClick={() => perform("revoke")}>
            {pending === "revoke" ? "Revoking…" : "Revoke purchase consent"}
          </button>
        </>
      ) : !requestActive ? (
        <p className="mandate-copy">Purchase consent is unavailable while monitoring is paused or revoked.</p>
      ) : (
        <>
          <p className="mandate-copy">
            Optional: authorize one simulated purchase between {formatMoney(currency, minimumLandedCostMinor)} and {formatMoney(currency, maximumLandedCostMinor)} only when fresh evidence reports low stock.
          </p>
          <label className="consent-check">
            <input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} />
            <span>I explicitly authorize this scoped, one-time simulated purchase.</span>
          </label>
          <button className="mandate-button" type="button" disabled={!consented || pending !== null} onClick={() => perform("confirm")}>
            {pending === "confirm" ? "Activating…" : "Activate standing consent"}
          </button>
        </>
      )}
      {error ? <p className="control-error" role="alert">{error}</p> : null}
    </section>
  );
}
