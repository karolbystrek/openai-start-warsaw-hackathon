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

## Additional feature — Time-aware opportunity planning

This is an optional stretch feature, not part of the core decision system or a prerequisite for the main demo. The core remains focused on evaluating current mocked offers and producing `IGNORE`, `REJECT`, `ESCALATE`, `ALERT`, or `BUY_SIMULATED`. Only after that path is complete and verified may an independent opportunity layer recommend waiting and schedule a future recheck. It must not authorize a purchase, override a core decision, or block delivery of the core product.

The additional feature may compare the current result with future mocked opportunities. Future events must be classified as `CONFIRMED`, `RECURRING`, `PREDICTED`, or `SPECULATIVE`; only confirmed or explicitly modeled recurring events may create a deterministic scheduled recheck. Predictions can inform an explanation but cannot be treated as a guaranteed future price.

The opportunity comparison should account for:

- current landed cost versus the expected landed cost after a future event;
- promotion activation, expiry, minimum spend, product exclusions, stacking, and user eligibility;
- user-specific events such as a birthday voucher without exposing unnecessary personal data;
- stock level, stock-evidence freshness, sell-out risk, and the cost of missing the current deal;
- the user's deadline, maximum waiting horizon, urgency, and `buy now` versus `seek the best price before date` preference;
- mandate validity at the future time and a mandatory recheck before any simulated purchase;
- condition and channel constraints, so a cheaper used or resale listing is rejected when `new only` or `no resellers` is hard, and escalated only when the user allowed that fallback.

An opportunity recommendation must always include a reason, a scheduled recheck time, the triggering event or deadline, and the conditions that would cancel waiting. It remains separate from the authoritative core decision and must never reserve inventory, spend money, delay a mandated purchase, or silently weaken a hard constraint.

## Additional feature — Voice brief intake

This is an optional, removable input track, not a replacement for the existing text brief and not a prerequisite for the main demo. It only changes how a shopping request is collected, never how it is decided.

Instead of typing the brief, the user has a spoken conversation with the assistant. The agent asks about missing or ambiguous hard constraints and preferences, reads back a summary of its interpretation, and proposes a draft request and, if relevant, a draft mandate. The user must still confirm activation in the interface itself — a spoken "yes" collects the draft, but only an explicit, non-voice confirmation in the UI can move a request to `ACTIVE` or make a mandate effective, exactly as with a typed brief today.

If this feature is disabled, the user journey described above is unaffected: the user types the brief and confirms it in the interface as it already works.

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

### Optional stretch track — Opportunity horizon

- Add mocked merchant promotion calendars, birthday offers, coupon activation, and scheduled rechecks only after the complete core journey works.
- Show current authoritative prices separately from projected future prices.
- Compare waiting with acting now using stock risk, deadlines, promotion eligibility, and user timing preferences.
- Evaluate beneficial and harmful waits without changing the core purchase authorization rules.
- Treat this track as removable from the final demo if it threatens the reliability or clarity of the core path.

## Demo narrative

The final demonstration should follow one concise sequence:

1. Reject a cheap offer for the wrong product or variant.
2. Reject an apparent bargain whose delivery, currency conversion, or duties exceed the budget.
3. Reject an invalid coupon or misleading discount.
4. Accept a legitimate offer whose complete delivered cost satisfies every condition.
5. Alert the user or complete a simulated purchase according to the user's active consent.

The result should make it immediately clear what happened, why the assistant acted that way, and how the final delivered price was calculated.

If the core narrative is already stable, an optional extension may then show a cheaper used Vinted-style listing rejected by `new only`, a birthday promotion activating in 20 virtual days, a scheduled recheck, and a stock-risk change. This extension must be clearly presented as an additional capability rather than part of the minimum successful flow.
