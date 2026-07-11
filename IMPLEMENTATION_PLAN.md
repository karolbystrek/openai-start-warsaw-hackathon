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
    contracts/           shared Zod schemas and service interfaces
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

### Conditional delivery options and lowest delivered-price selection

Do not model shipping as one unconditional number on an offer. A merchant may expose several fulfillment paths, and each path may have different eligibility and price rules. Represent every quoted path as a structured `DeliveryOption` containing:

- method and identifier, such as standard courier, express, parcel locker, pickup, or merchant-specific service;
- quoted price and currency, or a versioned free-delivery rule;
- threshold amount and its basis, including whether eligibility is calculated before or after discounts;
- destination, postcode, product, seller, category, weight, and channel eligibility;
- required membership, subscription, coupon, or user entitlement;
- coupon-stacking and category exclusions;
- estimated delivery window and compatibility with the user's hard deadline;
- observation time, expiry/freshness, source, and provenance.

For every otherwise valid offer, deterministically enumerate the feasible `offer x delivery option x applicable coupon set` paths, including the path with no coupon. Validate each path's destination, threshold, entitlement, exclusions, stacking, deadline, and evidence freshness, then calculate its complete landed cost. Select the lowest landed cost across all valid paths and all merchants. A path with any unknown purchase-critical delivery fact must be escalated rather than treated as free.

Use deterministic tie-breakers when two paths have the same landed cost: earlier delivery, fresher evidence, more trusted seller, the user's preferred delivery method, and finally a stable path identifier. Persist the winning option and rejected alternatives with reason codes so the receipt can explain why a lower sticker price or an apparently free-delivery offer lost.

The optimizer must not add an unwanted item or increase quantity merely to cross a free-shipping threshold. Cart padding is forbidden by default and would require separate explicit consent, an allowed-item scope, and its own cap. A membership price of zero is eligible only when the user's current entitlement is confirmed. Immediately before simulated purchase, reload the selected delivery quote and recalculate all feasible paths because its price, threshold, or availability may have changed.

Define and test:

- rounding mode and the stage at which rounding occurs;
- currencies with 0, 2, or 3 minor digits;
- whether merchant prices include VAT;
- duty threshold and basis;
- FX rate source, timestamp, spread, and freshness;
- coupon stacking and exclusions;
- conditional delivery options, free-shipping thresholds, membership eligibility, pickup/locker constraints, and delivery-quote freshness;
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

## Additional feature — Time-aware opportunity planning

This is a stretch feature and must remain outside the authoritative core evaluation pipeline. Build it only after the complete current-offer path reaches its exit verification. The application must be able to disable or remove this feature without changing core contracts, decisions, purchase authorization, or the headline scenario.

The extension adds a post-evaluation opportunity layer that can recommend continued monitoring and schedule a recheck. It does not add `WAIT` to the core decision enum. A core `DecisionRecord` remains authoritative; a separate `OpportunityRecommendation` explains a possible future saving and may create a `ScheduledRecheck`. It cannot suppress an `ALERT`, delay `BUY_SIMULATED` under a valid first-qualifying-offer mandate, or authorize a purchase.

### Optional modules and contracts

```text
src/additional/opportunity/
  contracts.ts           FutureOpportunity, OpportunityRecommendation, ScheduledRecheck
  evaluate.ts            compares a stored core decision with mocked future events
  scheduler.ts           idempotent virtual-time rechecks
src/simulator/scenarios/additional/
  patience.ts            birthday, resale, promotion and stock-risk fixtures
```

Optional contracts should contain:

- user timing preference: urgency, deadline, maximum waiting horizon, and whether suggestions are enabled;
- event type: merchant sale, user-specific birthday promotion, coupon activation, expected markdown, stock change, or deadline;
- evidence class: `CONFIRMED`, `RECURRING`, `PREDICTED`, or `SPECULATIVE`;
- source, observation time, freshness, activation window, eligibility, exclusions, and coupon stacking;
- projected landed-cost breakdown, visibly separate from the current authoritative cost;
- stock-risk evidence, cancellation conditions, next recheck, and latest acceptable action time.

