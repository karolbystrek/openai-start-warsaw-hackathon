# AI Shopping Assistant — Implementation Plan

Status: working draft for team discussion

Sources: [SOLIDGATE_CASE.md](SOLIDGATE_CASE.md) and [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md)

## 1. Delivery objective

Build a deterministic, repeatable demonstration in which a user submits one natural-language shopping brief and the system:

1. turns it into explicit hard constraints, preferences, and an optional purchase mandate;
2. consumes a seeded stream of changing merchant offers;
3. checks product identity, variant, stock, seller legitimacy, price evidence, and coupon validity;
4. calculates the full landed cost;
5. chooses `IGNORE`, `REJECT`, `ESCALATE`, `ALERT`, or `BUY_SIMULATED`;
6. records an evidence-backed decision receipt; and
7. avoids duplicate or low-value notifications.

The demo is successful when every action can be reproduced from stored inputs and rules, especially at the spending boundary.

## 2. Architectural principle

Use AI for interpretation and uncertain semantic comparison. Use deterministic code as the final authority for money, hard constraints, mandates, notification suppression, and purchases.

The model may:

- parse a shopping brief into a typed draft;
- normalize messy listing text;
- compare ambiguous titles and explain possible product equivalence;
- identify missing or conflicting facts;
- turn a structured decision record into concise user-facing wording.

The model must not:

- calculate or round the authoritative landed cost;
- convert a preference into a hard constraint, or vice versa;
- invent missing evidence;
- relax a budget cap;
- authorize a purchase;
- override an expired, revoked, or ambiguous mandate.

Only the deterministic policy engine may emit `BUY_SIMULATED`.

## 3. Recommended hackathon stack

### Application

- **Language:** TypeScript with strict mode.
- **Web app:** Next.js App Router, keeping UI and server-side orchestration in one deployable application.
- **UI:** React, Tailwind CSS, and a small accessible component set such as shadcn/ui.
- **Validation and contracts:** Zod schemas shared across UI, AI outputs, simulator inputs, and domain services.
- **Persistence:** SQLite with Drizzle ORM for a zero-setup local demo and inspectable audit data.
- **Tests:** Vitest for domain and scenario tests; Playwright for the single critical demo journey.

### AI layer

- Use the OpenAI TypeScript Agents SDK or the lower-level OpenAI SDK with structured output.
- Start with two narrow model operations, not a multi-agent system:
  1. `interpretShoppingBrief` returns a Zod-validated request draft and explicit ambiguities.
  2. `assessAmbiguousMatch` returns attribute-level claims with supporting listing evidence.
- Keep model selection configurable through environment variables.
- Persist model name, prompt/schema version, source text, structured output, and trace/response identifier with each AI-derived claim.

### Simulator and execution

- Implement the simulator as a seeded scenario runner using a virtual clock and typed JSON/TypeScript fixtures.
- Use an in-process event bus or async generator. Do not add Kafka, Redis, or a separate worker for the hackathon.
- Implement simulated checkout as a transaction that re-evaluates the latest offer and mandate before writing a fake order.

### Why this shape

This is one coherent TypeScript codebase, is fast to demo locally, minimizes infrastructure failure modes, and still creates clean seams for later extraction of the event source, database, or workers.

If the team is substantially stronger in Python, the viable alternative is FastAPI + Pydantic + SQLAlchemy + React. The cost is a second language boundary and duplicated contracts, so it is not the default recommendation for a short hackathon.

## 4. Proposed module boundaries

```text
src/
  app/                   Next.js routes and screens
  domain/
    brief/               request and mandate types
    catalog/             canonical product and attribute rules
    matching/            identity and variant matching
    pricing/             money, FX, coupons, duties, landed cost
    verification/        seller, stock, discount and evidence checks
    policy/              decision matrix and purchase authorization
    notifications/       alert deduplication and relevance rules
    audit/               decision record and receipt projection
  ai/
    brief-interpreter.ts
    ambiguous-match.ts
    prompts/              versioned prompts and schemas
  simulator/
    engine.ts             seeded clock and event playback
    scenarios/            deterministic merchant/FX/coupon fixtures
  application/
    evaluate-offer.ts     orchestrates one evaluation
    recheck-and-buy.ts    final transactional authorization
  db/
    schema.ts
    repositories/
  tests/
    unit/
    scenarios/
    evals/
    e2e/
```

Dependency direction should point inward: UI, AI adapters, simulator, and database call domain functions; domain code does not import Next.js, OpenAI, or database code.

