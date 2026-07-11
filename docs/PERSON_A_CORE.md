# Person A trust core

The trust core is the deterministic authority between structured merchant evidence and application actions. Runtime code must not import evaluation ground truth.

## Implemented modules

- `src/domain/pricing/`: integer-minor-unit landed cost, explicit FX rounding and freshness, coupons and stacking, and scoped fixed tax/duty/handling charges.
- `src/domain/verification/`: seller, stock, condition, destination, coupon, and discount evidence normalization into `PASS`, `FAIL`, or `UNKNOWN`.
- `src/domain/policy/`: fixed decision precedence and pure mandate authorization. `BUY_SIMULATED` requires every authorization check to pass.
- `src/domain/notifications/`: stable product fingerprints plus once-only and meaningful-improvement suppression.
- `src/domain/audit/`: concise and expanded receipts projected from the immutable decision record.
- `evaluation/metrics.ts`: strike precision, false-buy rate, purchase count, recall, escalation, duplicate alert, cost exactness, explanation completeness, and per-event failures.

The application currently supplies Person B's fixture match assessment to real verification, pricing, policy, and receipt services. Purchase authorization is implemented as a pure function; Person C still owns loading the active mandate and performing the serialized recheck/order transaction.

## Manual verification — 2026-07-11

Automated tests are intentionally excluded by repository guidance. The following deterministic checks were run directly against the domain services:

| Case | Expected | Observed |
| --- | --- | --- |
| Headline GBP offer | EUR 81.60, `REJECT` | EUR 81.60, `REJECT` |
| Headline EUR offer | EUR 76.40, `ALERT` | EUR 76.40, `ALERT` |
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

The two-event headline evaluation reported 100% strike precision, 100% deal recall, 100% cost exactness, 100% explanation completeness, and no failures. Its false-buy rate is `null`, not zero, because that alert-only scenario contains no purchases.

Repository verification completed with `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm db:reset`, and `pnpm db:migrate`.