Only confirmed or versioned recurring mocked events may schedule a recheck. Predicted and speculative events may be shown as context but never as guaranteed savings. Birthday eligibility should store only the minimum required fact and window, not a birth date in receipts or logs.

### Optional scenario and UX

The additional scenario may show:

1. a current valid or near-target offer;
2. a much cheaper Vinted-style used listing rejected by the core `new only` rule;
3. a confirmed birthday promotion activating in 20 virtual days;
4. an opportunity recommendation with projected saving and scheduled recheck;
5. a stock drop that cancels or changes the recommendation;
6. re-evaluation on promotion day using current price, coupon, FX, stock, request, and mandate evidence;
7. an alternate seed where waiting would have lost the valid current deal.

The UI may add an **Opportunity horizon** panel showing current versus projected cost, evidence class, stock risk, and next recheck. Projections must look different from authoritative prices. The user may cancel the scheduled recheck, but this control must not change unrelated core constraints or consent.

### Optional evaluation

Cover confirmed, recurring, predicted, speculative, cancelled, and rescheduled promotions; birthday eligibility and stacking; a 20-day waiting window; stable, falling, unknown, and stale stock; mandate expiry before recheck; and beneficial versus harmful waits.

Report scheduled-recheck accuracy and **harmful-wait rate**: recommendations that would cause the user to miss a valid current deal without obtaining an equal or better valid deal within the stated deadline. These extension metrics supplement, but never replace, strike precision and false-buy rate.

## Additional feature — Voice brief intake

This is a stretch feature and must remain outside the authoritative core decision pipeline. Build it only after the complete current-offer path reaches its exit verification. The application must be able to disable or remove this feature without changing core contracts, decisions, purchase authorization, or the headline scenario.

The extension adds a spoken alternative to the existing text brief. It uses an OpenAI Realtime (audio) session with function-calling tools that call back into the existing `BriefInterpreter`/`ShoppingRequestSchema` (`src/ai/openai-brief-interpreter.ts`, `src/domain/contracts/index.ts`) rather than duplicating brief-interpretation logic. The model may ask about missing or ambiguous facts and read back a draft interpretation, including a draft mandate summary, but no tool exposed to the model may set a request's `lifecycle` to `ACTIVE`, create, or confirm a mandate. Activation and mandate consent still require an explicit, non-voice confirmation in the UI, identical to the existing text-brief flow.

### Optional modules and contracts

```text
src/additional/voice-intake/
  contracts.ts   VoiceSession, VoiceTurn, VoiceCollectedDraft
  session.ts     Realtime session lifecycle, audio streaming
  tools.ts       function-calling bridge to interpretShoppingBrief and to
                 reading unresolvedAmbiguities/the mandate draft
```

Optional contracts should contain:

- `VoiceSession`: id, nullable requestId, status (`ACTIVE`, `ENDED`), started/ended timestamps;
- `VoiceTurn`: role, transcript text, timestamp, and the associated model response identifier, so the full conversation is auditable like any other AI-derived claim;
- `VoiceCollectedDraft`: a pointer to the in-progress `ShoppingRequest` draft, kept separate from any confirmed, active version.

If no microphone or API key is available, the existing text-brief path works unchanged — this feature is fully optional and feature-flagged, like the opportunity horizon.

## 12. Delivery phases and exit criteria

### How to use this checklist

- Work through phases in order unless a task is explicitly independent.
- Change `[ ]` to `[x]` only when the task is implemented and its relevant tests or manual verification pass.
- Do not check a phase's **Exit verification** until every task in that phase is checked and the stated end-to-end behavior has been demonstrated.
- If implementation changes the intended behavior, update this plan and its verification criterion in the same change.
- Keep partially completed tasks unchecked; add a short nested note describing what remains instead of treating partial work as finished.

### Phase 0 — Decisions and skeleton