## 5. Core domain contracts

### Shopping request

Store the original text and a versioned, user-confirmable interpretation:

- canonical product hints: brand, model, category, identifiers;
- required variant attributes: size, color, condition, region, gender/age range, pack quantity;
- forbidden attributes or channels: used, reseller, marketplace, refurbished;
- destination country and postal region;
- budget currency and hard maximum landed cost;
- soft preferences, kept separate from requirements;
- notification policy;
- optional standing purchase mandate;
- unresolved ambiguities;
- lifecycle: `DRAFT`, `ACTIVE`, `PAUSED`, `REVOKED`, `FULFILLED`;
- version and effective timestamps.

No monitoring or purchase is allowed while a required fact is ambiguous, such as destination or whether the cap includes delivery.

### Standing mandate

- request/version to which consent applies;
- maximum landed cost, never above the shopping request cap;
- required conditions for automatic purchase;
- allowed quantity, merchants or seller classes if scoped;
- effective and expiry times;
- revocation time and reason;
- one-purchase or repeat-purchase semantics;
- immutable consent record plus current status.

The first version should support one item, quantity one, one successful simulated purchase, and immediate revocation.

### Offer and evidence

- merchant, seller, listing ID and URL-like reference;
- observed title, identifiers, attributes, condition and quantity;
- item price and currency;
- delivery quote and destination coverage;
- tax/duty inputs;
- coupon claims and validation evidence;
- stock state and quantity signal;
- seller status and trust evidence;
- reference price/history used to assess the discount;
- observation time and source freshness;
- scenario ground-truth labels, hidden from the runtime evaluator.

### Decision record

- request version, offer snapshot, FX snapshot and policy version;
- result: `IGNORE`, `REJECT`, `ESCALATE`, `ALERT`, or `BUY_SIMULATED`;
- one primary reason code;
- per-requirement results: `PASS`, `FAIL`, `UNKNOWN`;
- match evidence and verification results;
- full landed-cost calculation;
- mandate checks and consent version;
- notification suppression result;
- source timestamps and freshness;
- AI provenance for AI-derived claims;
- final action and immutable timestamp.

The concise and expanded receipts must be projections of this record, not separately generated reasoning.

## 6. Authoritative evaluation pipeline

Evaluate every offer in a fixed order so decisions are reproducible and cheap failures stop early:

1. Validate event schema and freshness.
2. Load the active shopping request version.
3. Resolve canonical product candidates using identifiers and seeded catalog mappings.
4. Compare hard product and variant attributes.
5. If identity is ambiguous, request a structured AI match assessment.
6. Reject on a hard mismatch; escalate if required identity remains unknown.
7. Verify seller/channel constraints, stock, condition, listing quantity, and destination eligibility.
8. Validate coupon applicability at the event time and against merchant/product/minimum-spend rules.
9. Validate discount/reference-price claims independently of deal eligibility.
10. Load the event-time FX rate and applicable duty/tax rule.
11. Calculate authoritative landed cost.
12. Compare landed cost with the hard cap using exact minor-unit arithmetic.
13. Determine notification eligibility and deduplicate equivalent alerts.
14. Evaluate the active mandate.
15. Emit and store the decision record.
16. Before simulated purchase, reload current evidence and repeat steps 2–15 in one serialized operation.

### Decision precedence

Use explicit precedence to avoid contradictory outcomes:

1. malformed or stale critical evidence -> `IGNORE` or `ESCALATE`;
2. hard product/condition/channel mismatch -> `REJECT`;
3. unavailable stock -> `REJECT`;
4. unknown purchase-critical fact -> `ESCALATE`;
5. landed cost above cap -> `REJECT`;
6. valid deal without applicable auto-buy consent -> `ALERT`;
7. valid deal with fully applicable consent -> `BUY_SIMULATED`;
8. already notified with no meaningful improvement -> `IGNORE`.

`BUY_SIMULATED` requires every purchase-critical check to be `PASS`; `UNKNOWN` is never truthy.

## 7. Landed-cost design

Use integer minor units for monetary amounts. Use a decimal library for FX and percentage calculations; never use binary floating point as the authority.

Suggested breakdown:

```text
eligible item subtotal
- valid item coupon
+ delivery
- valid delivery coupon
+ destination tax, if not already included
+ duty
+ fixed import/handling fees
= source-currency total where applicable
x snapshotted FX conversion(s)
= budget-currency landed cost
```

The exact ordering of coupons, tax, duty, delivery, and FX must be encoded per scenario/rule, not assumed globally.

