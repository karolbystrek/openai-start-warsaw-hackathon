# Checkpoint 1 baseline decisions

These choices freeze the first contract version and the deterministic demo fixtures. They are deliberately scoped to the hackathon scenario, not presented as general commerce or customs rules.

## Product and request

- Product: Nike Dunk Low, EU size 43, quantity one.
- Destination: Poland, represented by country code `PL`.
- Budget: EUR 80.00 delivered. A landed cost equal to the cap passes.
- Any monetary ceiling in a shopping brief is interpreted as the maximum total landed cost, including delivery, taxes, duties, fees, and currency conversion. The assistant must not ask whether those costs are included.
- Hard conditions: new condition and a merchant-owned, non-reseller sales channel.
- Automatic purchase requires exact identifier or disclosed seeded-catalog identity. AI-assisted identity may not authorize a purchase.

## Mandate

- Consent is immutable and versioned, expires explicitly, and can be revoked immediately.
- A mandate is consumed by one successful simulated purchase.
- “Within EUR 5 of the target” is EUR 75.00 through EUR 80.00 landed, inclusive.
- “Low stock” requires a fresh structured merchant stock signal. Listing prose alone is not evidence.

## Scenario rules

- Monetary values use integer minor units. FX and percentage inputs use decimal strings.
- Tax and duty rules are fixture-specific and versioned. They are not a general description of Polish or EU law.
- Coupon and reference-discount validity are not hard requirements by default. Invalid savings are excluded, the no-coupon landed cost is recalculated, and only the final delivered price and explicit hard requirements determine eligibility.
- The rejected headline offer resolves to EUR 81.60 landed after fixture-defined conversion, delivery, and duty.
- The accepted headline offer is EUR 69.00 plus EUR 7.40 delivery, or EUR 76.40 landed.

## Ownership

- Person A (`feat/trust-core`): contracts, pricing, verification, policy, notifications, audit, unit tests, and evaluations.
- Person B (`feat/intelligence-simulator`): brief interpretation, catalog, matching, AI adapters, simulator, and scenarios.
- Person C (`feat/product-integration`): application orchestration, database, UI, end-to-end tests, and integration.

Shared contracts change only through a small coordinated commit. Runtime modules must never import scenario ground-truth labels.