- [x] Record the agreed technology stack and deployment target.
- [x] Choose the headline demo product and destination.
- [x] Define and document the simplified tax and duty rules.
- [x] Define the product-match policy for alerts and automatic purchases.
- [x] Define mandate creation, expiry, revocation, and consumption semantics.
- [x] Scaffold the application with strict TypeScript settings.
- [ ] Configure shared Zod schemas, the test runner, and the database.
  - Shared Zod schemas and SQLite/Drizzle are configured. Automated test runners are intentionally excluded by repository guidance.
- [x] Define and validate the deterministic scenario-fixture format.
- [x] **Exit verification:** Load one fixture event, validate it, store it, and display it in the application.

### Phase 1 — Trusted domain core

- [x] Implement integer-minor-unit money values and explicit rounding behavior.
- [x] Implement versioned FX conversion with rate timestamps and freshness rules.
- [x] Implement coupon validation, applicability, exclusions, and stacking rules.
- [x] Implement the scoped delivery, tax, duty, and handling-fee calculation.
- [ ] Implement deterministic eligibility and lowest-landed-cost selection across `offer x delivery option x applicable coupon set`, including the no-coupon path and a default prohibition on cart padding.
- [x] Implement hard-requirement evaluation with `PASS`, `FAIL`, and `UNKNOWN` results.
- [x] Implement the decision outcomes, precedence rules, and stable reason codes.
- [x] Implement the structured, immutable decision record.
- [ ] Add unit tests for exact-cap, below-cap, above-cap, rounding, invalid-coupon, and unknown-evidence boundaries.
  - Automated tests are prohibited by repository guidance; exact-cap, above-cap, unavailable, unknown, stale, duplicate, valid-mandate, and revoked-mandate boundaries were verified through deterministic manual smoke checks.
- [ ] **Exit verification:** Deterministic tests prove that no above-cap offer or offer with an unknown purchase-critical fact can produce `BUY_SIMULATED`.

### Phase 2 — Complete alert journey

- [ ] Implement Zod-validated natural-language brief interpretation.
- [ ] Add confirmation and ambiguity handling before a request becomes active.
- [ ] Create the canonical demo catalog and disclose its seeded mappings and aliases.
- [ ] Implement exact-identifier, seeded, normalized, attribute-level, and AI-assisted matching stages.
- [ ] Persist provenance for every AI-derived matching claim.
- [x] Implement the seeded simulator, virtual clock, event playback, pause, step, and reset.
- [ ] Implement the authoritative offer-evaluation application service.
  - Typed matching, verification, pricing, policy, receipt, idempotency, and atomic persistence orchestration is implemented in `CheckpointApplication`; loading the active request version from persistence and scoping decisions by request version/run still remain.
- [x] Generate concise and expanded receipts from the same decision record.
- [ ] Build the request, offer timeline, verification, landed-cost, and decision UI.
  - Request, current event, requirement checks, landed cost, decision, and receipt views are implemented. A complete multi-event timeline remains.
- [ ] Add the complete headline alert scenario and its automated scenario test.
  - The deterministic `REJECT` at EUR 81.60 followed by `ALERT` at EUR 76.40 passes manual production smoke checks. Automated tests remain prohibited by repository guidance.
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
- [ ] Add conditional-delivery scenarios covering free-shipping thresholds, before/after-discount threshold bases, membership-only shipping, courier versus locker/pickup, expired quotes, and a coupon that makes the final delivered price worse.
- [ ] Add seller-legitimacy and marketplace/reseller scenarios.
- [x] Implement notification fingerprints and meaningful-improvement deduplication.
- [ ] Ensure runtime evaluation cannot access scenario ground-truth labels.
- [ ] Freeze at least 25 adversarial and boundary scenarios.
- [x] Calculate strike precision, false-buy rate, purchase count, recall, escalation rate, duplicate-alert rate, and cost-calculation exactness.
- [ ] Add regression tests for every discovered false alert, false purchase, missed deal, or incorrect escalation.
- [ ] **Exit verification:** Run the frozen evaluation set and meet the agreed metric targets, including a 0% false-buy rate with a non-zero purchase count.

### Optional stretch track — Time-aware opportunity planning

These tasks implement the additional feature described above. They do not block any phase exit verification and should begin only after Phase 2's complete alert journey is stable.