Define and test:

- rounding mode and the stage at which rounding occurs;
- currencies with 0, 2, or 3 minor digits;
- whether merchant prices include VAT;
- duty threshold and basis;
- FX rate source, timestamp, spread, and freshness;
- coupon stacking and exclusions;
- destination-dependent delivery and import fees;
- equality at the hard cap: `landedCost <= cap` passes;
- conservative handling when a fee cannot be known exactly.

For demo clarity, use a small versioned duty/tax fixture rather than pretending to model all customs law.

## 8. Product matching strategy

Use a staged hybrid matcher and expose which stage supplied each claim.

1. **Exact identifiers:** GTIN/EAN/UPC, manufacturer part number, normalized SKU scoped to merchant.
2. **Seeded catalog map:** intentionally disclosed mappings for known demo products and aliases.
3. **Deterministic normalization:** brand/model aliases, punctuation, token normalization, unit and size normalization.
4. **Attribute comparison:** category-specific required attributes and explicit contradictions.
5. **AI assessment:** only for unresolved semantic evidence; output an attribute matrix, citations to input fields, and unresolved facts.
6. **Policy threshold:** exact/seeded matches may proceed; AI-assisted matches may alert when strong enough, but auto-buy should initially require exact or seeded identity plus all variant attributes.

Avoid a single opaque confidence score. Store facts such as `brand=PASS`, `model=PASS`, `size=FAIL`, or `condition=UNKNOWN`.

## 9. Simulator and scenario format

Each scenario should contain:

- a seed and virtual start time;
- the user brief and expected parsed request;
- canonical catalog entries and seeded aliases;
- merchant/seller profiles;
- FX, coupon and duty rule snapshots;
- time-ordered listing, stock, price, coupon and seller events;
- hidden ground-truth validity labels;
- expected decisions and reason codes.

The runner needs `play`, `pause`, `step`, `reset`, and speed control. The demo UI should expose the virtual time and current event so a judge can see why a recalculation happened.

Minimum headline scenario:

1. wrong size/model looks cheap -> reject;
2. GBP offer looks cheap but delivery/duty pushes it above EUR 80 -> reject;
3. coupon is expired or inapplicable -> reject or recalculate above cap;
4. valid EUR 76.40 landed offer arrives -> alert or buy according to consent;
5. optional twist: stock becomes low, exercising a precisely defined mandate condition.

## 10. User experience

### Main demo screen

- **Request card:** original brief beside interpreted hard requirements, preferences, ambiguities, and consent.
- **Simulation controls:** selected scenario, virtual time, play/step/reset.
- **Offer timeline:** new evidence and recalculations across merchants.
- **Decision panel:** current result and primary reason.
- **Landed-cost panel:** line-item arithmetic with FX and fee provenance.
- **Verification panel:** product, variant, seller, stock, coupon, and discount checks.
- **Mandate panel:** active scope, cap, conditions, expiry, and revoke control.
- **Receipt drawer:** concise summary by default, expandable immutable audit details.
- **Evaluation page:** aggregate metrics and per-scenario failures.

### Interaction safety

- Require explicit confirmation of the interpreted brief before activating monitoring if any purchase consent is present.
- Make consent visually distinct from ordinary preferences.
- Show revocation immediately and ensure all later evaluations use the new version.
- Never display “bought” before the pre-purchase recheck commits successfully.

## 11. Evaluation plan

Build evaluation fixtures before polishing the UI. Runtime decisions must not read their ground-truth labels.

At minimum cover:

- exact, fuzzy, wrong-model and wrong-variant product identity;
- used/refurbished/reseller violations;
- bait price attached to another variant;
- unavailable and low inventory;
- seller legitimacy failure or missing evidence;
- foreign currency and changing FX;
- delivery, duty, tax and handling fee boundary cases;
- expired, minimum-spend, product-excluded and non-stackable coupons;
- fake or inflated reference prices;
- exact-cap, one-minor-unit-below and one-minor-unit-above offers;
- mandate expired, revoked, wrong request version, already consumed, and condition unknown;
- duplicate listing events and meaningful price improvements;
- stale evidence between alert and purchase recheck.

Required metrics:

- **Strike precision:** valid alerts and purchases / all alerts and purchases.
- **False-buy rate:** invalid purchases / all purchases; report zero purchases separately rather than treating it as success.

Also report recall/missed-deal rate, unnecessary escalation rate, duplicate-alert rate, cost-calculation exactness, and explanation completeness.

The most important test oracle is scenario ground truth, not another model's opinion.

