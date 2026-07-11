# AI Shopping Assistant

## Problem

Build a deal-hunting shopping agent that monitors an item on a user's behalf and acts when its **true delivered price** falls below the user's limit.

The user should be able to describe the purchase in plain language, for example:

> Nike Dunk Low, size 43, under EUR 80 delivered. New only, no resellers. If it lands within EUR 5 of the target and stock is low, do not ask - just buy. Otherwise, notify me once.

From that point, the agent owns the hunt: it monitors offers, determines whether listings represent the same product, calculates their real cost, rejects misleading deals, and either prepares checkout or buys within an explicitly granted mandate.

## Required behavior

The assistant should:

- Accept a natural-language brief containing the item, variant or size, price ceiling, preferences, and purchase conditions.
- Track equivalent products across multiple shops and countries.
- Match products despite inconsistent titles, SKUs, and potentially fake or misleading listings.
- Calculate **landed cost**, including:
  - listed price;
  - delivery;
  - currency conversion;
  - duties;
  - valid coupons.
- Filter out bait listings, unavailable inventory, fake discounts, and inflated reference prices.
- Notify the user only when an offer is genuinely relevant.
- Prepare a one-tap checkout, or automatically purchase when the offer falls within the user's standing mandate.
- Record the reasoning and full price calculation behind every decision or purchase.

## User flow

1. **State the request** - The user describes the item, constraints, preferences, and spending limit in one message. The brief can be changed or revoked at any time.
2. **Monitor and match** - The agent watches simulated shops and marketplaces, matches equivalent products, and recalculates landed cost as prices and exchange rates change.
3. **Verify the deal** - Before acting, the agent confirms seller legitimacy, stock availability, and whether the discount is real.
4. **Alert or buy** - The agent sends one meaningful alert with checkout prepared, or completes the purchase under a valid standing mandate.

## Spending mandate and safety

The central design question is: **When may an agent spend the user's money without asking again?**

The solution should support:

- **Standing consent** scoped to a specific item, spending cap, and set of conditions. It must be revocable at any time.
- **Hard limits** that the agent cannot reinterpret or reason around. Borderline cases must be escalated to the user.
- **Receipts and explanations** showing the landed-cost calculation and why the agent acted.
- **Calibrated autonomy**: escalating every decision makes the agent ineffective, while deciding everything makes it unsafe.

## Implementation scope

Focus on the agent's judgment rather than production commerce integrations.

- Do **not** make live web scraping the foundation of the demo.
- Build a deterministic simulator that emits merchant listings and price events.
- Implement real decision logic and landed-cost calculations on top of the simulated data.
- Decide explicitly which parts of cross-listing product matching will be solved algorithmically and which will use seeded mappings.
- No payment service provider integration is required.

## Evaluation

Create an evaluation set containing difficult cases such as:

- bait listings;
- fake or inflated discounts;
- unavailable or low inventory;
- fuzzy titles and mismatched products;
- foreign-currency offers;
- delivery and duty costs that push an apparent deal over the limit;
- invalid coupons;
- offers near the boundary of the user's mandate.

Report at least:

- **Strike precision** - how often an alert or purchase corresponds to a genuinely valid deal.
- **False-buy rate** - how often the agent buys an offer it should have rejected or escalated.

## Expected demonstration

The final demo should show a complete path from a plain-language request to a justified alert or simulated purchase. It should make the landed-cost arithmetic, mandate decision, and audit trail visible.

Example outcome:

- Target: Nike Dunk Low, size 43, at no more than EUR 80 delivered.
- Accepted: EUR 69 + EUR 7.40 shipping = **EUR 76.40 landed**.
- Rejected: GBP 59 listing whose converted price, delivery, and duties produce an **EUR 81.60 landed cost**.
