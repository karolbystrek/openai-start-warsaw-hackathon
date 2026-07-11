# AI Shopping Assistant — Project Roadmap

## Vision

Create a trustworthy shopping assistant that understands what a user wants, monitors relevant offers, evaluates the true delivered price, rejects misleading deals, and acts only within the user's explicit conditions.

## Product principles

- Treat required product attributes and spending limits as hard constraints.
- Judge offers by complete delivered cost, not advertised price.
- Verify product identity, availability, seller credibility, and discount validity before acting.
- Escalate uncertainty instead of making unsafe assumptions.
- Avoid repetitive or low-value notifications.
- Allow automatic purchases only under explicit, scoped, and revocable consent.
- Explain every decision with clear evidence and a full cost breakdown.

## User journey

1. The user describes the desired product, budget, preferences, and purchase conditions in plain language.
2. The assistant confirms how it understood the request and highlights any ambiguity.
3. The assistant monitors changing offers across simulated merchants.
4. Each promising offer is checked for product equivalence, availability, seller legitimacy, and deceptive pricing.
5. The complete delivered cost is calculated, including delivery, currency conversion, duties, taxes, and valid discounts.
6. The assistant ignores invalid offers, continues watching, asks for clarification, sends one meaningful alert, or performs a simulated purchase within the user's mandate.
7. The user receives a clear explanation and audit trail for the outcome.

## Future data sourcing

The initial product will use a mocked event stream to keep the demonstration deterministic and repeatable. Later, it can be replaced by a unified stream of real offer updates collected from multiple sources, including merchant webhooks where available, official APIs, scheduled polling, partner data feeds, and authorized crawling agents where other integrations are unavailable or insufficient.

Regardless of the source, incoming information should be treated consistently and verified before it can influence an alert or purchase decision.

## Explainability and trust

Explainability must be built into the complete decision workflow rather than added as a summary afterward. Every outcome should be supported by a structured decision record connecting the user's requirements to the observed offer, verification results, delivered-cost calculation, applicable purchase permission, and final action.

The assistant should provide a concise decision receipt containing:

- the decision and its primary reason;
- the user requirements that passed, failed, or remain uncertain;
- the complete delivered-cost breakdown;
- the origin and freshness of important evidence;
- the purchase permission or safety rule that allowed or blocked the action.

The default explanation should be short enough to verify at a glance, with an optional expanded view for evidence and audit details. Uncertainty should be described through specific missing or conflicting facts rather than hidden behind a general confidence score.

Explanations must be derived from the same facts and rules that produced the decision. No claim should appear without supporting evidence, and no alert or purchase should occur without a corresponding decision record. Any offer considered for purchase must be rechecked using current evidence, producing an updated receipt before the action is completed.

## Delivery roadmap

### Phase 1 — Define trusted behavior

- Establish the user journey and decision outcomes.
- Define hard constraints, preferences, and purchase-consent boundaries.
- Agree on how ambiguity and borderline offers should be handled.
- Specify what evidence every decision must present.
- Define the concise and expanded explanation experiences.

### Phase 2 — Deliver the complete core journey

- Support a plain-language shopping request.
- Monitor deterministic merchant scenarios.
- Recognize matching and mismatched products.
- Calculate the complete delivered cost.
- Produce a justified alert for a valid deal.
- Connect every outcome to its requirements, evidence, checks, and cost breakdown.

### Phase 3 — Add controlled autonomy

- Support explicit standing purchase consent.
- Allow consent to be reviewed, changed, or revoked.
- Recheck all conditions immediately before a simulated purchase.
- Produce a clear purchase receipt and explanation.
- Ensure the final explanation reflects the same current evidence used to authorize the action.

### Phase 4 — Strengthen against deceptive offers

- Cover bait listings, wrong variants, fake discounts, invalid coupons, unavailable stock, foreign currencies, delivery costs, duties, and offers close to the spending boundary.
- Ensure uncertain cases are escalated rather than purchased.
- Reduce duplicate and low-value alerts.

### Phase 5 — Evaluate trustworthiness

- Measure how often alerts and purchases are genuinely valid.
- Measure how often an incorrect purchase occurs.
- Track missed deals, unnecessary escalations, duplicate alerts, and cost-calculation accuracy.
- Evaluate whether explanations are complete, concise, evidence-backed, and easy to verify.
- Prioritize eliminating incorrect purchases before increasing autonomy.

### Phase 6 — Present the final experience

- Show the interpreted shopping request.
- Present changing merchant offers as a clear timeline.
- Make verification results and delivered-cost calculations visible.
- Show the active purchase permission and final decision.
- Present a brief decision receipt with expandable evidence and audit details.
- Finish with an understandable alert, rejection explanation, or simulated purchase receipt.

## Demo narrative

The final demonstration should follow one concise sequence:

1. Reject a cheap offer for the wrong product or variant.
2. Reject an apparent bargain whose delivery, currency conversion, or duties exceed the budget.
3. Reject an invalid coupon or misleading discount.
4. Accept a legitimate offer whose complete delivered cost satisfies every condition.
5. Alert the user or complete a simulated purchase according to the user's active consent.

The result should make it immediately clear what happened, why the assistant acted that way, and how the final delivered price was calculated.
