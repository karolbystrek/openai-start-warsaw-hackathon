# Person A trust core

The trust core is the deterministic authority between structured merchant evidence and application actions. Runtime code must not import evaluation ground truth.

## Implemented modules

- `src/domain/pricing/`: integer-minor-unit landed cost, explicit FX rounding and freshness, coupons and stacking, and scoped fixed tax/duty/handling charges.
- `src/domain/verification/`: seller, stock, condition, destination, coupon, and discount evidence normalization into `PASS`, `FAIL`, or `UNKNOWN`.
- `src/domain/policy/`: fixed decision precedence and pure mandate authorization. `BUY_SIMULATED` requires every authorization check to pass.
- `src/domain/notifications/`: merchant-independent canonical product/variant fingerprints plus once-only and meaningful-improvement suppression.
- `src/domain/audit/`: concise and expanded receipts projected from the immutable decision record.
- `evaluation/metrics.ts`: strike precision, false-buy rate, purchase count, recall, escalation, duplicate alert, cost exactness, explanation completeness, and per-event failures. Duplicate, unexpected, and missing runtime decisions and incomplete cost ground truth are reported explicitly.

The application runs Person B's real staged matcher before the real verification, pricing, policy, and receipt services. Purchase authorization is implemented as a pure function; Person C still owns loading the active mandate and performing the serialized recheck/order transaction.

## Manual verification — 2026-07-11

Automated tests are intentionally excluded by repository guidance. `pnpm evaluate:trust-core` reproducibly runs the four-event headline, the frozen adversarial fixtures, eight mandate cases, and delivery/pricing boundary checks through the real domain services.

| Case | Expected | Observed |
| --- | --- | --- |
| Headline wrong variant | EUR 57.00, `REJECT` | EUR 57.00, `REJECT` |
| Headline GBP offer | EUR 81.60, `REJECT` | EUR 81.60, `REJECT` |
| Headline invalid coupon | EUR 82.00, `REJECT` | EUR 82.00, `REJECT` |
| Headline valid EUR offer | EUR 76.40, `ALERT` | EUR 76.40, `ALERT` |
| Exact EUR 80.00 cap | `ALERT` | `ALERT` |
| Hard size mismatch | `REJECT` | `REJECT` |
| Unavailable stock | `REJECT` | `REJECT` |
| Unknown stock | `ESCALATE` | `ESCALATE` |
| Stale critical evidence | `ESCALATE` | `ESCALATE` |
| Repeated once-only alert | `IGNORE` | `IGNORE` |
| Valid mandate | `BUY_SIMULATED` | `BUY_SIMULATED` |
| Revoked mandate | Must not buy | `ALERT` |
| Expired, consumed, or wrong-version mandate | Must not buy | `ALERT` in every case |
| Mandate requires low stock but stock is normal | Must not buy | `ALERT` |
| Mandate requires low stock and fresh evidence reports low | `BUY_SIMULATED` | `BUY_SIMULATED` |

The integrated 44-decision evaluation reported 100% strike precision, 100% deal recall, 100% cost exactness, 100% explanation completeness, no duplicate alerts, and no failures. It includes one authorized simulated purchase and reports a 0% false-buy rate; expired, revoked, consumed, wrong-version, wrong-merchant, unknown-stock, and changed-price cases never buy.

The runner additionally verifies no-coupon fallback, coupon stacking, before/after-discount thresholds, membership uncertainty, missing delivery prices, expired quotes, delivery deadlines, deterministic ties, global merchant selection, no cart padding, missing FX escalation, cross-record integrity, and per-item freshness. Repository verification passes lint, strict type-checking, production build, Drizzle schema validation, isolated migration, database reset, and the persisted four-event application smoke.