## 12. Delivery phases and exit criteria

### How to use this checklist

- Work through phases in order unless a task is explicitly independent.
- Change `[ ]` to `[x]` only when the task is implemented and its relevant tests or manual verification pass.
- Do not check a phase's **Exit verification** until every task in that phase is checked and the stated end-to-end behavior has been demonstrated.
- If implementation changes the intended behavior, update this plan and its verification criterion in the same change.
- Keep partially completed tasks unchecked; add a short nested note describing what remains instead of treating partial work as finished.

### Phase 0 — Decisions and skeleton

- [ ] Record the agreed technology stack and deployment target.
- [ ] Choose the headline demo product and destination.
- [ ] Define and document the simplified tax and duty rules.
- [ ] Define the product-match policy for alerts and automatic purchases.
- [ ] Define mandate creation, expiry, revocation, and consumption semantics.
- [ ] Scaffold the application with strict TypeScript settings.
- [ ] Configure shared Zod schemas, the test runner, and the database.
- [ ] Define and validate the deterministic scenario-fixture format.
- [ ] **Exit verification:** Load one fixture event, validate it, store it, and display it in the application.

### Phase 1 — Trusted domain core

- [ ] Implement integer-minor-unit money values and explicit rounding behavior.
- [ ] Implement versioned FX conversion with rate timestamps and freshness rules.
- [ ] Implement coupon validation, applicability, exclusions, and stacking rules.
- [ ] Implement the scoped delivery, tax, duty, and handling-fee calculation.
- [ ] Implement hard-requirement evaluation with `PASS`, `FAIL`, and `UNKNOWN` results.
- [ ] Implement the decision outcomes, precedence rules, and stable reason codes.
- [ ] Implement the structured, immutable decision record.
- [ ] Add unit tests for exact-cap, below-cap, above-cap, rounding, invalid-coupon, and unknown-evidence boundaries.
- [ ] **Exit verification:** Deterministic tests prove that no above-cap offer or offer with an unknown purchase-critical fact can produce `BUY_SIMULATED`.

### Phase 2 — Complete alert journey

- [ ] Implement Zod-validated natural-language brief interpretation.
- [ ] Add confirmation and ambiguity handling before a request becomes active.
- [ ] Create the canonical demo catalog and disclose its seeded mappings and aliases.
- [ ] Implement exact-identifier, seeded, normalized, attribute-level, and AI-assisted matching stages.
- [ ] Persist provenance for every AI-derived matching claim.
- [ ] Implement the seeded simulator, virtual clock, event playback, pause, step, and reset.
- [ ] Implement the authoritative offer-evaluation application service.
- [ ] Generate concise and expanded receipts from the same decision record.
- [ ] Build the request, offer timeline, verification, landed-cost, and decision UI.
- [ ] Add the complete headline alert scenario and its automated scenario test.
- [ ] **Exit verification:** Run the headline scenario to a justified `ALERT` and trace every displayed claim to stored facts and evidence.

### Phase 3 — Controlled autonomy

- [ ] Implement immutable mandate versions and current mandate status.
- [ ] Implement explicit mandate confirmation, review, and immediate revocation.
- [ ] Enforce item, request-version, quantity, price, merchant, condition, time, and one-purchase mandate scope.
- [ ] Implement a serialized pre-purchase recheck using current offer, stock, coupon, FX, request, and mandate evidence.
- [ ] Implement idempotent simulated-order creation and mandate consumption.
- [ ] Build mandate controls and the simulated purchase receipt UI.
- [ ] Add tests for valid, expired, revoked, mismatched, consumed, and ambiguous mandates.
- [ ] **Exit verification:** Demonstrate one purchase under valid consent and demonstrate that every invalid or uncertain consent case is blocked or escalated.

### Phase 4 — Adversarial hardening

- [ ] Add bait listing and wrong-variant scenarios.
- [ ] Add fake reference-price and invalid-coupon scenarios.
- [ ] Add unavailable-stock, low-stock, and stale-evidence scenarios.
- [ ] Add FX, delivery, duty, and landed-cost boundary scenarios.
- [ ] Add seller-legitimacy and marketplace/reseller scenarios.
- [ ] Implement notification fingerprints and meaningful-improvement deduplication.
- [ ] Ensure runtime evaluation cannot access scenario ground-truth labels.
- [ ] Freeze at least 25 adversarial and boundary scenarios.
- [ ] Calculate strike precision, false-buy rate, purchase count, recall, escalation rate, duplicate-alert rate, and cost-calculation exactness.
- [ ] Add regression tests for every discovered false alert, false purchase, missed deal, or incorrect escalation.
- [ ] **Exit verification:** Run the frozen evaluation set and meet the agreed metric targets, including a 0% false-buy rate with a non-zero purchase count.

