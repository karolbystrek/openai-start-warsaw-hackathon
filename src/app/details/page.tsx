import Link from "next/link";

import { checkpointApplication } from "@/application/container";
import { AgentPaymentWorkflow } from "@/app/agent-payment-workflow";
import { formatMoney } from "@/app/format-money";
import { SimulatorControls } from "@/app/simulator-controls";
import type { DecisionOutcome, SimulationEvent } from "@/domain/contracts";

export const dynamic = "force-dynamic";

function eventTitle(event: SimulationEvent): string {
  switch (event.type) {
    case "OFFER_OBSERVED": return event.offer.title;
    case "STOCK_CHANGED": return `Stock changed to ${event.stockState.replaceAll("_", " ").toLowerCase()}`;
    case "PRICE_CHANGED": return "Merchant price and delivery changed";
    case "COUPON_CHANGED": return `Coupon ${event.couponCode} is ${event.status.toLowerCase()}`;
    case "FX_CHANGED": return `${event.baseCurrency}/${event.quoteCurrency} exchange rate changed`;
    case "SELLER_CHANGED": return `Seller changed to ${event.status.toLowerCase()}`;
  }
}

function outcomeTitle(outcome: DecisionOutcome): string {
  switch (outcome) {
    case "ALERT": return "Valid deal — notify the user";
    case "BUY_SIMULATED": return "Valid deal — simulated purchase completed";
    case "REJECT": return "Offer rejected — keep monitoring";
    case "ESCALATE": return "More information is needed";
    case "IGNORE": return "No user notification needed";
  }
}

function reasonLabel(reason: string): string {
  return reason.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}

