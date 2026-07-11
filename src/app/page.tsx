import { checkpointApplication } from "@/application/container";
import { SimulatorControls } from "@/app/simulator-controls";

export const dynamic = "force-dynamic";

const formatMoney = (currency: string, minorUnits: number) => `${currency} ${(minorUnits / 100).toFixed(2)}`;

export default async function Home() {
  const state = await checkpointApplication.getSimulationState();
  const decision = state.currentDecision;
  const event = state.simulator.currentEvent;

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">Checkpoint 1 · deterministic fixture</p>
          <h1>AI Shopping Assistant</h1>
          <p className="lede">One shared contract from simulated merchant evidence to an auditable decision.</p>
        </div>
        <div className="clock">
          <span>Virtual time</span>
          <strong>{new Date(state.simulator.virtualTime).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</strong>
          <small>{state.simulator.status}</small>
        </div>
      </header>

      <SimulatorControls complete={state.simulator.status === "COMPLETE"} />

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
                <div><dt>Sequence</dt><dd>{event.sequence + 1} / 2</dd></div>
              </dl>
            </>
          ) : <p className="empty">Step the simulator to load the first validated offer.</p>}
        </article>

        <article className={`card decision-card ${decision ? decision.outcome.toLowerCase() : ""}`}>
          <p className="card-label">Decision</p>
          {decision ? (
            <>
              <h2 data-testid="decision-outcome">{decision.outcome}</h2>
              <p className="reason">{decision.primaryReason}</p>
              <p className="stub-badge">STUB · {decision.provenance.source}</p>
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
