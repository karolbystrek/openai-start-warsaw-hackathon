# AI Shopping Assistant — Project Roadmap

## Vision

Create a trustworthy shopping assistant that understands what a user wants, monitors relevant offers, evaluates the true delivered price, rejects misleading deals, and acts only within the user's explicit conditions.

## Product principles

- Treat required product attributes and spending limits as hard constraints.
- Judge offers by complete delivered cost, not advertised price.
- Verify product identity, availability, seller credibility, and discount validity before acting.
- Treat time as part of the decision: distinguish a deal available now from a verified future opportunity, and explain when waiting is safer or more valuable than acting.
- Escalate uncertainty instead of making unsafe assumptions.
- Avoid repetitive or low-value notifications.
- Allow automatic purchases only under explicit, scoped, and revocable consent.
- Explain every decision with clear evidence and a full cost breakdown.

## User journey

1. The user describes the desired product, budget, preferences, and purchase conditions in plain language.
2. The assistant confirms how it understood the request and highlights any ambiguity.
3. The assistant monitors changing offers across simulated merchants, resale channels, and a mocked calendar of future promotions.
4. Each promising offer is checked for product equivalence, availability, seller legitimacy, and deceptive pricing.
5. The complete delivered cost is calculated, including delivery, currency conversion, duties, taxes, and valid discounts.
6. The assistant compares acting now with waiting for an evidence-backed opportunity, while accounting for stock risk, deadlines, consent, and the user's timing policy.
7. The assistant ignores invalid offers, schedules a recheck, asks for clarification, sends one meaningful alert, or performs a simulated purchase within the user's mandate.
8. The user receives a clear explanation and audit trail for the outcome, including why it acted now or chose to wait.

## Future data sourcing

The initial product will use a mocked event stream to keep the demonstration deterministic and repeatable. The stream should include current listings, resale listings such as Vinted-style used offers, stock changes, merchant promotion calendars, user-specific birthday promotions, coupon activation and expiry, and scheduled rechecks. Later, it can be replaced by a unified stream of real offer updates collected from multiple sources, including merchant webhooks where available, official APIs, scheduled polling, partner data feeds, authorized crawling agents where other integrations are unavailable or insufficient, and user-authorized loyalty or promotion data.

Regardless of the source, incoming information should be treated consistently and verified before it can influence an alert or purchase decision.

## Explainability and trust

Explainability must be built into the complete decision workflow rather than added as a summary afterward. Every outcome should be supported by a structured decision record connecting the user's requirements to the observed offer, verification results, delivered-cost calculation, applicable purchase permission, and final action.

The assistant should provide a concise decision receipt containing:

- the decision and its primary reason;
- the user requirements that passed, failed, or remain uncertain;
- the complete delivered-cost breakdown;
- the origin and freshness of important evidence;
- the opportunity horizon: relevant future event, evidence class, expected saving, stock risk, and next recheck time when the assistant waits;
- the purchase permission or safety rule that allowed or blocked the action.

The default explanation should be short enough to verify at a glance, with an optional expanded view for evidence and audit details. Uncertainty should be described through specific missing or conflicting facts rather than hidden behind a general confidence score.

Explanations must be derived from the same facts and rules that produced the decision. No claim should appear without supporting evidence, and no alert or purchase should occur without a corresponding decision record. Any offer considered for purchase must be rechecked using current evidence, producing an updated receipt before the action is completed.

## Time-aware opportunity planning

The assistant should model patience as an explicit product capability. It may recommend waiting only when that behavior is compatible with the user's timing policy and supported by stored evidence. Future opportunities must be classified as `CONFIRMED`, `RECURRING`, `PREDICTED`, or `SPECULATIVE`; only confirmed or explicitly modeled recurring events may authorize a deterministic scheduled recheck. Predictions can inform an explanation but cannot be treated as a guaranteed future price or authorize a purchase.

The opportunity comparison should account for:

- current landed cost versus the expected landed cost after a future event;
- promotion activation, expiry, minimum spend, product exclusions, stacking, and user eligibility;
- user-specific events such as a birthday voucher without exposing unnecessary personal data;
- stock level, stock-evidence freshness, sell-out risk, and the cost of missing the current deal;
- the user's deadline, maximum waiting horizon, urgency, and `buy now` versus `seek the best price before date` preference;
- mandate validity at the future time and a mandatory recheck before any simulated purchase;
- condition and channel constraints, so a cheaper used or resale listing is rejected when `new only` or `no resellers` is hard, and escalated only when the user allowed that fallback.

A `WAIT` outcome must always include a reason, a scheduled recheck time, the triggering event or deadline, and the conditions that would cancel waiting. It must never reserve inventory, spend money, or silently weaken a hard constraint.

## Delivery roadmap

### Phase 1 — Define trusted behavior

- Establish the user journey and decision outcomes.
- Define hard constraints, preferences, and purchase-consent boundaries.
- Agree on how ambiguity and borderline offers should be handled.
- Define timing preferences, future-opportunity evidence classes, and when `WAIT` is allowed.
- Specify what evidence every decision must present.
- Define the concise and expanded explanation experiences.

### Phase 2 — Deliver the complete core journey

- Support a plain-language shopping request.
- Monitor deterministic merchant scenarios.
- Model future promotions and scheduled re-evaluations on the virtual clock.
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

- Cover bait listings, wrong variants, fake discounts, invalid coupons, unavailable stock, foreign currencies, delivery costs, duties, offers close to the spending boundary, cheaper used marketplace listings, delayed promotions, birthday offers, and stock changes during a waiting window.
- Ensure uncertain cases are escalated rather than purchased.
- Reduce duplicate and low-value alerts.

### Phase 5 — Evaluate trustworthiness

- Measure how often alerts and purchases are genuinely valid.
- Measure how often an incorrect purchase occurs.
- Track missed deals, unnecessary escalations, duplicate alerts, and cost-calculation accuracy.
- Track harmful waits, unnecessary early purchases, and scheduled-recheck accuracy.
- Evaluate whether explanations are complete, concise, evidence-backed, and easy to verify.
- Prioritize eliminating incorrect purchases before increasing autonomy.

### Phase 6 — Present the final experience

- Show the interpreted shopping request.
- Present changing merchant offers as a clear timeline.
- Show the opportunity horizon, upcoming promotion events, stock risk, and scheduled rechecks.
- Make verification results and delivered-cost calculations visible.
- Show the active purchase permission and final decision.
- Present a brief decision receipt with expandable evidence and audit details.
- Finish with an understandable alert, rejection explanation, or simulated purchase receipt.

## Demo narrative

The final demonstration should follow one concise sequence:

1. Reject a cheap offer for the wrong product or variant.
2. Reject an apparent bargain whose delivery, currency conversion, or duties exceed the budget.
3. Reject a much cheaper used resale listing because it violates the user's `new only` constraint.
4. Identify a confirmed promotion or birthday voucher that activates later and schedule a transparent recheck instead of pretending the future saving is guaranteed.
5. Re-evaluate when stock drops or the promotion activates, showing why the previous wait remains safe or must end.
6. Reject an invalid coupon or misleading discount.
7. Accept a legitimate offer whose complete delivered cost satisfies every condition.
8. Alert the user or complete a simulated purchase according to the user's active consent.

The result should make it immediately clear what happened, why the assistant acted that way, and how the final delivered price was calculated.
