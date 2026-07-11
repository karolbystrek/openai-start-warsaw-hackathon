"use client";

import { useState } from "react";

type Choice = "NONE" | "BUY_NOW" | "WAIT" | "MONITOR_BOTH";

const opportunities = {
  shoes: {
    current: { merchant: "Zalando", domain: "zalando.pl", price: "€76.40", note: "In stock · EU 43 · Black and white" },
    future: { merchant: "Nike", domain: "nike.com", price: "€61.12", saving: "€15.28", days: 10, evidence: "Confirmed account promotion fixture" },
  },
  macbook: {
    current: { merchant: "Media Expert", domain: "mediaexpert.pl", price: "5,299 PLN · €1,238.00 delivered", note: "M3 · 16 GB · 512 GB · Silver" },
    future: null,
  },
  vase: {
    current: { merchant: "Iittala", domain: "iittala.com", price: "€128.00 delivered", note: "160 mm · Clear glass · Official store" },
    future: null,
  },
} as const;

export function MerchantOpportunity({ productId, requestId }: { productId: keyof typeof opportunities; requestId: string }) {
  const data = opportunities[productId];
  const storageKey = `shopping-opportunity:${requestId}`;
  const [choice, setChoiceState] = useState<Choice>(() => {
    try { return (localStorage.getItem(storageKey) as Choice | null) ?? "NONE"; } catch { return "NONE"; }
  });
  const [promotionActive, setPromotionActive] = useState(false);

  const setChoice = (next: Choice) => {
    try { localStorage.setItem(storageKey, next); } catch { /* storage is optional */ }
    setChoiceState(next);
  };

  return (
    <section className="merchant-opportunity" aria-labelledby={`merchant-opportunity-${requestId}`}>
      <div className="merchant-opportunity-heading">
        <div>
          <p className="opportunity-label">Merchant intelligence</p>
          <h2 id={`merchant-opportunity-${requestId}`}>Best verified place to buy</h2>
        </div>
        <span className="evidence-chip">Deterministic demo data</span>
      </div>

      <div className={`merchant-comparison ${data.future ? "has-future" : ""}`}>
        <article className="merchant-card current">
          <span>Available now</span>
          <strong>{data.current.merchant}</strong>
          <small>{data.current.domain}</small>
          <b>{data.current.price}</b>
          <p>{data.current.note}</p>
        </article>
        {data.future ? (
          <article className={`merchant-card future ${promotionActive ? "active" : ""}`}>
            <span>{promotionActive ? "Promotion active" : `In ${data.future.days} days`}</span>
            <strong>{data.future.merchant}</strong>
            <small>{data.future.domain}</small>
            <b>{data.future.price}</b>
            <p>{promotionActive ? `Rechecked now · save ${data.future.saving}` : `${data.future.evidence} · potential saving ${data.future.saving}`}</p>
          </article>
        ) : null}
      </div>

      {data.future && !promotionActive ? (
        <div className="opportunity-actions three">
          <button className={choice === "BUY_NOW" ? "selected" : ""} type="button" onClick={() => setChoice("BUY_NOW")}>Buy now at {data.current.merchant}</button>
          <button className={choice === "WAIT" ? "selected" : ""} type="button" onClick={() => setChoice("WAIT")}>Wait {data.future.days} days</button>
          <button className={choice === "MONITOR_BOTH" ? "selected" : ""} type="button" onClick={() => setChoice("MONITOR_BOTH")}>Monitor both stores</button>
        </div>
      ) : null}

      {choice === "BUY_NOW" ? <p className="opportunity-result">Checkout remains gated by the normal confirmation and pre-purchase recheck.</p> : null}
      {choice === "MONITOR_BOTH" ? <p className="opportunity-result">Monitoring both Zalando and Nike.com. You will receive one meaningful alert for the best verified delivered price.</p> : null}
      {choice === "WAIT" && data.future && !promotionActive ? (
        <div className="scheduled-recheck">
          <div><strong>Recheck scheduled</strong><small>Virtual time · +{data.future.days} days</small></div>
          <button type="button" onClick={() => setPromotionActive(true)}>Advance +{data.future.days} days</button>
        </div>
      ) : null}
      {promotionActive ? (
        <div className="recheck-receipt">
          <strong>✓ Promotion rechecked at Nike.com</strong>
          <span>Price ✓</span><span>EU 43 ✓</span><span>Black and white ✓</span><span>Stock ✓</span><span>Coupon ✓</span>
          <p>The projected price is now current evidence. Purchase still requires active consent.</p>
        </div>
      ) : null}
    </section>
  );
}