export default async function Details() {
  const state = await checkpointApplication.getSimulationState();
  const decision = state.currentDecision;
  const event = state.simulator.currentEvent;

  return (
    <main className="details-page">
      <header className="hero compact-hero">
        <div>
          <Link className="back-link" href="/">← Back to chat</Link>
          <p className="eyebrow">Monitoring demo</p>
          <h1>Event lab</h1>
          <p className="lede">Send a known merchant update, inspect what the engine received, and see exactly how it reacted.</p>
        </div>
        <div className="clock">
          <span>Monitoring</span>
          <strong>{state.request.lifecycle}</strong>
          <small>{state.processedEvents.length} of {state.simulator.totalEvents} events sent</small>
        </div>
      </header>

      <section className="request-strip card">
        <div>
          <p className="card-label">User is looking for</p>
          <h2>{state.request.product.brand} {state.request.product.model}</h2>
        </div>
        <dl>
          <div><dt>Size</dt><dd>{state.request.requirements.size}</dd></div>
          <div><dt>Condition</dt><dd>{state.request.requirements.condition}</dd></div>
          <div><dt>Delivered to</dt><dd>{state.request.requirements.destinationCountry}</dd></div>
          <div><dt>Maximum total</dt><dd>{formatMoney(state.request.requirements.maximumLandedCost.currency, state.request.requirements.maximumLandedCost.minorUnits)}</dd></div>
        </dl>
      </section>

      <SimulatorControls
        availableEvents={state.availableEvents}
        complete={state.simulator.status === "COMPLETE"}
        nextSequence={state.simulator.nextSequence}
        requestActive={state.request.lifecycle === "ACTIVE"}
      />

      <section className="reaction-grid">
        <article className="card event-received-card">
          <p className="card-label">1 · Event received</p>
          {event ? (
            <>
              <h2>{eventTitle(event)}</h2>
              {event.type === "OFFER_OBSERVED" ? (
                <dl>
                  <div><dt>Merchant</dt><dd>{event.offer.merchantId}</dd></div>
                  <div><dt>Item price</dt><dd>{formatMoney(event.offer.itemPrice.currency, event.offer.itemPrice.minorUnits)}</dd></div>
                  <div><dt>Delivery</dt><dd>{formatMoney(event.offer.deliveryPrice.currency, event.offer.deliveryPrice.minorUnits)}</dd></div>
                  <div><dt>Listed variant</dt><dd>{event.offer.attributes.model} · {event.offer.attributes.size}</dd></div>
                </dl>
              ) : (
                <p className="brief">The engine used this update to re-evaluate the latest matching offer.</p>
              )}
            </>
          ) : <p className="empty">Send the first event above to begin.</p>}
        </article>

        <article className={`card engine-reaction-card ${decision ? decision.outcome.toLowerCase() : ""}`}>
          <p className="card-label">2 · Engine reaction</p>
          {decision ? (
            <>
              <span className={`reaction-outcome ${decision.outcome.toLowerCase()}`}>{decision.outcome}</span>
              <h2>{outcomeTitle(decision.outcome)}</h2>
              <p className="reaction-reason">{reasonLabel(decision.primaryReason)}</p>
              <ul className="plain-checks">
                {decision.requirements
                  .filter((requirement) => [
                    "identity",
                    "size",
                    "condition",
                    "seller",
                    "stock",
                    "destination",
                    "landed-cost-cap",
                  ].includes(requirement.requirement))
                  .map((requirement) => (
                  <li key={requirement.requirement}>
                    <span className={requirement.result.toLowerCase()}>{requirement.result === "PASS" ? "✓" : requirement.result === "FAIL" ? "×" : "?"}</span>
                    <div><strong>{reasonLabel(requirement.requirement)}</strong><small>{requirement.explanation}</small></div>
                  </li>
                  ))}
              </ul>
            </>
          ) : <p className="empty">The engine decision will appear here.</p>}
        </article>

        <article className="card cost-card">
          <p className="card-label">3 · True delivered price</p>
          {decision?.landedCost ? (
            <>
              <ul className="cost-lines">
                {decision.landedCost.lines.map((line, index) => (
                  <li key={`${line.code}-${index}`}><span>{line.label}</span><strong>{formatMoney(line.amount.currency, line.amount.minorUnits)}</strong></li>
                ))}
              </ul>
              <div className="total"><span>Total delivered</span><strong>{formatMoney(decision.landedCost.total.currency, decision.landedCost.total.minorUnits)}</strong></div>
            </>
          ) : <p className="empty">A full cost appears when the offer has a valid pricing path.</p>}
        </article>
      </section>

      <AgentPaymentWorkflow
        key={decision?.id ?? state.request.id}
        request={state.request}
        processedEventCount={state.processedEvents.length}
        latestEventId={state.processedEvents.at(-1)?.id ?? null}
        decision={decision}
      />

      <section className="timeline card">
        <div className="section-heading">
          <div><p className="card-label">History</p><h2>Events and reactions</h2></div>
          <span className="event-count">{state.processedEvents.length} / {state.simulator.totalEvents}</span>
        </div>
        {state.processedEvents.length ? (
          <ol>
            {state.processedEvents.map((processed) => {
              const eventDecision = state.decisions.find((item) => item.eventId === processed.id);
              return (
                <li key={processed.id}>
                  <span className="sequence">{processed.sequence + 1}</span>
                  <div><strong>{eventTitle(processed)}</strong><small>{new Date(processed.occurredAt).toLocaleTimeString("en-GB", { timeZone: "UTC" })} UTC</small></div>
                  {eventDecision ? <span className={`outcome ${eventDecision.outcome.toLowerCase()}`}>{eventDecision.outcome}</span> : <span className="evidence-only">Evidence only</span>}
                </li>
              );
            })}
          </ol>
        ) : <p className="empty">No merchant events have been sent yet.</p>}
      </section>

      {decision && state.receipt ? (
        <details className="technical-details card">
          <summary>Technical audit details</summary>
          <div className="technical-details-body">
            <p><strong>Product match:</strong> {reasonLabel(decision.match.method)} · {decision.match.overall}</p>
            <p><strong>Decision source:</strong> {decision.provenance.kind} · {decision.provenance.source}</p>
            <ul>{state.receipt.expanded.map((line) => <li key={line}>{line}</li>)}</ul>
          </div>
        </details>
      ) : null}
    </main>
  );
}