- [ ] Freeze separate `FutureOpportunity`, `OpportunityRecommendation`, and `ScheduledRecheck` contracts without changing the core decision enum.
- [ ] Define timing preferences, future-event evidence classes, cancellation rules, and the harmful-wait metric.
- [ ] Add mocked promotion-calendar, birthday-eligibility, Vinted-style used-listing, scheduled-recheck, and stock-change events.
- [ ] Implement post-evaluation opportunity comparison and idempotent scheduled rechecks.
- [ ] Build the optional opportunity-horizon panel with a strong current-versus-projected visual distinction.
- [ ] Add beneficial-wait, harmful-wait, 20-day birthday-promotion, stock-risk, cancelled-promotion, and mandate-expiry scenarios.
- [ ] Report scheduled-recheck accuracy and harmful-wait rate separately from core metrics.
- [ ] **Optional verification:** Disable the feature and prove the core journey is unchanged; enable it and run the deterministic 20-day extension without allowing it to authorize or delay a purchase.

### Optional stretch track — Voice brief intake

These tasks implement the additional feature described above. They do not block any phase exit verification and should begin only after Phase 2's complete alert journey is stable.

- [ ] Freeze `VoiceSession`, `VoiceTurn`, and `VoiceCollectedDraft` contracts without changing the core decision enum or `ShoppingRequestSchema`.
- [ ] Implement an OpenAI Realtime session with function-calling tools that only read or propose a draft request/mandate.
- [ ] Reuse the existing `BriefInterpreter` for structured extraction instead of a second interpretation path.
- [ ] Build a recording/transcript indicator and a mandatory explicit UI confirmation step before activation or mandate consent.
- [ ] Verify the no-microphone/no-API-key fallback leaves the text-brief path fully functional.
- [ ] **Optional verification:** Disable the feature and prove the core journey and all four checkpoints are unchanged; enable it and complete the headline scenario starting from a spoken brief instead of typed text, with activation still gated on an explicit UI confirmation.

### Phase 5 — Demo polish

- [ ] Finalize scenario selection, virtual-time controls, and visible event progression.
- [ ] Polish visual hierarchy for requirements, evidence, decisions, costs, and consent.
- [x] Verify concise receipts at a glance and expanded audit details on demand.
- [ ] Build the evaluation dashboard with metric definitions and per-scenario failures.
- [ ] Add a reliable clean-state reset command and documented demo runbook.
- [ ] Test the complete demo from a clean checkout on the presentation machine.
- [ ] Prepare a recorded fallback demonstration.
- [ ] Rehearse the final narrative within the available presentation time.
- [ ] **Exit verification:** Run the complete request-to-rejection-to-alert-or-purchase narrative deterministically in a few minutes from a clean checkout.

## 13. Three-person asynchronous work split

The three tracks should communicate through frozen Zod contracts and fixtures, not by importing one another's unfinished implementation. Each person can build and test against stubs, while Person C continuously integrates completed slices into the application.

### Shared contract checkpoint — all three people

Time-box this checkpoint to the beginning of the project. Agree on names and shapes before dividing into separate branches or worktrees.

- [x] Freeze the first versions of `ShoppingRequest`, `Mandate`, `OfferSnapshot`, `EvidenceBundle`, `MatchAssessment`, `LandedCost`, `DecisionRecord`, `SimulationEvent`, and `SimulatedOrder` as shared Zod schemas and inferred TypeScript types.
- [x] Agree on stable identifiers, timestamps, currency representation, `PASS`/`FAIL`/`UNKNOWN`, decision outcomes, and primary reason codes.
- [x] Create one valid headline fixture and one deliberately rejected fixture that conform to the contracts.
- [x] Create typed interfaces for the services each track supplies, with temporary in-memory stubs where implementation is not ready.
- [x] Assign Person A as the shared-contract custodian; contract changes require agreement from affected owners and must remain backward-compatible during a convergence checkpoint.
- [ ] **Exit verification:** All three tracks compile against the same contracts and can run their initial tests without importing another track's private modules.

### Person A — Trust core and evaluation

Owns authoritative business judgment. This track contains no UI, database, simulator, or OpenAI dependencies.

