# Person B verification

Automated tests are intentionally excluded by repository guidance. Run these checks after Person B changes.

## Required commands

Use Node.js 20+ and pnpm 11:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm db:reset
```

## Manual intelligence smoke check

1. Interpret the headline brief with the deterministic interpreter and confirm:
   - budget is EUR 80.00 delivered;
   - size is EU 43 and condition is new;
   - missing destination is a blocking ambiguity instead of an invented country;
   - mandate intent remains confirmation-required, spans EUR 75.00–80.00, and requires low stock.
2. Run the staged matcher against the named fixtures and inspect the trace:
   - `exact-identifier-valid` → `EXACT_IDENTIFIER/PASS`;
   - `seeded-alias-valid` → `SEEDED_CATALOG/PASS`;
   - `normalized-token-valid` → `NORMALIZED/PASS`;
   - `ai-assisted-valid` → `AI_ASSISTED/PASS` with claim provenance;
   - `conflicting-exact-identifiers` and `wrong-size` → `FAIL`;
   - `missing-identity-unresolved` → `UNRESOLVED/UNKNOWN`.
3. Load the fixture scenario source twice and confirm it reports one headline plus 31 adversarial scenarios and returns identical event JSON for the same scenario seed/version.
4. Exercise the simulator service:
   - play then pause before the first event and confirm no event is emitted;
   - step and confirm exactly sequence 0 is emitted;
   - reset and confirm cursor 0, paused status, start time, and speed 1;
   - raise speed, play to completion, and confirm event contents/order do not change.

## Browser smoke check

1. Start from `pnpm db:reset` and run `pnpm dev`.
2. Open <http://localhost:3000> and reset the scenario.
3. Step through all five headline events.
4. Confirm the first four observed offers show the staged match method, per-stage evidence, canonical identity where resolved, and computed provenance.
5. Confirm the final stock update changes the simulator timeline without Person B emitting a decision.
