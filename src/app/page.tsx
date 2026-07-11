import { checkpointApplication } from "@/application/container";
import { BriefIntake } from "@/app/brief-intake";
import { SimulatorControls } from "@/app/simulator-controls";

export const dynamic = "force-dynamic";

const formatMoney = (currency: string, minorUnits: number) => `${currency} ${(minorUnits / 100).toFixed(2)}`;

const eventTitle = (event: Awaited<ReturnType<typeof checkpointApplication.getSimulationState>>["processedEvents"][number]) => {
  switch (event.type) {
    case "OFFER_OBSERVED": return event.offer.title;
    case "STOCK_CHANGED": return `Stock changed to ${event.stockState.replaceAll("_", " ").toLowerCase()}`;
    case "PRICE_CHANGED": return "Merchant price changed";
    case "COUPON_CHANGED": return `Coupon changed to ${event.status.toLowerCase()}`;
    case "FX_CHANGED": return `${event.baseCurrency}/${event.quoteCurrency} FX changed`;
    case "SELLER_CHANGED": return `Seller changed to ${event.status.toLowerCase()}`;
  }
};

export default async function Home() {
  const state = await checkpointApplication.getSimulationState();
  const decision = state.currentDecision;
  const event = state.simulator.currentEvent;

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">Integrated deterministic runtime</p>
          <h1>AI Shopping Assistant</h1>
          <p className="lede">A real interpreted brief and staged product match, evaluated against repeatable simulated merchant evidence.</p>
        </div>
        <div className="clock">
          <span>Virtual time</span>
          <strong>{new Date(state.simulator.virtualTime).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</strong>
          <small>{state.simulator.status}</small>
        </div>
      </header>

      <BriefIntake initialText={state.request.originalText} />

      <SimulatorControls
        complete={state.simulator.status === "COMPLETE"}
        nextSequence={state.simulator.nextSequence}
      />

      <section className="grid">
        <article className="card request-card">
          <p className="card-label">Shopping request</p>
          <h2>{state.request.product.brand} {state.request.product.model}</h2>
          <p className="brief">“{state.request.originalText}”</p>
          <dl>
            <div><dt>Required size</dt><dd>{state.request.requirements.size}</dd></div>
            <div><dt>Condition</dt><dd>{state.request.requirements.condition}</dd></div>
            <div><dt>Destination</dt><dd>{state.request.requirements.destinationCountry}</dd></div>
            <div><dt>Hard cap</dt><dd>{formatMoney(state.request.requirements.maximumLandedCost.currency, state.request.requirements.maximumLandedCost.minorUnits)}</dd></div>
          </dl>
        </article>

        <article className="card">
          <p className="card-label">Current merchant event</p>
          {event?.type === "OFFER_OBSERVED" ? (
            <>
              <h2>{event.offer.title}</h2>
              <dl>
                <div><dt>Merchant</dt><dd>{event.offer.merchantId}</dd></div>
                <div><dt>Sticker price</dt><dd>{formatMoney(event.offer.itemPrice.currency, event.offer.itemPrice.minorUnits)}</dd></div>
                <div><dt>Event</dt><dd>#{event.sequence + 1}</dd></div>
              </dl>
            </>
          ) : <p className="empty">Step the simulator to load the first validated offer.</p>}
        </article>

        <article className="card match-card">
          <p className="card-label">Person B · product identity</p>
          {decision ? (
            <>
              <div className="section-heading compact">
                <h2>{decision.match.method.replaceAll("_", " ")}</h2>
                <span className={`status-pill ${decision.match.overall.toLowerCase()}`}>{decision.match.overall}</span>
              </div>
              {decision.match.canonicalProductId ? <p className="canonical-id">Canonical: {decision.match.canonicalProductId}</p> : null}
              <ol className="match-stages">
                {decision.match.stages?.map((stage) => (
                  <li key={stage.stage}>
                    <span className={stage.result.toLowerCase()}>{stage.result}</span>
                    <div><strong>{stage.stage.replaceAll("_", " ")}</strong><small>{stage.evidence[0]}</small></div>
                  </li>
                ))}
              </ol>
              <small>{decision.match.provenance.kind} · {decision.match.provenance.source}</small>
            </>
          ) : <p className="empty">The staged catalog match and evidence trace appear after an offer is observed.</p>}
        </article>

        <article className={`card decision-card ${decision ? decision.outcome.toLowerCase() : ""}`}>
          <p className="card-label">Decision</p>
          {decision ? (
            <>
              <h2 data-testid="decision-outcome">{decision.outcome}</h2>
              <p className="reason">{decision.primaryReason}</p>
              <p className={`provenance-badge ${decision.provenance.kind.toLowerCase()}`}>
                {decision.provenance.kind} · {decision.provenance.source}
              </p>
              <ul className="checks">
                {decision.requirements.map((requirement) => (
                  <li key={requirement.requirement}><span className={requirement.result.toLowerCase()}>{requirement.result}</span>{requirement.requirement}</li>
                ))}
              </ul>
            </>
          ) : <p className="empty">No decision has been emitted.</p>}
        </article>

        <article className="card">
          <p className="card-label">Landed cost</p>
          {decision ? (
            <>
              <ul className="cost-lines">
                {decision.landedCost.lines.map((line, index) => (
                  <li key={`${line.code}-${index}`}><span>{line.label}</span><strong>{formatMoney(line.amount.currency, line.amount.minorUnits)}</strong></li>
                ))}
              </ul>
              <div className="total"><span>Total delivered</span><strong>{formatMoney(decision.landedCost.total.currency, decision.landedCost.total.minorUnits)}</strong></div>
              <small>{decision.landedCost.ruleVersion} · {decision.landedCost.provenance.kind}</small>
            </>
          ) : <p className="empty">The authoritative cost projection appears with a decision.</p>}
        </article>
      </section>

      <section className="timeline card">
        <div className="section-heading">
          <div><p className="card-label">Person B · simulator evidence</p><h2>Processed event timeline</h2></div>
          <span className="event-count">{state.processedEvents.length} / 5 events</span>
        </div>
        {state.processedEvents.length ? (
          <ol>
            {state.processedEvents.map((processed) => {
              const eventDecision = state.decisions.find((item) => item.eventId === processed.id);
              return (
                <li key={processed.id}>
                  <span className="sequence">{processed.sequence + 1}</span>
                  <div><strong>{eventTitle(processed)}</strong><small>{processed.type.replaceAll("_", " ")} · {new Date(processed.occurredAt).toLocaleTimeString("en-GB", { timeZone: "UTC" })} UTC</small></div>
                  {eventDecision ? <span className={`outcome ${eventDecision.outcome.toLowerCase()}`}>{eventDecision.outcome}</span> : <span className="evidence-only">Evidence only</span>}
                </li>
              );
            })}
          </ol>
        ) : <p className="empty">No merchant evidence has been processed yet.</p>}
      </section>

      <section className="receipt card">
        <p className="card-label">Decision receipt</p>
        {state.receipt ? (
          <>
            <h2>{state.receipt.concise}</h2>
            <details>
              <summary>Audit details</summary>
              <ul>{state.receipt.expanded.map((line) => <li key={line}>{line}</li>)}</ul>
            </details>
          </>
        ) : <p className="empty">A receipt will be projected from the same structured decision record.</p>}
      </section>
    </main>
  );
}
