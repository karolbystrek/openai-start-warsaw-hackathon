# Project Guidance

This repository implements the AI Shopping Assistant described in the [full Solidgate case brief](SOLIDGATE_CASE.md).

## Product goal

Build a deal-hunting agent that accepts a plain-language shopping brief, monitors simulated merchant offers, and acts only when the **true delivered price** and all user conditions are satisfied.

The core challenge is trustworthy judgment: identify the same product across messy listings, calculate the complete cost, reject deceptive offers, and decide whether to alert, escalate, or buy.

## Non-negotiable behavior

- Treat the user's item constraints, conditions, and spending ceiling as hard requirements.
- Calculate **landed cost** from item price, delivery, currency conversion, duties, and valid coupons. Never decide from sticker price alone.
- Verify product identity, seller legitimacy, inventory, and discount validity before declaring a deal.
- Filter bait listings, fake discounts, invalid coupons, and mismatched products.
- Prefer one meaningful alert over noisy notifications.
- Permit automatic purchase only under explicit, scoped, revocable standing consent.
- Never reason around a hard cap. Escalate ambiguous or borderline cases.
- Produce an audit trail containing the decision, reasoning, and full cost calculation.

## Implementation priorities

- Use a deterministic merchant and price-event simulator; live scraping is not the foundation of the demo.
- Make the decision logic and landed-cost engine real and testable.
- Clearly document which product matches are computed and which are seeded.
- Keep payment execution simulated; no payment service provider integration is required.
- Optimize for a complete demo path: request -> monitor -> match -> verify -> alert, escalate, or simulated purchase.

## Evaluation

Test adversarial and boundary cases, including fuzzy or mismatched products, bait listings, fake discounts, unavailable stock, FX changes, duties and delivery costs, invalid coupons, and mandate-edge offers.

At minimum, report:

- **Strike precision:** the share of alerts or purchases that are genuinely valid deals.
- **False-buy rate:** the share of purchases that should have been rejected or escalated.

When requirements are unclear, use [SOLIDGATE_CASE.md](SOLIDGATE_CASE.md) as the source of truth.
