"use client";

import { useState } from "react";

type BirthdayOpportunityProps = {
  requestId: string;
};

export function BirthdayOpportunity({ requestId }: BirthdayOpportunityProps) {
  const [showPlan, setShowPlan] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <section className="birthday-opportunity" aria-label="Nike Dunk promotion opportunity">
      <span className="opportunity-icon" aria-hidden="true">−10%</span>
      <div>
        <p className="opportunity-label">Promotion opportunity</p>
        <h3>A birthday offer may lower the Dunk price</h3>
        <p>
          A simulated 10% birthday promotion is expected in 20 days. This is a planning signal,
          not a guaranteed price; current monitoring and every hard requirement remain active.
        </p>
        {showPlan ? (
          <p className="opportunity-plan" aria-live="polite">
            Scout will compare the promotion-day delivered total with today&apos;s verified offers.
            It will not delay a valid mandated purchase or buy without scoped consent.
          </p>
        ) : null}
        <div className="opportunity-actions">
          <button className="opportunity-action" type="button" onClick={() => setShowPlan(true)}>
            {showPlan ? "Promotion plan shown" : "Review promotion plan"}
          </button>
          <button className="opportunity-action secondary" type="button" onClick={() => setDismissed(true)}>
            Keep monitoring only
          </button>
          <small>Request {requestId.slice(-8)} · simulated opportunity</small>
        </div>
      </div>
    </section>
  );
}