Primary ownership:

```text
src/domain/contracts/
src/domain/pricing/
src/domain/verification/
src/domain/policy/
src/domain/notifications/
src/domain/audit/
tests/unit/
tests/evals/
```

Checklist:

- [x] Implement money, rounding, FX, delivery, tax, duty, fees, and coupon rules.
- [ ] Own `DeliveryOption` eligibility and the deterministic global selection of the lowest valid landed-cost path across merchants, delivery methods, and applicable coupon sets; never satisfy a threshold by adding unauthorized items.
- [x] Implement product-requirement, seller, stock, discount, evidence-freshness, and landed-cost checks.
- [x] Implement deterministic decision precedence for `IGNORE`, `REJECT`, `ESCALATE`, `ALERT`, and `BUY_SIMULATED` eligibility.
- [x] Implement mandate scope validation and the pure pre-purchase authorization function.
- [x] Implement notification fingerprints and meaningful-improvement rules.
- [x] Implement the immutable decision record and deterministic concise/expanded receipt projections.
- [ ] Build boundary-heavy unit tests and the evaluation metric calculator.
  - The evaluation metric calculator is implemented. Automated unit tests remain intentionally excluded by repository guidance; deterministic manual boundary checks pass.
- [x] Publish pure test fixtures and service functions that Persons B and C can consume.
- [ ] **Track verification:** Domain tests prove that above-cap, hard-mismatch, unavailable, stale-critical, and `UNKNOWN` purchase-critical offers never become purchase-eligible.

Person A can begin immediately after the shared contract checkpoint using handcrafted offer and evidence fixtures. Person A is the primary owner of delivery-option optimization because it is authoritative pricing and policy logic. Person B supplies structured merchant delivery quotes, eligibility evidence, and adversarial fixtures through the shared contracts; Person C only orchestrates the service and renders its persisted winning path and rejected alternatives.

### Person B — Intelligence, catalog, and simulator

Owns conversion of messy human and merchant inputs into structured evidence. This track never decides whether money may be spent.

Primary ownership:

```text
src/domain/brief/
src/domain/catalog/
src/domain/matching/
src/ai/
src/simulator/
tests/scenarios/
```

Checklist:

- [x] Implement Zod-validated shopping-brief interpretation with explicit ambiguities.
- [x] Build the canonical demo catalog, aliases, exact identifiers, normalized attributes, and disclosed seeded mappings.
- [x] Implement staged exact, seeded, normalized, attribute-level, and AI-assisted matching.
- [x] Persist prompt/schema/model versions and evidence provenance in every AI-derived `MatchAssessment`.
- [x] Add deterministic cached outputs or a non-AI fallback for the headline demo.
- [x] Implement the seeded virtual clock and play, pause, step, reset, and speed controls as services.
- [x] Author the headline event stream and at least 25 adversarial scenario fixtures with hidden ground truth.
- [x] Ensure runtime outputs contain only evidence and match assessments, never `ALERT` or `BUY_SIMULATED` decisions.
- [x] Publish a fixture-backed simulator adapter and matching service for Person C.
- [x] **Track verification:** The same seed produces the same event sequence, and manual matching smoke checks distinguish exact, fuzzy, contradictory, and unresolved identities with traceable evidence. Automated tests remain excluded by repository guidance.

Person B can begin immediately after the shared contract checkpoint using a stub policy response supplied through the shared interface.

### Person C — Application, persistence, UI, and integration

Owns the executable product and convergence of the other tracks. This track orchestrates services but does not duplicate their business rules.

Primary ownership:

```text
src/app/
src/application/
src/db/
tests/e2e/
```

Checklist:

- [x] Scaffold Next.js, shared styling/components, SQLite/Drizzle, migrations, and repository adapters.
- [ ] Implement request creation, interpreted-brief confirmation, activation, pause, and revocation flows.
- [ ] Implement `evaluate-offer.ts` using typed matching, verification, pricing, policy, audit, and persistence interfaces.
  - The application orchestration and atomic `saveEvaluation` port are implemented under `CheckpointApplication`; active-request lookup/version scoping must be completed before this item can be checked.
