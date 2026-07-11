"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { formatMoney } from "@/app/format-money";
import type { SimulationEvent } from "@/domain/contracts";

function eventName(event: SimulationEvent): string {
  switch (event.type) {
    case "OFFER_OBSERVED": return event.offer.title;
    case "STOCK_CHANGED": return `Stock update: ${event.stockState.replaceAll("_", " ").toLowerCase()}`;
    case "PRICE_CHANGED": return "Price and delivery update";
    case "COUPON_CHANGED": return `Coupon ${event.couponCode}: ${event.status.toLowerCase()}`;
    case "FX_CHANGED": return `${event.baseCurrency}/${event.quoteCurrency} exchange-rate update`;
    case "SELLER_CHANGED": return `Seller status: ${event.status.toLowerCase()}`;
  }
}

function eventSummary(event: SimulationEvent): string {
  switch (event.type) {
    case "OFFER_OBSERVED": {
      const price = formatMoney(event.offer.itemPrice.currency, event.offer.itemPrice.minorUnits);
      const delivery = formatMoney(event.offer.deliveryPrice.currency, event.offer.deliveryPrice.minorUnits);
      return `${event.offer.merchantId} · ${price} + ${delivery} delivery`;
    }
    case "STOCK_CHANGED": return event.quantityAvailable === null
      ? "The merchant changed product availability."
      : `${event.quantityAvailable} items reported available.`;
    case "PRICE_CHANGED": return `${formatMoney(event.itemPrice.currency, event.itemPrice.minorUnits)} + ${formatMoney(event.deliveryPrice.currency, event.deliveryPrice.minorUnits)} delivery`;
    case "COUPON_CHANGED": return "The engine will recheck coupon eligibility and landed cost.";
    case "FX_CHANGED": return `New deterministic rate: ${event.rate}`;
    case "SELLER_CHANGED": return "The engine will recheck seller legitimacy.";
  }
}

export function SimulatorControls({
  availableEvents,
  complete,
  nextSequence,
  requestActive,
}: {
  availableEvents: readonly SimulationEvent[];
  complete: boolean;
  nextSequence: number;
  requestActive: boolean;
}) {
  const router = useRouter();
  const nextEvent = availableEvents[nextSequence] ?? null;
  const [selectedId, setSelectedId] = useState(nextEvent?.id ?? availableEvents[0]?.id ?? "");
  const [pending, setPending] = useState<"send" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(
    () => availableEvents.find((event) => event.id === selectedId) ?? nextEvent,
    [availableEvents, nextEvent, selectedId],
  );

  const perform = async (action: "send" | "reset") => {
    setPending(action);
    setError(null);
    try {
      const response = await fetch(action === "send" ? "/api/simulation/step" : "/api/simulation/reset", action === "send"
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expectedSequence: nextSequence, expectedEventId: selected?.id }),
          }
        : { method: "POST" });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? `Simulation ${action} failed.`);
      const following = availableEvents[nextSequence + 1];
      if (action === "send" && following) setSelectedId(following.id);
      if (action === "reset" && availableEvents[0]) setSelectedId(availableEvents[0].id);
      router.refresh();
    } catch (cause) {
      console.error(cause);
      setError(cause instanceof Error
        ? cause.message
        : `Could not ${action} the event. The saved state is unchanged; try again.`);
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="event-console card" aria-labelledby="available-events-title">
      <div className="section-heading">
        <div>
          <p className="card-label">Demo controls</p>
          <h2 id="available-events-title">Send a product update</h2>
          <p className="event-console-copy">Choose from the preconfigured merchant events. They run in order so every engine reaction is reproducible.</p>
        </div>
        <button className="event-reset" type="button" onClick={() => perform("reset")} disabled={pending !== null}>
          {pending === "reset" ? "Resetting…" : "Reset events"}
        </button>
      </div>

      <div className="event-picker">
        <ol className="event-options">
          {availableEvents.map((event, index) => {
            const status = index < nextSequence ? "sent" : index === nextSequence ? "ready" : "queued";
            return (
              <li key={event.id}>
                <button
                  className={`event-option ${selected?.id === event.id ? "selected" : ""}`}
                  type="button"
                  onClick={() => setSelectedId(event.id)}
                  aria-pressed={selected?.id === event.id}
                >
                  <span className={`event-status ${status}`}>{status}</span>
                  <strong>{eventName(event)}</strong>
                  <small>{eventSummary(event)}</small>
                </button>
              </li>
            );
          })}
        </ol>

        <aside className="event-preview">
          <p className="card-label">Selected event</p>
          {selected ? (
            <>
              <h3>{eventName(selected)}</h3>
              <p>{eventSummary(selected)}</p>
              {selected.type === "OFFER_OBSERVED" ? (
                <dl>
                  <div><dt>Product</dt><dd>{selected.offer.attributes.model ?? "Unknown"}</dd></div>
                  <div><dt>Size</dt><dd>{selected.offer.attributes.size ?? "Unknown"}</dd></div>
                  <div><dt>Condition</dt><dd>{selected.offer.attributes.condition ?? "Unknown"}</dd></div>
                </dl>
              ) : null}
              <button
                className="send-event"
                type="button"
                onClick={() => perform("send")}
                disabled={pending !== null || complete || !requestActive || selected.id !== nextEvent?.id}
              >
                {pending === "send"
                  ? "Sending and evaluating…"
                  : complete
                    ? "All events sent"
                    : !requestActive
                      ? "Start monitoring first"
                      : selected.id !== nextEvent?.id
                        ? "This event is not ready yet"
                        : "Send event to engine"}
              </button>
            </>
          ) : <p className="empty">No event selected.</p>}
        </aside>
      </div>
      {error ? <p className="control-error" role="alert">{error}</p> : null}
    </section>
  );
}
