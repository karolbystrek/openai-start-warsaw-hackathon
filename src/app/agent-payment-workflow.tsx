"use client";

import { useState } from "react";

import { formatMoney } from "@/app/format-money";
import type { DecisionRecord, ShoppingRequest, SimulatedOrder } from "@/domain/contracts";

type AgentPaymentWorkflowProps = {
  request: ShoppingRequest;
  processedEventCount: number;
  latestEventId: string | null;
  decision: DecisionRecord | null;
};

type PaymentResponse = {
  order?: SimulatedOrder;
  alreadyPlaced?: boolean;
  error?: string;
};

const workflowCopy = [
  ["Understand", "Turn conversation into explicit hard requirements and preferences."],
  ["Match", "Reject the near-match and resolve the canonical target."],
  ["Verify", "Check seller, stock, condition, delivery, coupon, and full landed cost."],
  ["Decide", "Reject, escalate, or alert without reasoning around the hard cap."],
  ["Pay", "Require one-time UI consent, recheck the decision, then place a simulated order."],
] as const;

export function AgentPaymentWorkflow({ request, processedEventCount, latestEventId, decision }: AgentPaymentWorkflowProps) {
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [order, setOrder] = useState<SimulatedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dealReady = Boolean(
    decision
    && ["ALERT", "BUY_SIMULATED"].includes(decision.outcome)
    && decision.landedCost
    && decision.match.overall === "PASS"
    && decision.eventId === latestEventId
  );
  const completedThrough = order
    ? 6
    : dealReady
      ? 4
      : decision
        ? 3
        : processedEventCount > 0
          ? 2
          : request.lifecycle === "ACTIVE"
            ? 1
            : 0;
  const needsRecheck = Boolean(
    decision
    && ["ALERT", "BUY_SIMULATED"].includes(decision.outcome)
    && decision.eventId !== latestEventId,
  );

  const placePayment = async () => {
    if (!decision || !consent || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/payment/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId: decision.id, explicitConsent: true }),
      });
      const payload = await response.json() as PaymentResponse;
      if (!response.ok || !payload.order) throw new Error(payload.error ?? "Simulated payment failed.");
      setOrder(payload.order);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Simulated payment failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="agent-workflow card" aria-labelledby="workflow-title">
      <div className="section-heading">
        <div>
          <p className="card-label">Agent workflow</p>
          <h2 id="workflow-title">From request to simulated payment</h2>
        </div>
        <span className={`workflow-state ${order ? "paid" : dealReady ? "ready" : "running"}`}>
          {order ? "Order placed" : dealReady ? "Ready for consent" : "Agent working"}
        </span>
      </div>

      <ol className="workflow-steps">
        {workflowCopy.map(([title, description], index) => {
          const step = index + 1;
          const status = step < completedThrough ? "complete" : step === completedThrough ? "current" : "pending";
          return (
            <li className={status} key={title}>
              <span>{step < completedThrough ? "✓" : step}</span>
              <div><strong>{title}</strong><small>{description}</small></div>
            </li>
          );
        })}
      </ol>

      <div className="payment-overview">
        <div className="payment-explanation">
          <p className="card-label">What happens at checkout</p>
          <h3>No hidden autonomy</h3>
          <ul>
            <li>The agent uses the stored decision and exact landed-cost breakdown.</li>
            <li>Identity must be exact or a disclosed seeded mapping; every check must pass.</li>
            <li>Your click creates one scoped consent reference for this decision only.</li>
            <li>The result is a fake order receipt. No card, wallet, or real funds are used.</li>
          </ul>
        </div>

        <div className={`payment-card ${dealReady ? "available" : "locked"}`}>
          <div className="payment-card-heading">
            <div><span>Simulated checkout</span><strong>{request.product.brand} {request.product.model}</strong></div>
            <b>DEMO</b>
          </div>

          {order ? (
            <div className="payment-receipt" aria-live="polite">
              <span>Payment simulated</span>
              <strong>{formatMoney(order.paid.currency, order.paid.minorUnits)}</strong>
              <small>Order {order.id} · consent {order.mandateId}</small>
            </div>
          ) : decision?.landedCost && dealReady ? (
            <>
              <dl>
                <div><dt>Merchant</dt><dd>{decision.offer.merchantId}</dd></div>
                <div><dt>Delivered total</dt><dd>{formatMoney(decision.landedCost.total.currency, decision.landedCost.total.minorUnits)}</dd></div>
                <div><dt>Identity</dt><dd>{decision.match.method.replaceAll("_", " ")}</dd></div>
              </dl>
              <label className="payment-consent">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span>I authorize this one simulated order for the displayed total.</span>
              </label>
              <button type="button" onClick={() => void placePayment()} disabled={!consent || pending}>
                {pending ? "Rechecking…" : "Confirm simulated payment"}
              </button>
            </>
          ) : (
            <div className="payment-locked-copy">
              <strong>{needsRecheck ? "New evidence requires re-evaluation" : "Waiting for a valid deal"}</strong>
              <p>{needsRecheck
                ? "A merchant event arrived after the alert, so payment is blocked until the offer is evaluated again."
                : "Payment unlocks only after the matcher rejects variants and the trust core emits an eligible alert."}</p>
            </div>
          )}
          {error ? <p className="payment-error" role="alert">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