### Phase 5 — Demo polish

- [ ] Finalize scenario selection, virtual-time controls, and visible event progression.
- [ ] Polish visual hierarchy for requirements, evidence, decisions, costs, and consent.
- [ ] Verify concise receipts at a glance and expanded audit details on demand.
- [ ] Build the evaluation dashboard with metric definitions and per-scenario failures.
- [ ] Add a reliable clean-state reset command and documented demo runbook.
- [ ] Test the complete demo from a clean checkout on the presentation machine.
- [ ] Prepare a recorded fallback demonstration.
- [ ] Rehearse the final narrative within the available presentation time.
- [ ] **Exit verification:** Run the complete request-to-rejection-to-alert-or-purchase narrative deterministically in a few minutes from a clean checkout.

## 13. Suggested work split

For a four-person team:

- **Domain/evaluation:** schemas, cost engine, policy engine, fixtures, metrics.
- **AI/matching:** brief interpretation, catalog matching, prompts, AI provenance, fallback behavior.
- **Simulator/data:** virtual clock, merchant events, scenario authoring, persistence.
- **Product/UI:** request confirmation, timeline, decision receipt, mandate controls, demo polish.

Integrate vertically after Phase 1. Do not wait until the end to connect four independent components.

## 14. Main risks and mitigations

- **Model nondeterminism breaks the demo:** cache or seed approved structured AI results for the headline scenario; provide a deterministic parser/mapping fallback.
- **Money logic becomes legally broad:** explicitly scope destination and rules; version fixtures; label simplifications.
- **Fuzzy match causes unsafe purchase:** require exact or seeded identity for version-one auto-buy; escalate unresolved contradictions.
- **“Low stock” is undefined:** define it as a merchant evidence field with freshness, not persuasive listing text.
- **Fake discount distracts from cap logic:** keep “discount is genuine” separate from “landed cost is acceptable”; decide whether genuine discount is a user condition.
- **Race between evaluation and purchase:** re-read offer, request, mandate, stock, coupon, and FX immediately before purchase in a serialized transaction.
- **Audit text drifts from decision facts:** render receipts from reason codes and structured evidence; constrain any model-written prose to those fields.
- **Alert spam:** fingerprint product + request + offer and alert only on first valid deal or a configured meaningful improvement.
- **Too much infrastructure:** keep one app, one database, and one simulator process until the core demo is proven.

## 15. Brainstorming decisions

These choices should be made before implementation begins:

1. **Team and stack:** team size, strongest languages, deployment target, and hackathon time available.
2. **AI orchestration:** plain structured model calls or Agents SDK with tools and tracing.
3. **Demo autonomy:** should the headline end in an alert, a simulated purchase, or let the audience toggle consent and see both?
4. **Auto-buy identity:** require exact/seeded product identity, or allow AI-assisted identity above a defined evidence threshold?
5. **Mandate semantics:** what exactly does “within EUR 5 of the target and stock is low” mean? The example is semantically ambiguous.
6. **Destination scope:** use one Polish/EU destination and a deliberately simplified duty/VAT table, or demonstrate two destinations?
7. **Marketplace policy:** does “no resellers” exclude all marketplaces, or only third-party sellers?
8. **Discount policy:** is a fake reference discount always disqualifying, or only when the user requires a genuine discount?
9. **Notification rule:** one alert forever, one per merchant, or alert again after a meaningful landed-price improvement?
10. **Evaluation target:** desired number of frozen scenarios and the acceptable escalation/recall trade-off, while keeping false buys at zero.

## 16. Recommended first decisions

Unless the team has contrary constraints, start with:

- TypeScript, Next.js, Zod, SQLite/Drizzle, Vitest, and Playwright;
- one Poland destination and EUR budget;
- Nike Dunk Low as the disclosed seeded catalog example;
- exact/seeded identity required for auto-buy, AI-assisted matches eligible for alert or escalation only;
- explicit `<= cap` acceptance with decimal/intermediate rounding rules frozen in tests;
- consent toggle in the demo so the same valid offer can visibly lead to `ALERT` or `BUY_SIMULATED`;
- at least 25 frozen adversarial scenarios, including dense boundary cases;
- false-buy target of 0%, reported together with purchase count and recall.