- [ ] Implement serialized `recheck-and-buy.ts`, idempotent simulated-order storage, and mandate consumption.
- [ ] Build request, simulator controls, event timeline, verification, landed-cost, decision, mandate, and receipt views.
  - Request, controls, current event, checks, landed cost, decision, and receipt are present. Full timeline and mandate/purchase views remain.
- [ ] Build the evaluation dashboard from Person A's metrics and Person B's ground-truth scenarios.
- [x] Maintain in-memory stubs for unavailable Person A or B services so UI and orchestration work can continue asynchronously.
- [ ] Replace stubs with real adapters at each convergence checkpoint and add a contract test for every replacement.
  - Real verification, landed-cost, policy, notification, and receipt services are integrated. Matching still uses the fixture adapter, and automated contract tests remain prohibited by repository guidance.
- [ ] Own the clean-state reset command, demo runbook, Playwright journey, and final rehearsal.
  - Reset command and local run instructions exist and pass in a stopped, single-process environment. Multi-process reset safety, a committed Playwright journey, and final rehearsal remain.
- [ ] **Track verification:** The app can run the full headline journey first with stubs and then with real services, without changing UI-facing contracts.
  - The headline journey passes with real Person A services and fixture matching. Real Person B brief/matching integration remains.

Person C can begin immediately after the shared contract checkpoint using one fixed event fixture, one fixed decision record, and in-memory repositories.

### Optional feature ownership — after the core alert journey

If the team activates the time-aware additional feature:

- Person A owns the pure recommendation and harmful-wait evaluation rules under `src/additional/opportunity/`; these rules cannot authorize purchases or alter the core decision enum.
- Person B owns mocked promotion, birthday, resale, stock-risk, and virtual-time recheck fixtures under the additional scenario directory.
- Person C owns optional persistence, scheduler wiring, feature flag, and the opportunity-horizon UI.
- All three owners must prove that disabling the feature leaves core contracts, scenario outputs, and the headline demo unchanged.

If the team activates the voice brief intake feature:

- Person C owns the Realtime session integration, feature flag, and the recording/transcript/explicit-confirmation UI under `src/additional/voice-intake/`.
- Person B owns the function-calling tool definitions and prompt used during the conversation, as a natural extension of `src/ai/`.
- Person A has no role in this feature; it never touches pricing, verification, or policy.
- All three owners must prove that disabling the feature leaves the text-brief flow, core contracts, and the headline demo unchanged.

### Convergence checkpoints

Do not wait until all three tracks are finished. Merge or rebase frequently, but integrate only at these stable interfaces.

#### Checkpoint 1 — Compiling skeleton

- [x] Person B emits a fixture `ShoppingRequest`, `MatchAssessment`, and `SimulationEvent`.
- [x] Person A accepts fixture evidence and emits a fixture `DecisionRecord`.
- [x] Person C renders those records and persists them through in-memory adapters.
- [x] **Checkpoint verification:** One event travels from simulator-shaped input to a rendered decision without `any`, duplicate schemas, or cross-track private imports.

#### Checkpoint 2 — Real alert slice

- [ ] Integrate real brief interpretation and matching from Person B.
- [x] Integrate real landed cost and alert policy from Person A.
- [x] Persist and display the real decision receipt through Person C.
- [ ] **Checkpoint verification:** The headline scenario rejects its first deceptive offers and produces one valid `ALERT` with exact arithmetic and evidence.

#### Checkpoint 3 — Controlled purchase slice

- [ ] Integrate mandate validation and authorization from Person A.
- [ ] Feed current stock, coupon, FX, and offer events from Person B into the recheck.
- [ ] Integrate transaction, revocation, idempotency, and purchase UI from Person C.
- [ ] **Checkpoint verification:** The valid mandate buys once; expired, revoked, consumed, changed, or uncertain conditions block purchase.

#### Optional checkpoint — Time-aware opportunity slice

- [ ] Person B emits a confirmed future promotion, a used resale listing, a stock drop, and the scheduled virtual-time trigger.
- [ ] Person A produces a separate opportunity recommendation only when timing and risk rules permit it; the core decision still rejects any hard condition mismatch.
- [ ] Person C persists the scheduled recheck and shows current versus projected cost without presenting the projection as guaranteed.
- [ ] **Optional verification:** The same deterministic timeline re-evaluates after 20 virtual days using current evidence; an alternate seed identifies a harmful wait, and disabling the extension leaves Checkpoints 1–3 unchanged.

#### Optional checkpoint — Voice brief intake slice

- [ ] Person C wires a Realtime session that collects a spoken brief and mandate draft through Person B's function-calling tools.
- [ ] The headline scenario runs end to end starting from a spoken brief, with activation still gated on an explicit UI confirmation, not a spoken one.
- [ ] **Optional verification:** Disabling the feature leaves the text-brief flow and Checkpoints 1–3 unchanged.

#### Checkpoint 4 — Evaluation and demo freeze

- [ ] Run Person B's frozen scenarios through the integrated application.
- [ ] Calculate Person A's metrics and inspect every failure.
- [ ] Fix contract and integration defects, then freeze prompts, policies, fixtures, and demo seed.
- [ ] Complete Person C's Playwright journey and clean-state demo rehearsal.
- [ ] **Checkpoint verification:** The frozen suite meets the agreed targets and the complete demo runs from a clean checkout within the presentation time.

### Branch and collaboration rules

- Use one branch or worktree per track, for example `feat/trust-core`, `feat/intelligence-simulator`, and `feat/product-integration`.
- Keep shared contracts in small, separately reviewed commits so all tracks can cherry-pick or merge them early.
- Do not edit another person's owned directories without coordinating first.
- Prefer fixture and contract-test commits over verbal descriptions of an unfinished interface.
- Keep commits small enough to merge at every convergence checkpoint.
- Person C is the integration owner, not the sole debugger; the owner of a failing service fixes its behavior or contract test.
- Check a task only after its implementation and track verification pass, following the checklist rules in Section 12.

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

### Additional-feature risks

- **A future promotion is treated as guaranteed:** classify evidence explicitly; keep projected costs separate from authoritative landed cost; require current re-evaluation at activation time.
- **Waiting loses a valid deal:** cap the optional waiting horizon, use fresh stock evidence, define cancellation conditions, and measure harmful-wait rate.
- **Birthday promotion leaks personal data:** store only the minimum eligibility fact and validity window needed for the scenario; do not place a birth date in receipts or logs.
- **A cheap used listing weakens `new only`:** the core condition check remains authoritative; the additional feature may surface the rejected listing but cannot reinterpret the constraint.
- **Stretch work threatens the core demo:** keep the extension feature-flagged, separate from core contracts, and removable without migrations or policy changes.
- **Voice transcription error is treated as a hard constraint or as purchase consent:** the voice session may only propose a draft request/mandate; activation and mandate consent still require an explicit, non-voice UI confirmation, and the full transcript is stored for audit.

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

### Additional-feature decisions

Decide these only if the team has capacity after the core alert journey is stable:

1. **Timing preference:** may the extension suggest waiting for the best expected price before a deadline, or only schedule confirmed promotion rechecks?
2. **Future evidence:** which event classes may create a recheck, how long may it wait, and what stock evidence cancels the recommendation?
3. **Birthday offers:** how is eligibility represented without retaining unnecessary personal data, and may user-specific coupons stack?
4. **Used listing presentation:** should a rejected Vinted-style offer be shown as an explanatory comparison, or omitted after the core `new only` rejection?
5. **Extension target:** acceptable harmful-wait rate and scheduled-recheck accuracy without changing core metric targets.

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

### Optional extension defaults

Only after the core recommendations above are implemented and verified:

- enable the opportunity layer behind a feature flag;
- use `best before deadline` only as a suggestion policy, not a core purchase decision;
- limit scheduled rechecks to confirmed or versioned recurring events;
- add the mocked 20-day birthday-promotion arc with a used Vinted-style interruption and stock-risk change;
- report scheduled-recheck accuracy and harmful-wait rate separately from core metrics.
